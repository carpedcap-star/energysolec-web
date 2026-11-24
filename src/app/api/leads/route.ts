import { getStore } from '@/lib/data/store';
import { clientMeta, guard, json, verifyHuman } from '@/lib/request';
import { GenericLeadBody, firstError } from '@/lib/schemas';
import { notifySales, sendEmail, esc } from '@/lib/services/messaging';
import { SITE } from '@/lib/site';

export const runtime = 'nodejs';

/** Formularios de contacto, cotización, servicios, financiamiento, catálogos y capacitación → CRM. */
export async function POST(req: Request) {
  if (!(await guard('lead', 10, 3600))) return json({ error: 'Demasiadas solicitudes. Intenta más tarde.' }, 429);
  const p = GenericLeadBody.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: firstError(p.error) }, 400);
  const b = p.data;
  if (!(await verifyHuman(b.turnstileToken, b.website))) return json({ error: 'No pudimos verificar el envío.' }, 400);
  const store = getStore();
  const meta = await clientMeta();
  const lead = await store.createLead({
    full_name: b.name, email: b.email, phone: b.phone || null, company: b.company || null, segment: b.segment ?? null,
    province: b.province ?? null, city: b.city ?? null, monthly_bill_usd: b.monthlyBillUsd ?? null, source: b.source, utm: b.utm,
    notes: [b.topic && `Tema: ${b.topic}`, b.message].filter(Boolean).join('\n') || null,
  }, [{ purpose: 'privacidad_servicio', granted: true }, { purpose: 'comercial_marketing', granted: b.acceptMarketing }],
  { ipHash: meta.ipHash, ua: meta.ua, policyVersion: SITE.privacyPolicyVersion });
  await store.track('lead_created', { source: b.source, segment: b.segment });
  await Promise.allSettled([
    sendEmail({ to: b.email, template: 'confirmacion_solicitud', subject: 'Recibimos tu solicitud — Energy Solutions Ecuador',
      html: `<div style="font-family:Arial,sans-serif"><p>Hola ${esc(b.name)}, recibimos tu solicitud${b.topic ? ` sobre <b>${esc(b.topic)}</b>` : ''}. Un asesor te contactará pronto.</p><p>WhatsApp ${SITE.whatsappDisplay}</p></div>` }),
    notifySales(`Nuevo lead (${b.source}): ${b.name}`, [['Tema', b.topic], ['Segmento', b.segment], ['Empresa', b.company], ['Correo', b.email], ['WhatsApp', b.phone], ['Ciudad', b.city], ['Factura mensual', b.monthlyBillUsd], ['Mensaje', b.message]], `${SITE.url}/admin/leads/${lead.id}`),
  ]);
  return json({ ok: true });
}
