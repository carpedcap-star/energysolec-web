import { z } from 'zod';
import { PROVINCES } from '../ecuador';
import { rucProblem } from './trade';

/**
 * Cotización industrial: «selección de solución → carga de factura y documentos → registro de oportunidad →
 * asignación comercial → evaluación de ingeniería → contacto». Lógica pura y probada.
 */

export const INDUSTRIAL_SOLUTIONS = [
  { id: 'cubierta', label: 'Solar en cubierta industrial' },
  { id: 'suelo', label: 'Parque solar en suelo (ground mount)' },
  { id: 'flotante', label: 'Solar flotante' },
  { id: 'bess', label: 'Almacenamiento BESS' },
  { id: 'hibrido', label: 'Hibridación con generadores' },
  { id: 'media_tension', label: 'Subestación o interconexión en media/alta tensión' },
  { id: 'estudios', label: 'Estudios eléctricos' },
  { id: 'scada', label: 'SCADA y monitoreo' },
  { id: 'om', label: 'Operación y mantenimiento (O&M)' },
] as const;
export type IndustrialSolution = (typeof INDUSTRIAL_SOLUTIONS)[number]['id'];

export const SECTORS = ['Industria manufacturera', 'Empacadora', 'Camaronera', 'Agroindustria', 'Planta productiva', 'Comercio a gran escala', 'Inversionista energético', 'Otro'] as const;
export const VOLTAGE_LEVELS = [['bt', 'Baja tensión'], ['mt', 'Media tensión'], ['at', 'Alta tensión'], ['no_se', 'No lo sé']] as const;
export const OPERATING_HOURS = [['diurno', 'Solo de día'], ['dos_turnos', 'Dos turnos'], ['continuo', '24 horas'], ['variable', 'Variable / estacional']] as const;

// ---------------------------------------------------------------- Documentos
export const DOC_KINDS = [
  { id: 'planilla', label: 'Planilla eléctrica' },
  { id: 'curva_carga', label: 'Curva de carga' },
  { id: 'plano', label: 'Plano o implantación' },
  { id: 'otro', label: 'Otro documento' },
] as const;
export type DocKind = (typeof DOC_KINDS)[number]['id'];

/** 4 MB por archivo: límite de cuerpo de las funciones de Vercel (4,5 MB). Los archivos pasan por el servidor. */
export const DOC_MAX_BYTES = 4 * 1024 * 1024;
export const DOC_MAX_FILES = 10;
/** Una carga sin solicitud se puede vincular durante 2 horas; las huérfanas se borran en la tarea diaria. */
export const DOC_LINK_WINDOW_MS = 2 * 3600e3;

export type DocType = { mime: string; ext: string; label: string; inline: boolean };
const TYPES: Record<string, DocType> = {
  pdf: { mime: 'application/pdf', ext: 'pdf', label: 'PDF', inline: true },
  jpg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPG', inline: true },
  png: { mime: 'image/png', ext: 'png', label: 'PNG', inline: true },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP', inline: true },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx', label: 'Excel', inline: false },
  csv: { mime: 'text/csv', ext: 'csv', label: 'CSV', inline: false },
  dwg: { mime: 'application/acad', ext: 'dwg', label: 'DWG', inline: false },
};

/**
 * Tipo por firma binaria, no por el nombre ni el Content-Type declarado. Excel solo como .xlsx (contenedor ZIP con la
 * firma PK); CSV solo texto sin bytes nulos ni de control y con separadores. Nunca HTML, SVG ni ejecutables.
 */
export function sniffIndustrialDoc(b: Uint8Array, filename: string): DocType | null {
  const at = (i: number, ...sig: number[]) => b.length >= i + sig.length && sig.every((x, j) => b[i + j] === x);
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return TYPES.pdf;
  if (at(0, 0xff, 0xd8, 0xff)) return TYPES.jpg;
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return TYPES.png;
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return TYPES.webp;
  if (ext === 'xlsx' && at(0, 0x50, 0x4b, 0x03, 0x04)) return TYPES.xlsx;
  if (ext === 'dwg' && at(0, 0x41, 0x43, 0x31, 0x30)) return TYPES.dwg; // «AC10xx»
  if (ext === 'csv' && b.length > 0) {
    const head = b.subarray(0, Math.min(b.length, 64 * 1024));
    if (head.some((x) => x === 0 || (x < 0x20 && x !== 0x09 && x !== 0x0a && x !== 0x0d))) return null;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(head);
    if (/^\s*</.test(text)) return null; // HTML o XML disfrazado
    return /[,;\t]/.test(text.split(/\r?\n/)[0] ?? '') ? TYPES.csv : null;
  }
  return null;
}

export function checkIndustrialDoc(bytes: Uint8Array, filename: string): DocType | string {
  if (!bytes.length) return 'El archivo está vacío.';
  if (bytes.length > DOC_MAX_BYTES) return `«${filename}» supera 4 MB. Comprímelo o envíalo después a tu asesor.`;
  return sniffIndustrialDoc(bytes, filename) ?? `«${filename}» no es un tipo admitido (PDF, JPG, PNG, WebP, Excel .xlsx, CSV o DWG).`;
}

/** Nombre seguro para mostrar y descargar: sin rutas ni caracteres de control, máximo 120 caracteres. */
export function safeFilename(name: string, ext: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').replace(/\s+/g, ' ').trim();
  const stem = base.replace(/\.[^.]*$/, '').slice(0, 110) || 'documento';
  return `${stem}.${ext}`;
}

// ---------------------------------------------------------------- Solicitud
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Teléfono no válido');
const num = (label: string, max: number) => z.union([z.number(), z.null()]).optional().transform((v) => v ?? null)
  .refine((v) => v == null || (Number.isFinite(v) && v > 0 && v <= max), `${label}: ingresa un número positivo`);

export const IndustrialRequest = z.object({
  solutions: z.array(z.enum(INDUSTRIAL_SOLUTIONS.map((s) => s.id) as [IndustrialSolution, ...IndustrialSolution[]])).min(1, 'Elige al menos una solución de interés').max(9),
  company: z.string().trim().min(2, 'Ingresa la razón social').max(160),
  ruc: z.string().trim().optional().default('').transform((s) => s.replace(/[\s.-]/g, '')).superRefine((s, ctx) => { if (s) { const p = rucProblem(s); if (p) ctx.addIssue({ code: 'custom', message: p }); } }).transform((s) => s || null),
  sector: z.enum(SECTORS, { message: 'Elige el sector' }),
  province: z.string().refine((p) => PROVINCES.some((x) => x.name === p), 'Elige la provincia'),
  city: z.string().trim().max(80).optional().default(''),
  monthlyKwh: num('Consumo mensual', 50_000_000),
  monthlyBillUsd: num('Factura mensual', 10_000_000),
  demandKw: num('Demanda', 500_000),
  voltage: z.enum(VOLTAGE_LEVELS.map(([v]) => v) as ['bt', 'mt', 'at', 'no_se']).default('no_se'),
  hours: z.enum(OPERATING_HOURS.map(([v]) => v) as ['diurno', 'dos_turnos', 'continuo', 'variable']).optional(),
  areaM2: num('Superficie disponible', 50_000_000),
  site: z.string().trim().max(120).optional().default(''),
  message: z.string().trim().max(2000).optional().default(''),
  documents: z.array(z.object({ id: z.uuid(), kind: z.enum(DOC_KINDS.map((d) => d.id) as [DocKind, ...DocKind[]]) })).max(DOC_MAX_FILES).default([]),
  name: z.string().trim().min(2, 'Ingresa tu nombre').max(120),
  position: z.string().trim().max(80).optional().default(''),
  email: z.string().trim().toLowerCase().email('Ingresa un correo válido').max(160),
  phone,
  acceptPrivacy: z.literal(true, { message: 'Debes aceptar la política de privacidad.' }),
  acceptMarketing: z.boolean().default(false),
  utm: z.record(z.string(), z.string().max(200)).optional().default({}),
  website: z.string().max(0).optional(),
  turnstileToken: z.string().max(2048).optional(),
}).superRefine((v, ctx) => {
  // Para evaluar hace falta algún dato de consumo: kWh, factura o al menos una planilla adjunta.
  if (!v.monthlyKwh && !v.monthlyBillUsd && !v.documents.some((d) => d.kind === 'planilla'))
    ctx.addIssue({ code: 'custom', path: ['monthlyKwh'], message: 'Indica tu consumo o factura mensual, o adjunta al menos una planilla.' });
  if (new Set(v.documents.map((d) => d.id)).size !== v.documents.length) ctx.addIssue({ code: 'custom', path: ['documents'], message: 'Documento repetido.' });
});
export type IndustrialRequest = z.infer<typeof IndustrialRequest>;

// ---------------------------------------------------------------- Evaluación de ingeniería
export const EVAL_STATUS = { pendiente: 'Pendiente de evaluación', en_evaluacion: 'En evaluación', evaluada: 'Evaluada', descartada: 'No viable' } as const;
export type EvalStatus = keyof typeof EVAL_STATUS;
export const EVAL_STYLE: Record<EvalStatus, string> = {
  pendiente: 'bg-amber-100 text-amber-900', en_evaluacion: 'bg-sky-100 text-sky-900', evaluada: 'bg-green-100 text-green-900', descartada: 'bg-surface text-muted',
};
const NEXT: Record<EvalStatus, EvalStatus[]> = {
  pendiente: ['en_evaluacion', 'evaluada', 'descartada'],
  en_evaluacion: ['evaluada', 'descartada', 'pendiente'],
  evaluada: ['en_evaluacion'],
  descartada: ['en_evaluacion'],
};
export const canEvalTransition = (from: EvalStatus, to: EvalStatus) => from === to || NEXT[from].includes(to);

export const EvaluationSchema = z.object({
  status: z.enum(Object.keys(EVAL_STATUS) as [EvalStatus, ...EvalStatus[]]),
  kwp: z.union([z.number(), z.null()]).transform((v) => v ?? null).refine((v) => v == null || (v > 0 && v <= 500_000), 'Potencia estimada no válida'),
  notes: z.string().trim().max(4000),
}).superRefine((v, ctx) => {
  if ((v.status === 'evaluada' || v.status === 'descartada') && v.notes.length < 10)
    ctx.addIssue({ code: 'custom', path: ['notes'], message: 'Registra el criterio de la evaluación (al menos una frase).' });
});
export type Evaluation = z.infer<typeof EvaluationSchema>;

export const solutionLabel = (id: string) => INDUSTRIAL_SOLUTIONS.find((s) => s.id === id)?.label ?? id;
export const docKindLabel = (id: string) => DOC_KINDS.find((d) => d.id === id)?.label ?? id;
export const canLinkDoc = (d: { request_id: string | null; created_at: string }, now = Date.now()) =>
  !d.request_id && now - Date.parse(d.created_at) <= DOC_LINK_WINDOW_MS;
