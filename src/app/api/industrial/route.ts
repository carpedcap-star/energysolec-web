import { getStore } from '@/lib/data/store';
import { clientMeta, guard, json, verifyHuman } from '@/lib/request';
import { firstError } from '@/lib/schemas';
import { canLinkDoc, docKindLabel, IndustrialRequest, OPERATING_HOURS, solutionLabel, VOLTAGE_LEVELS } from '@/lib/services/industrial';
import { esc, notifySales, sendEmail } from '@/lib/services/messaging';
import { getContact } from '@/lib/site-settings';
import { SITE } from '@/lib/site';

export const runtime = 'nodejs';

/** Registra la oportunidad industrial: lead (fuente cotización industrial) + solicitud con sus documentos. */
export async function POST(req: Request) {
  if (!(await guard('industrial', 5, 3600))) return json({ error: 'Demasiadas solicitudes. Intenta más tarde.' }, 429);
  const p = IndustrialRequest.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: firstError(p.error) }, 400);
  const b = p.data;
  if (!(await verifyHuman(b.turnstileToken, b.website))) return json({ error: 'No pudimos verificar el envío. Recarga la página.' }, 400);

  const store = getStore();
  // Cada documento debe existir, estar libre y ser reciente: un id ajeno o viejo no se puede vincular.
  for (const d of b.documents) {
    const m = await store.getIndustrialDocMeta(d.id);
    if (!m || !canLinkDoc(m)) return json({ error: 'Uno de los documentos ya no está disponible. Vuelve a adjuntarlo.' }, 409);
  }

  const meta = await clientMeta();
  const solutions = b.solutions.map(solutionLabel);
  const lead = await store.createLead({
    full_name: b.name, email: b.email, phone: b.phone, company: b.company, segment: 'industrial', province: b.province, city: b.city || null,
    monthly_kwh: b.monthlyKwh, monthly_bill_usd: b.monthlyBillUsd, source: 'cotizacion_industrial', utm: b.utm,
    notes: [`Cotización industrial: ${solutions.join(', ')}`, b.position && `Cargo: ${b.position}`, b.message].filter(Boolean).join('\n'),
  }, [{ purpose: 'privacidad_servicio', granted: true }, { purpose: 'comercial_marketing', granted: b.acceptMarketing }],
  { ipHash: meta.ipHash, ua: meta.ua, policyVersion: SITE.privacyPolicyVersion });

  const id = await store.createIndustrialRequest({
    lead_id: lead.id, solutions: b.solutions, company: b.company, ruc: b.ruc, sector: b.sector,
    details: { monthlyKwh: b.monthlyKwh, monthlyBillUsd: b.monthlyBillUsd, demandKw: b.demandKw, voltage: b.voltage, hours: b.hours ?? null,
      areaM2: b.areaM2, site: b.site, message: b.message, province: b.province, city: b.city, position: b.position },
  }, b.documents);
  await store.track('industrial_request', { solutions: b.solutions.length, documents: b.documents.length });

  const company = await getContact();
  const label = (list: readonly (readonly [string, string])[], v: string | undefined) => list.find(([k]) => k === v)?.[1] ?? null;
  await Promise.allSettled([
    sendEmail({ to: b.email, template: 'cotizacion_industrial', subject: 'Recibimos tu solicitud de cotización industrial — Energy Solutions Ecuador',
      html: `<div style="font-family:Arial,sans-serif"><p>Hola ${esc(b.name)},</p><p>Recibimos la solicitud de <b>${esc(b.company)}</b> (${esc(solutions.join(', '))})${b.documents.length ? ` con ${b.documents.length} documento(s)` : ''}. Un asesor y nuestro equipo de ingeniería la revisarán y te contactarán.</p><p>WhatsApp ${esc(company.whatsappDisplay)}</p></div>` }),
    notifySales(`Cotización industrial: ${b.company}`, [
      ['Soluciones', solutions.join(', ')], ['Sector', b.sector], ['Contacto', `${b.name}${b.position ? ` (${b.position})` : ''}`], ['Correo', b.email], ['Teléfono', b.phone],
      ['Ubicación', [b.city, b.province].filter(Boolean).join(', ')], ['Consumo mensual', b.monthlyKwh && `${b.monthlyKwh} kWh`], ['Factura mensual', b.monthlyBillUsd && `$${b.monthlyBillUsd}`],
      ['Demanda', b.demandKw && `${b.demandKw} kW`], ['Tensión', label(VOLTAGE_LEVELS, b.voltage)], ['Operación', label(OPERATING_HOURS, b.hours)],
      ['Documentos', b.documents.map((d) => docKindLabel(d.kind)).join(', ') || 'ninguno'],
    ], `${SITE.url}/admin/leads/${lead.id}`),
  ]);
  return json({ ok: true, id });
}
