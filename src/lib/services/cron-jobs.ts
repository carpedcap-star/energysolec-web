import 'server-only';
import { getStore } from '../data/store';
import type { OutboundMessage } from '../data/types';
import { renderStudyPdf } from '../pdf/report';
import { CACHE_TTL_DAYS, checkSources, REFERENCE_POINTS } from '../engine/resource';
import { SITE } from '../site';
import { afterFailure, billPurgeBefore, buildDigests, digestEmail, isExpired } from './followup';
import { deliverEmail, emailProviderConfigured, sendEmail } from './messaging';
import { salesNotifyEmail } from '../site-settings';

/**
 * Tareas programadas. Las ejecuta /api/cron (Vercel Cron u otro programador) y el botón del panel (/admin/mensajes).
 * Cada tarea es independiente: si una falla, las demás corren igual. El resumen solo lleva conteos.
 */
export const JOBS = ['mensajes', 'recordatorios', 'depuracion', 'fuentes'] as const;
export type Job = (typeof JOBS)[number];
type Summary = Record<string, number | string>;

/** Reintenta los correos en cola cuyo turno llegó. Sin proveedor de correo no hace nada (no gasta intentos). */
async function retryMessages(): Promise<Summary> {
  if (!emailProviderConfigured()) return { omitido: 'sin proveedor de correo' };
  const store = getStore();
  const out = { enviados: 0, reprogramados: 0, fallidos: 0, vencidos: 0, bloqueados: 0 };
  // Hasta 4 tandas de 25 por ejecución para no exceder la duración de la función.
  for (let round = 0; round < 4; round++) {
    const batch = await store.claimDueMessages(25);
    if (!batch.length) break;
    for (const m of batch) await retryOne(m, out);
  }
  return out;
}

async function retryOne(m: OutboundMessage, out: Record<string, number>) {
  const store = getStore();
  const now = Date.now();
  if (isExpired(m, now)) { out.vencidos++; return store.finishMessage(m.id, { status: 'error', error: 'Vencido: ya no tenía sentido enviarlo', clearBody: true }); }
  if (!m.payload?.html) { out.fallidos++; return store.finishMessage(m.id, { status: 'error', error: 'Sin cuerpo guardado' }); }
  // El consentimiento de marketing se vuelve a comprobar: pudo revocarse mientras el correo esperaba.
  if (m.is_marketing && !(await store.hasMarketingConsent(m.to_address))) { out.bloqueados++; return store.finishMessage(m.id, { status: 'bloqueado_sin_consentimiento', clearBody: true }); }
  try {
    const attachments = [];
    for (const a of m.payload.attachments ?? []) {
      if (a.kind !== 'study_pdf') continue;
      const study = await store.getStudyByCode(a.code);
      const lead = study?.lead_id ? await store.getLead(study.lead_id) : null;
      if (!study || !lead) throw new Error(`No se pudo regenerar el PDF del estudio ${a.code}`);
      attachments.push({ filename: `Estudio-${a.code}.pdf`, content: await renderStudyPdf({ ...study, unlocked: true }, { name: lead.full_name, email: lead.email, company: lead.company ?? null, phone: lead.phone ?? null }) });
    }
    await deliverEmail({ to: m.to_address, subject: m.payload.subject, html: m.payload.html, attachments });
    out.enviados++;
    await store.finishMessage(m.id, { status: 'enviado', clearBody: true });
  } catch (e) {
    const next = afterFailure(m.attempts, now);
    if (next.status === 'error') out.fallidos++; else out.reprogramados++;
    // El cuerpo se conserva en «error» para poder reintentarlo a mano desde el panel.
    await store.finishMessage(m.id, { status: next.status, error: String(e).slice(0, 500), next_attempt_at: next.status === 'pendiente' ? next.next_attempt_at : null });
  }
}

/** Resumen diario por asesor; los leads sin asesor van al correo comercial (panel → Configuración, o SALES_NOTIFY_EMAIL). */
async function sendReminders(): Promise<Summary> {
  const store = getStore();
  const [leads, users] = await Promise.all([store.listLeadsForReminders(), store.listUsers()]);
  const digests = buildDigests(leads, Date.now());
  const salesTo = await salesNotifyEmail();
  const out = { resumenes: 0, actividades: 0, sin_contactar: 0, sin_destinatario: 0 };
  const marks: { id: string; reminded_for?: string; uncontacted?: boolean }[] = [];
  for (const d of digests) {
    const advisor = d.advisorId ? users.find((u) => u.id === d.advisorId && u.active) : null;
    // Asesor desactivado o sin asignar: el resumen va al correo comercial general.
    const to = advisor?.email ?? salesTo;
    if (!to) { out.sin_destinatario++; continue; }
    const mail = digestEmail(advisor ? d : { ...d, advisorId: null }, advisor?.full_name ?? 'equipo comercial', SITE.url);
    await sendEmail({ to, template: 'recordatorio_seguimiento', ...mail });
    out.resumenes++; out.actividades += d.due.length; out.sin_contactar += d.uncontacted.length;
    for (const i of d.due) marks.push({ id: i.id, reminded_for: i.when });
    for (const i of d.uncontacted) marks.push({ id: i.id, uncontacted: true });
  }
  // Se marca aunque el correo quede en cola: la cola lo reintenta, y así no se repite el mismo aviso cada día.
  if (marks.length) await store.markLeadReminders(marks);
  return out;
}

async function purge(): Promise<Summary> {
  const store = getStore();
  // Caché solar: más allá del doble de su vigencia ya no sirve ni como respaldo.
  const solarBefore = new Date(Date.now() - 2 * CACHE_TTL_DAYS * 86_400e3).toISOString();
  // Documentos industriales que nunca se vincularon a una solicitud (el visitante no envió el formulario): 24 h.
  const orphanBefore = new Date(Date.now() - 24 * 3600e3).toISOString();
  const [planillas, limites, solar, documentos] = await Promise.all([store.purgeBillUploads(billPurgeBefore(Date.now())), store.pruneRateLimits(), store.clearSolarCache(solarBefore), store.purgeOrphanIndustrialDocs(orphanBefore)]);
  return { planillas_borradas: planillas, limites_limpiados: limites, cache_solar_borrada: solar, documentos_huerfanos_borrados: documentos };
}

/** Verificación diaria en vivo de PVGIS-NSRDB, PVGIS-ERA5 y NASA POWER en Guayaquil (3 consultas, sin caché). */
async function verifySources(): Promise<Summary> {
  const r = await checkSources(fetch, [REFERENCE_POINTS[0]]);
  const bad = r.filter((x) => !x.ok);
  return { fuentes_ok: r.length - bad.length, fuentes_con_falla: bad.length, ...(bad.length ? { detalle: bad.map((x) => `${x.source}: ${x.error}`).join(' | ').slice(0, 300) } : {}) };
}

const RUN: Record<Job, () => Promise<Summary>> = { mensajes: retryMessages, recordatorios: sendReminders, depuracion: purge, fuentes: verifySources };

export async function runJobs(trigger: 'cron' | 'panel', actor: string | null, jobs: readonly Job[] = JOBS) {
  const store = getStore();
  const id = await store.startCronRun(trigger, actor);
  const summary: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const j of jobs) {
    try { summary[j] = await RUN[j](); }
    catch (e) { summary[j] = { error: 'falló' }; errors.push(`${j}: ${(e as Error).message}`.slice(0, 300)); console.error(`[cron] ${j}`, e); }
  }
  await store.finishCronRun(id, { ok: errors.length === 0, summary, error: errors.join(' | ') || null });
  return { ok: errors.length === 0, summary, errors };
}
