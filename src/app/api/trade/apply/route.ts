import { getStore } from '@/lib/data/store';
import { clientMeta, guard, json, verifyHuman } from '@/lib/request';
import { TURNSTILE_ACTIONS } from '@/lib/turnstile';
import { firstError } from '@/lib/schemas';
import { TradeApplication, tierLabel } from '@/lib/services/trade';
import { notifySales, sendEmail, esc } from '@/lib/services/messaging';
import { SITE } from '@/lib/site';

export const runtime = 'nodejs';

/** Solicitud pública de cuenta comercial. Queda PENDIENTE: no da acceso a precios hasta que Gerencia la apruebe. */
export async function POST(req: Request) {
  if (!(await guard('trade_apply', 5, 3600))) return json({ error: 'Demasiadas solicitudes. Intenta más tarde.' }, 429);
  const p = TradeApplication.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: firstError(p.error) }, 400);
  const b = p.data;
  if (!(await verifyHuman(b.turnstileToken, b.website, TURNSTILE_ACTIONS.trade))) return json({ error: 'No pudimos verificar el envío. Recarga la página.' }, 400);

  const store = getStore();
  // Chequeo previo para no crear un lead duplicado; la base lo vuelve a imponer con índices únicos.
  const live = (await store.listTradeAccounts()).filter((t) => t.status !== 'rechazada');
  if (live.some((t) => t.email === b.email)) return json({ error: 'Ya existe una solicitud o cuenta con ese correo. Si olvidaste tu contraseña, recupérala desde «Ingresar».' }, 409);
  if (live.some((t) => t.ruc === b.ruc)) return json({ error: 'Ya existe una solicitud o cuenta con ese RUC. Escríbenos si necesitas agregar otra persona de contacto.' }, 409);

  const meta = await clientMeta();
  const lead = await store.createLead({
    full_name: b.contact_name, email: b.email, phone: b.phone, company: b.company, segment: 'comercial', city: b.city,
    source: 'cuenta_comercial', utm: {}, notes: `Solicitud de cuenta de ${tierLabel(b.tier).toLowerCase()} · RUC ${b.ruc}${b.notes ? `\n${b.notes}` : ''}`,
  }, [{ purpose: 'privacidad_servicio', granted: true }, { purpose: 'comercial_marketing', granted: b.acceptMarketing }],
  { ipHash: meta.ipHash, ua: meta.ua, policyVersion: SITE.privacyPolicyVersion });

  let id: string;
  try {
    id = await store.createTradeApplication({ company: b.company, ruc: b.ruc, tier: b.tier, contact_name: b.contact_name, email: b.email, phone: b.phone, city: b.city, notes: b.notes || null }, lead.id);
  } catch (e) { return json({ error: (e as Error).message }, 409); }
  await store.track('trade_application', { tier: b.tier });

  await Promise.allSettled([
    sendEmail({ to: b.email, template: 'solicitud_cuenta_comercial', subject: 'Recibimos tu solicitud de cuenta comercial — Energy Solutions Ecuador',
      html: `<div style="font-family:Arial,sans-serif"><p>Hola ${esc(b.contact_name)},</p><p>Recibimos la solicitud de cuenta de <b>${esc(tierLabel(b.tier).toLowerCase())}</b> para <b>${esc(b.company)}</b>. Nuestro equipo la revisará y te escribirá a este correo. Si se aprueba, recibirás un enlace para activar tu acceso y ver los precios de tu nivel.</p></div>` }),
    notifySales(`Solicitud de cuenta comercial: ${b.company}`, [['Tipo', tierLabel(b.tier)], ['RUC', b.ruc], ['Contacto', b.contact_name], ['Correo', b.email], ['Teléfono', b.phone], ['Ciudad', b.city]], `${SITE.url}/admin/cuentas/${id}`),
  ]);
  return json({ ok: true });
}
