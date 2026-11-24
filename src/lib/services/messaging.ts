import 'server-only';
import { getStore } from '../data/store';

type Attachment = { filename: string; content: Buffer };

/**
 * Correo transaccional vía Resend. Si no hay clave, el mensaje queda en cola (outbound_messages)
 * como "pendiente" para no perder la comunicación. Los correos de marketing exigen consentimiento.
 */
export async function sendEmail(opts: { to: string; subject: string; html: string; template: string; attachments?: Attachment[]; marketing?: boolean }) {
  const store = getStore();
  if (opts.marketing && !(await store.hasMarketingConsent(opts.to))) {
    await store.queueMessage({ channel: 'email', to: opts.to, template: opts.template, payload: { subject: opts.subject }, status: 'bloqueado_sin_consentimiento' });
    return { sent: false, reason: 'sin_consentimiento' as const };
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await store.queueMessage({ channel: 'email', to: opts.to, template: opts.template, payload: { subject: opts.subject }, status: 'pendiente', error: 'RESEND_API_KEY no configurada' });
    return { sent: false, reason: 'sin_proveedor' as const };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? 'Energy Solutions Ecuador <estudios@energysolec.com>',
        to: [opts.to], subject: opts.subject, html: opts.html,
        attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    await store.queueMessage({ channel: 'email', to: opts.to, template: opts.template, payload: { subject: opts.subject }, status: 'enviado' });
    return { sent: true as const };
  } catch (e) {
    await store.queueMessage({ channel: 'email', to: opts.to, template: opts.template, payload: { subject: opts.subject }, status: 'error', error: String(e) });
    return { sent: false, reason: 'error' as const };
  }
}

export async function notifySales(subject: string, lines: [string, string | number | null | undefined][], link?: string) {
  const to = process.env.SALES_NOTIFY_EMAIL;
  if (!to) return;
  const rows = lines.filter(([, v]) => v != null && v !== '').map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0"><b>${esc(String(v))}</b></td></tr>`).join('');
  await sendEmail({ to, subject, template: 'aviso_comercial', html: `<div style="font-family:Arial,sans-serif"><h2 style="margin:0 0 12px">${esc(subject)}</h2><table>${rows}</table>${link ? `<p><a href="${link}">Abrir en el panel</a></p>` : ''}</div>` });
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
