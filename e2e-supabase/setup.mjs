// Crea los usuarios del panel (uno por rol) en el Supabase de prueba antes de levantar el servidor.
// Solo para la pila LOCAL de `supabase start`: se niega a correr contra cualquier otra URL.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(url)) {
  console.error(`[e2e-supabase] NEXT_PUBLIC_SUPABASE_URL debe ser la pila local (http://127.0.0.1:54321), no ${url || '(vacía)'}.`);
  process.exit(1);
}
export const PASSWORD = 'Panel-Prueba-2026';
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = (await admin.auth.admin.listUsers({ perPage: 1000 })).data?.users ?? [];
for (const role of ['superadmin', 'gerencia', 'ventas', 'marketing', 'ingenieria', 'compras']) {
  const email = `${role}@sb.test`;
  let id = all.find((u) => u.email === email)?.id;
  if (!id) {
    const r = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (r.error) throw r.error;
    id = r.data.user.id;
  }
  const p = await admin.from('profiles').upsert({ id, email, full_name: `Prueba ${role}`, role, active: true, is_advisor: role === 'ventas' });
  if (p.error) throw p.error;
}
console.log('[e2e-supabase] usuarios del panel listos');
