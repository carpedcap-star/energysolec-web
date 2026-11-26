import 'server-only';
import { getStore } from '../data/store';
import type { AttachmentRef } from '../data/types';
import { afterFailure, isRetryable } from './followup';
import { salesNotifyEmail } from '../site-settings';

type Attachment = { filename: string; content: Buffer };
export const emailProviderConfigured = () => !!process.env.RESEND_API_KEY;

/** Envío directo por Resend. Lanza Error si falla. Lo usan sendEmail y el reintento de la cola. */
export async function deliverEmail(m: { to: string; subject: string; html: string; attachments?: Attachment[] }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY no configurada');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? 'Energy Solutions Ecuador <estudios@energysolec.com>',
      to: [m.to], subject: m.subject, html: m.html,
      attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

/**
 * Correo vía Resend. Si falla o no hay proveedor, queda en la cola (outbound_messages) con su cuerpo para que la tarea
 * programada lo reintente (/api/cron), salvo los correos con enlaces de acceso (ver isRetryable). Los adjuntos no se
 * guardan: se indican con `attachmentRefs` y se regeneran al reintentar. Los correos de marketing exigen consentimiento.
 */
export async function sendEmail(opts: { to: string; subject: string; html: string; template: string; attachments?: Attachment[]; attachmentRefs?: AttachmentRef[]; marketing?: boolean }) {
  const store = getStore();
  const base = { channel: 'email' as const, to: opts.to, template: opts.template, is_marketing: !!opts.marketing };
  if (opts.marketing && !(await store.hasMarketingConsent(opts.to))) {
    await store.queueMessage({ ...base, payload: { subject: opts.subject }, status: 'bloqueado_sin_consentimiento' });
    return { sent: false, reason: 'sin_consentimiento' as const };
  }
  const retry = isRetryable(opts.template);
  const body = { subject: opts.subject, html: opts.html, ...(opts.attachmentRefs?.length ? { attachments: opts.attachmentRefs } : {}) };
  if (!emailProviderConfigured()) {
    await store.queueMessage(retry
      ? { ...base, payload: body, status: 'pendiente', error: 'RESEND_API_KEY no configurada', next_attempt_at: new Date().toISOString() }
      : { ...base, payload: { subject: opts.subject }, status: 'error', error: 'RESEND_API_KEY no configurada (enlace de acceso: no se guarda)' });
    return { sent: false, reason: 'sin_proveedor' as const };
  }
  try {
    await deliverEmail(opts);
    await store.queueMessage({ ...base, payload: { subject: opts.subject }, status: 'enviado', attempts: 1 });
    return { sent: true as const };
  } catch (e) {
    const next = afterFailure(1, Date.now());
    await store.queueMessage(retry
      ? { ...base, payload: body, status: next.status, error: String(e).slice(0, 500), attempts: 1, next_attempt_at: next.status === 'pendiente' ? next.next_attempt_at : null }
      : { ...base, payload: { subject: opts.subject }, status: 'error', error: String(e).slice(0, 500), attempts: 1 });
    return { sent: false, reason: 'error' as const };
  }
}

export async function notifySales(subject: string, lines: [string, string | number | null | undefined][], link?: string) {
  const to = await salesNotifyEmail();
  if (!to) return;
  const rows = lines.filter(([, v]) => v != null && v !== '').map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0"><b>${esc(String(v))}</b></td></tr>`).join('');
  await sendEmail({ to, subject, template: 'aviso_comercial', html: `<div style="font-family:Arial,sans-serif"><h2 style="margin:0 0 12px">${esc(subject)}</h2><table>${rows}</table>${link ? `<p><a href="${link}">Abrir en el panel</a></p>` : ''}</div>` });
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
