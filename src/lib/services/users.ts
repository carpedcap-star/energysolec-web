import { z } from 'zod';
import type { AppRole, StaffUser, StaffUserInput } from '../data/types';

/** Usuarios del panel: validación, contraseñas y reglas que evitan quedarse sin acceso. */

export const ROLES: { id: AppRole; label: string; description: string }[] = [
  { id: 'superadmin', label: 'Superadministrador', description: 'Todo, incluida la gestión de usuarios.' },
  { id: 'gerencia', label: 'Gerencia', description: 'Lectura total, CRM, pedidos, verificación de pagos, indicadores y parámetros.' },
  { id: 'marketing', label: 'Marketing', description: 'Contenido, blog, marcas, servicios, proyectos y lectura de leads.' },
  { id: 'ventas', label: 'Ventas', description: 'Sus leads asignados y pedidos.' },
  { id: 'ingenieria', label: 'Ingeniería', description: 'Proyectos, tarifas y parámetros de cálculo.' },
  { id: 'compras', label: 'Compras', description: 'Productos, precios, inventario, marcas y pedidos.' },
];
export const roleLabel = (r: AppRole) => ROLES.find((x) => x.id === r)?.label ?? r;

/** Qué significa cada permiso de PERMS, para la matriz de roles. */
export const PERM_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', leads: 'Ver leads (CRM)', leads_edit: 'Gestionar leads', orders: 'Pedidos', verify_payment: 'Verificar pagos',
  params: 'Parámetros de cálculo', tariffs: 'Tarifas eléctricas', stats: 'Indicadores de portada', export: 'Exportar datos',
  products: 'Productos e inventario', projects: 'Proyectos', content: 'Contenido del sitio', brands: 'Marcas', brand_docs: 'Respaldos de marcas',
  services: 'Servicios', blog: 'Blog', users_read: 'Ver usuarios', users: 'Gestionar usuarios', identity: 'Identidad gráfica', bills: 'Planillas de clientes', trade: 'Cuentas comerciales', trade_approve: 'Aprobar cuentas comerciales', messages: 'Mensajes y tareas', assign_leads: 'Asignar asesores',
};

export const UserSchema = z.object({
  full_name: z.string().trim().min(3, 'Ingresa el nombre completo').max(120),
  email: z.string().trim().toLowerCase().email('Correo no válido').max(160),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Teléfono no válido').nullable(),
  role: z.enum(['superadmin', 'gerencia', 'marketing', 'ventas', 'ingenieria', 'compras'], { message: 'Elige un rol' }),
  is_advisor: z.boolean(),
  active: z.boolean(),
});

export function parseUserForm(fd: FormData): { data: StaffUserInput } | { error: string } {
  const s = (k: string) => { const v = fd.get(k); return typeof v === 'string' ? v.trim() : ''; };
  const p = UserSchema.safeParse({
    full_name: s('full_name'), email: s('email'), phone: s('phone') || null, role: s('role'),
    is_advisor: fd.get('is_advisor') === 'on',
    // Una casilla desmarcada no se envía: «active_field» indica que el formulario la incluía (edición).
    active: fd.has('active_field') ? fd.get('active') === 'on' : true,
  });
  return p.success ? { data: p.data as StaffUserInput } : { error: p.error.issues[0]?.message ?? 'Datos no válidos' };
}

/** Política de contraseñas: largo suficiente, variedad mínima y sin repetir el correo. */
export function passwordProblem(pw: string, email?: string): string | null {
  if (pw.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (pw.length > 128) return 'La contraseña es demasiado larga.';
  if (!/[a-zA-ZñÑ]/.test(pw) || !/\d/.test(pw)) return 'Usa letras y al menos un número.';
  if (/^(.)\1+$/.test(pw)) return 'La contraseña no puede ser un solo carácter repetido.';
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && pw.toLowerCase().includes(local)) return 'La contraseña no puede contener tu correo.';
  return null;
}

/**
 * Reglas para editar un usuario: nadie cambia su propio rol ni se desactiva, y siempre
 * queda al menos un superadministrador activo. Devuelve el motivo del rechazo o null.
 */
export function roleChangeProblem(target: StaffUser, next: Pick<StaffUser, 'role' | 'active'>, actorId: string, all: StaffUser[]): string | null {
  if (target.id === actorId && (next.role !== target.role || !next.active)) return 'No puedes cambiar tu propio rol ni desactivar tu cuenta. Pídeselo a otro superadministrador.';
  const losesSuper = target.role === 'superadmin' && target.active && (next.role !== 'superadmin' || !next.active);
  if (losesSuper && !all.some((u) => u.id !== target.id && u.role === 'superadmin' && u.active)) return 'Debe quedar al menos un superadministrador activo.';
  return null;
}
