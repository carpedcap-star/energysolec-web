import { StudyInput } from '@/lib/engine/study';
import type { StudyInput as StudyInputT } from '@/lib/engine/study';
import { runStudy } from '@/lib/engine/study';
import { getSolarResource } from '@/lib/engine/resource';
import { effectiveCostTariff, selectTariff } from '@/lib/services/tariff-select';
import { getStore, solarResourceCache } from '@/lib/data/store';
import { PROVINCES } from '@/lib/ecuador';
import { guard, json } from '@/lib/request';
import { firstError } from '@/lib/schemas';
import { canConfirmBill, isBillUploadId } from '@/lib/services/bill';

export const runtime = 'nodejs';

/** Ejecuta el cálculo y guarda el estudio BLOQUEADO. Solo devuelve un adelanto mínimo. */
export async function POST(req: Request) {
  if (!(await guard('study', 20, 3600))) return json({ error: 'Demasiadas solicitudes. Intenta más tarde.' }, 429);
  const body = await req.json().catch(() => null);
  const parsed = StudyInput.safeParse(body);
  if (!parsed.success) return json({ error: firstError(parsed.error) }, 400);
  const input = parsed.data;
  if (!PROVINCES.some((p) => p.name === input.province)) return json({ error: 'Provincia no válida' }, 400);

  try {
    return await calculate(input, body);
  } catch (e) {
    // Ninguna incompatibilidad de datos o tarifa debe llegar al cliente como un error 500 sin explicación.
    console.error('[estudio] no se pudo calcular', e);
    return json({ error: 'No pudimos calcular tu estudio con los datos de esta planilla. Revisa el consumo y la ubicación, o escríbenos por WhatsApp y un asesor lo preparará contigo.' }, 422);
  }
}

async function calculate(input: StudyInputT, body: unknown) {
  const prov = PROVINCES.find((p) => p.name === input.province)!;
  const store = getStore();
  const params = await store.getActiveParams();
  const monthlyRef = input.monthlyKwh ?? (input.monthlyHistoryKwh ? input.monthlyHistoryKwh.reduce((a, b) => a + b, 0) / 12 : undefined);
  // Tarifa especial no transcrita (p. ej. bombeo de agua): costo efectivo de la planilla, nunca otra categoría.
  if (input.specialTariff && !(input.serviceUsd && monthlyRef))
    return json({ error: `Tu tarifa (${input.specialTariff}) es especial y necesitamos el valor del servicio eléctrico y el consumo en kWh de tu planilla para estimar tu ahorro. Escríbenos por WhatsApp y un asesor lo revisará contigo.` }, 422);
  // Pliego oficial ARCONEL por distribuidora (de la planilla o sugerida por ubicación) y categoría.
  const tariff = input.specialTariff ? effectiveCostTariff({
    category: input.specialTariff, kwh: input.monthlyKwh ?? monthlyRef!, serviceUsd: input.serviceUsd!, energyUsd: input.energyChargesUsd,
    distributor: input.distributor, province: input.province, city: input.city, p: params,
  }) : selectTariff({
    segment: input.segment, province: input.province, city: input.city, distributor: input.distributor, tariffKey: input.tariffCode,
    monthlyKwh: input.monthlyKwh ?? (input.monthlyHistoryKwh ? input.monthlyHistoryKwh.reduce((a, b) => a + b, 0) / 12 : undefined), demandKw: input.demandKw, p: params,
  });

  const lat = input.lat ?? prov.lat, lng = input.lng ?? prov.lng;
  const resource = await getSolarResource(lat, lng, input.tilt, prov.region, params, fetch, solarResourceCache());
  if (input.lat == null) resource.notes.push(`Ubicación aproximada: capital provincial (${prov.capital}).`);

  const results = runStudy(input, resource, tariff, params);
  // Copia de la estructura tarifaria usada: el estudio conserva la versión con la que se calculó.
  Object.assign(results.tariff, { structure: tariff.structure, options: tariff.options ?? null });
  const study = await store.createStudy({ mode: input.mode, inputs: { ...input, lat, lng }, results, params_version: params.version, solar_source: resource.source });
  await store.track('calc_completed', { segment: input.segment, mode: input.mode });

  // Planilla leída con IA: se vincula al estudio con los datos que el cliente revisó y confirmó (los del cálculo).
  const billId = (body as { billUploadId?: unknown } | null)?.billUploadId;
  if (isBillUploadId(billId)) {
    try {
      const up = await store.getBillUpload(billId);
      if (up && canConfirmBill(up)) await store.confirmBillUpload(billId, study.id, {
        monthlyKwh: input.monthlyKwh, monthlyHistoryKwh: input.monthlyHistoryKwh, monthlyBillUsd: input.monthlyBillUsd, demandKw: input.demandKw,
      });
    } catch (e) { console.error('[planilla] no se pudo vincular al estudio', e); }
  }

  return json({ code: study.code, teaser: { kwp: results.sizing.kwp, modules: results.sizing.modules, annualGeneration: results.sizing.annualGeneration } });
}
