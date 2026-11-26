import type { Lead, LeadStage } from '../data/types';

/**
 * Reintento de correos y recordatorios de seguimiento. Lógica pura (sin red ni base de datos) para poder probarla;
 * la ejecutan las tareas programadas de src/lib/services/cron-jobs.ts.
 */

// ---------------------------------------------------------------- Zona horaria
/** Ecuador continental: UTC−5 todo el año (sin horario de verano). */
export const EC_OFFSET = '-05:00';
export const EC_TZ = 'America/Guayaquil';

/**
 * Interpreta el valor de un <input type="datetime-local"> («2026-11-26T09:00») como hora de Ecuador.
 * Sin esto, el servidor (UTC en Vercel) lo leería como 09:00 UTC = 04:00 en Ecuador.
 */
export function parseEcLocal(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return null;
  const d = new Date(`${v.length === 16 ? `${v}:00` : v}${EC_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** Inversa, para precargar el campo: ISO → «AAAA-MM-DDTHH:MM» en hora de Ecuador. */
export function toEcLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) - 5 * 3600e3);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16);
}
export const fmtEc = (iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) =>
  new Intl.DateTimeFormat('es-EC', { ...opts, timeZone: EC_TZ }).format(new Date(iso));
/** Fin del día calendario de Ecuador que contiene `now`. */
export function endOfEcDay(now: number): number {
  const local = new Date(now - 5 * 3600e3);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23, 59, 59, 999) + 5 * 3600e3;
}

// ---------------------------------------------------------------- Cola de correos
export const MAX_ATTEMPTS = 5;
/** Espera tras cada intento fallido: 5 min, 30 min, 2 h, 12 h; al quinto fallo el mensaje queda en «error». */
const BACKOFF_MS = [5 * 60e3, 30 * 60e3, 2 * 3600e3, 12 * 3600e3];

/** `attempts`: intentos ya hechos, contando el que acaba de fallar. */
export function afterFailure(attempts: number, now: number): { status: 'pendiente'; next_attempt_at: string } | { status: 'error' } {
  if (attempts >= MAX_ATTEMPTS) return { status: 'error' };
  const wait = BACKOFF_MS[Math.max(0, Math.min(attempts, BACKOFF_MS.length) - 1)];
  return { status: 'pendiente', next_attempt_at: new Date(now + wait).toISOString() };
}

/**
 * Correos con enlaces de acceso de un solo uso: NO se guardan para reintentar. El cuerpo contiene el token, que
 * cualquiera con acceso a la cola podría usar, y el panel ya muestra el enlace a quien lo generó si el correo falla.
 */
const NOT_RETRYABLE = new Set(['invitacion_panel', 'acceso_panel', 'cuenta_comercial_aprobada', 'cuenta_comercial_acceso']);
export const isRetryable = (template: string) => !NOT_RETRYABLE.has(template);

/** Vigencia de un correo en cola: pasado este tiempo ya no tiene sentido enviarlo (queda en «error», vencido). */
export function messageTtlHours(template: string): number {
  if (template === 'recordatorio_seguimiento' || template === 'lead_asignado') return 20;
  if (template === 'aviso_comercial') return 24;
  return 72;
}
export const isExpired = (m: { template: string; created_at: string }, now: number) =>
  now - Date.parse(m.created_at) > messageTtlHours(m.template) * 3600e3;

// ---------------------------------------------------------------- Recordatorios de seguimiento
const CLOSED: LeadStage[] = ['ganado', 'perdido'];
/** Horas que puede esperar un lead nuevo sin primer contacto antes de alertar. */
export const UNCONTACTED_SLA_HOURS = 24;

export type ReminderLead = Pick<Lead, 'id' | 'full_name' | 'company' | 'stage' | 'advisor_id' | 'next_activity_at' | 'next_activity_note' | 'first_contact_at' | 'created_at' | 'source'>
  & { next_activity_reminded_for?: string | null; uncontacted_alerted_at?: string | null };

export type DigestItem = { id: string; name: string; when?: string; note?: string | null; overdue?: boolean };
export type Digest = { advisorId: string | null; due: DigestItem[]; uncontacted: DigestItem[] };

/**
 * Leads que hay que recordar hoy, agrupados por asesor (null = sin asignar). Cada actividad se recuerda una sola vez
 * (`next_activity_reminded_for` guarda la fecha recordada; si el asesor la cambia, se vuelve a recordar), y cada lead
 * nuevo sin contactar se alerta una sola vez.
 */
export function buildDigests(leads: ReminderLead[], now: number): Digest[] {
  const until = endOfEcDay(now);
  const map = new Map<string | null, Digest>();
  const get = (a: string | null) => { let d = map.get(a); if (!d) map.set(a, d = { advisorId: a, due: [], uncontacted: [] }); return d; };
  for (const l of leads) {
    if (CLOSED.includes(l.stage)) continue;
    const name = l.company ? `${l.full_name} (${l.company})` : l.full_name;
    const at = l.next_activity_at ? Date.parse(l.next_activity_at) : NaN;
    if (!Number.isNaN(at) && at <= until && l.next_activity_reminded_for !== l.next_activity_at)
      get(l.advisor_id ?? null).due.push({ id: l.id, name, when: l.next_activity_at!, note: l.next_activity_note, overdue: at < now });
    if (l.stage === 'nuevo' && !l.first_contact_at && !l.uncontacted_alerted_at && now - Date.parse(l.created_at) > UNCONTACTED_SLA_HOURS * 3600e3)
      get(l.advisor_id ?? null).uncontacted.push({ id: l.id, name, when: l.created_at });
  }
  for (const d of map.values()) d.due.sort((a, b) => (a.when ?? '').localeCompare(b.when ?? ''));
  return [...map.values()].filter((d) => d.due.length || d.uncontacted.length);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Correo del resumen. Todo texto del lead se escapa: viene de formularios públicos. */
export function digestEmail(d: Digest, recipientName: string, panelUrl: string): { subject: string; html: string } {
  const n = d.due.length + d.uncontacted.length;
  const row = (i: DigestItem, extra: string) => `<li style="margin:6px 0"><a href="${esc(panelUrl)}/admin/leads/${encodeURIComponent(i.id)}">${esc(i.name)}</a> — ${extra}</li>`;
  const due = d.due.map((i) => row(i, `${i.overdue ? '<b style="color:#b91c1c">vencida</b> ' : ''}${esc(fmtEc(i.when!))}${i.note ? ` · ${esc(i.note)}` : ''}`)).join('');
  const unc = d.uncontacted.map((i) => row(i, `ingresó el ${esc(fmtEc(i.when!, { dateStyle: 'medium' }))}`)).join('');
  return {
    subject: `Seguimiento comercial: ${n} ${n === 1 ? 'pendiente' : 'pendientes'}${d.advisorId ? '' : ' sin asesor asignado'}`,
    html: `<div style="font-family:Arial,sans-serif;color:#282626"><p>Hola ${esc(recipientName)},</p>`
      + (due ? `<p><b>Actividades para hoy o vencidas</b></p><ul>${due}</ul>` : '')
      + (unc ? `<p><b>Leads nuevos sin primer contacto (más de ${UNCONTACTED_SLA_HOURS} h)</b></p><ul>${unc}</ul>` : '')
      + (d.advisorId ? '' : '<p>Estos leads no tienen asesor: asígnalos desde el CRM.</p>')
      + `<p style="color:#666;font-size:12px">Resumen automático del CRM de Energy Solutions Ecuador.</p></div>`,
  };
}

// ---------------------------------------------------------------- Depuración
/** Planillas sin lead (no confirmadas o cuyo estudio nunca se desbloqueó) se borran a los 7 días (minimización, LOPDP). */
export const BILL_RETENTION_DAYS = 7;
export const billPurgeBefore = (now: number) => new Date(now - BILL_RETENTION_DAYS * 86_400e3).toISOString();

// ---------------------------------------------------------------- Resumen de ejecución
const JOB_LABEL: Record<string, string> = { mensajes: 'Correos', recordatorios: 'Recordatorios', depuracion: 'Depuración', fuentes: 'Fuentes solares' };
const SUMMARY_LABEL: Record<string, string> = {
  enviados: 'enviados', reprogramados: 'reprogramados', fallidos: 'fallidos', vencidos: 'vencidos', bloqueados: 'sin consentimiento',
  resumenes: 'resúmenes', actividades: 'actividades', sin_contactar: 'sin contactar', sin_destinatario: 'sin destinatario',
  planillas_borradas: 'planillas borradas', limites_limpiados: 'límites limpiados', cache_solar_borrada: 'celdas de caché solar borradas', documentos_huerfanos_borrados: 'documentos sin solicitud borrados',
  fuentes_ok: 'correctas', fuentes_con_falla: 'con falla',
};
/** «Correos: 2 enviados · Recordatorios: 1 resúmenes, 3 actividades · …» para el panel. */
export function summaryText(s: Record<string, unknown> | null | undefined): string {
  if (!s) return '—';
  return Object.entries(s).map(([job, v]) => {
    const parts = Object.entries((v ?? {}) as Record<string, unknown>)
      .filter(([, n]) => typeof n !== 'number' || n > 0)
      .map(([k, n]) => (typeof n === 'number' ? `${n} ${SUMMARY_LABEL[k] ?? k}` : String(n)));
    return `${JOB_LABEL[job] ?? job}: ${parts.join(', ') || 'sin cambios'}`;
  }).join(' · ');
}
