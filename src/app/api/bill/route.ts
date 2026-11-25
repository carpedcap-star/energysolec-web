import { getStore } from '@/lib/data/store';
import { clientMeta, guard, json, verifyHuman } from '@/lib/request';
import { BILL_CONSENT_VERSION, BILL_LIMITS, checkBillFile, sanitizeExtraction, toCalculatorInput } from '@/lib/services/bill';
import { billAiEnabled, extractBill } from '@/lib/services/bill-extractor';
import { SITE } from '@/lib/site';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Tope diario de lecturas en todo el sitio: cada lectura tiene un costo de IA. Configurable con BILL_DAILY_MAX. */
const dailyMax = () => Math.max(1, Number(process.env.BILL_DAILY_MAX) || 200);

/**
 * Recibe la planilla (PDF o foto), la lee con IA y devuelve una PROPUESTA de datos de consumo para que el cliente la
 * revise. No devuelve ni guarda datos personales de la planilla. Solo se guarda el archivo si la lectura sirvió.
 */
export async function POST(req: Request) {
  if (!billAiEnabled()) return json({ error: 'La lectura de planillas no está disponible. Ingresa tus datos manualmente.' }, 503);
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > BILL_LIMITS.pdf + 256 * 1024) return json({ error: 'El archivo supera el máximo de 4 MB.' }, 413);
  if (!(await guard('bill', 5, 3600))) return json({ error: 'Alcanzaste el máximo de planillas por hora. Ingresa tus datos manualmente.' }, 429);

  const fd = await req.formData().catch(() => null);
  if (!fd) return json({ error: 'Solicitud no válida.' }, 400);
  if (!(await verifyHuman(String(fd.get('turnstileToken') ?? '') || undefined, String(fd.get('website') ?? '') || undefined)))
    return json({ error: 'No pudimos verificar el envío. Recarga la página.' }, 400);
  // LOPDP: la planilla tiene datos personales y la procesa un tercero; el consentimiento es previo y específico.
  if (fd.get('consent') !== 'on') return json({ error: 'Para leer tu planilla necesitamos tu autorización.' }, 400);
  const mode = fd.get('mode') === 'profesional' ? 'profesional' : 'rapida';
  const file = fd.get('file');
  if (!(file instanceof File)) return json({ error: 'Selecciona el archivo de tu planilla.' }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = checkBillFile(bytes);
  if (typeof type === 'string') return json({ error: type }, 400);

  const store = getStore();
  if (!(await store.rateLimit('bill:global', dailyMax(), 86_400)))
    return json({ error: 'La lectura de planillas está saturada por hoy. Ingresa tus datos manualmente.' }, 429);

  const r = await extractBill(bytes, type);
  if (!r.ok) {
    await store.track('bill_failed', { reason: r.reason });
    return json({ error: r.message }, r.reason === 'busy' ? 503 : 422);
  }
  const data = sanitizeExtraction(r.data);
  const proposal = toCalculatorInput(data, mode);
  // Sin datos útiles no se conserva el archivo (minimización de datos).
  if ('error' in proposal) { await store.track('bill_failed', { reason: 'no_data' }); return json({ error: proposal.error }, 422); }

  const meta = await clientMeta();
  let uploadId: string;
  try {
    uploadId = await store.saveBillUpload({
      bytes, mime: type.mime, ext: type.ext,
      extracted: { ai: r.data, read: data, consent: { version: BILL_CONSENT_VERSION, policy: SITE.privacyPolicyVersion, at: new Date().toISOString(), ip_hash: meta.ipHash } },
    });
  } catch (e) {
    console.error('[planilla] no se pudo guardar', e);
    return json({ error: 'No pudimos guardar tu planilla. Ingresa tus datos manualmente.' }, 500);
  }
  await store.track('bill_read', { mode, input: proposal.input });
  return json({
    uploadId, proposal,
    read: { distributor: data.distributorRaw, tariffCategory: data.tariffCategory, billingPeriod: data.billingPeriod, energyKwh: data.energyKwh, electricityUsd: data.electricityUsd, totalUsd: data.totalUsd, demandKw: data.demandKw, months: data.history.length },
  });
}
