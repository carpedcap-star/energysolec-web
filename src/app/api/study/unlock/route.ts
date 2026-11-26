import { getStore } from '@/lib/data/store';
import { clientMeta, guard, json, verifyHuman } from '@/lib/request';
import { TURNSTILE_ACTIONS } from '@/lib/turnstile';
import { UnlockBody, firstError } from '@/lib/schemas';
import { studyToken } from '@/lib/token';
import { renderStudyPdf } from '@/lib/pdf/report';
import { sendEmail, notifySales, esc } from '@/lib/services/messaging';
import { SITE } from '@/lib/site';
import { getContact } from '@/lib/site-settings';
import { fmtKwp, fmtUsd } from '@/lib/format';
import type { StudyInput } from '@/lib/engine/study';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await guard('unlock', 10, 3600))) return json({ error: 'Demasiadas solicitudes. Intenta más tarde.' }, 429);
  const parsed = UnlockBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: firstError(parsed.error) }, 400);
  const b = parsed.data;
  if (!(await verifyHuman(b.turnstileToken, b.website, TURNSTILE_ACTIONS.study))) return json({ error: 'No pudimos verificar el envío. Recarga la página.' }, 400);

  const store = getStore();
  const study = await store.getStudyByCode(b.code);
  if (!study) return json({ error: 'Estudio no encontrado' }, 404);
  const input = study.inputs as StudyInput;
  const r = study.results;
  const base = r.scenarios.base;

  let leadId = study.lead_id;
  if (!leadId) {
    const meta = await clientMeta();
    const lead = await store.createLead({
      full_name: b.name, email: b.email, phone: b.phone || null, company: b.company || null,
      segment: input.segment, province: input.province, city: input.city || null,
      monthly_kwh: Math.round(r.consumption.annualKwh / 12), monthly_bill_usd: input.monthlyBillUsd ?? Math.round(base.billBeforeYear / 12),
      recommended_kwp: r.sizing.kwp, estimated_investment_usd: Math.round(base.capex.total), source: 'calculadora', utm: b.utm,
    }, [
      { purpose: 'privacidad_servicio', granted: true },
      { purpose: 'comercial_marketing', granted: b.acceptMarketing },
    ], { ipHash: meta.ipHash, ua: meta.ua, policyVersion: SITE.privacyPolicyVersion });
    leadId = lead.id;
    await store.unlockStudy(b.code, lead.id);
    await store.track('lead_created', { source: 'calculadora', segment: input.segment });

    // Entregas posteriores: no bloquean la respuesta al usuario si fallan
    const token = studyToken(b.code);
    const link = `${SITE.url}/calculadora/estudio/${b.code}?t=${token}`;
    const company = await getContact();
    Promise.resolve().then(async () => {
      const pdf = await renderStudyPdf({ ...study, unlocked: true }, { name: b.name, email: b.email, company: b.company || null, phone: b.phone || null });
      await sendEmail({
        to: b.email, template: 'estudio_solar', subject: `Tu estudio energético ${b.code} — Energy Solutions Ecuador`,
        attachments: [{ filename: `Estudio-${b.code}.pdf`, content: pdf }], attachmentRefs: [{ kind: 'study_pdf', code: b.code }],
        html: `<div style="font-family:Arial,sans-serif;color:#282626"><h2>Hola ${esc(b.name)},</h2><p>Adjuntamos tu estudio de prefactibilidad solar <b>${b.code}</b>.</p>
          <p>Sistema recomendado: <b>${fmtKwp(r.sizing.kwp)}</b> · Inversión estimada: <b>${fmtUsd(base.capex.total)}</b> · Ahorro año 1: <b>${fmtUsd(base.savingYear1)}</b></p>
          <p><a href="${link}">Ver el estudio en línea</a></p><p style="color:#666;font-size:12px">${esc(r.disclaimer)}</p>
          <p>Energy Solutions Ecuador · WhatsApp ${company.whatsappDisplay}</p></div>`,
      });
      await notifySales(`Nuevo lead calculadora: ${b.name} (${input.segment})`, [
        ['Estudio', b.code], ['Empresa', b.company], ['Correo', b.email], ['WhatsApp', b.phone], ['Provincia', input.province],
        ['Consumo mensual', `${Math.round(r.consumption.annualKwh / 12)} kWh`], ['Potencia', fmtKwp(r.sizing.kwp)], ['Inversión', fmtUsd(base.capex.total)],
        ['Autoriza comunicaciones comerciales', b.acceptMarketing ? 'Sí' : 'No'],
      ], `${SITE.url}/admin/leads/${leadId}`);
    }).catch((e) => console.error('post-unlock', e));
  }

  return json({ results: r, token: studyToken(b.code), leadId });
}
