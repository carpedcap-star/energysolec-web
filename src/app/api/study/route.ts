import { StudyInput } from '@/lib/engine/study';
import { runStudy } from '@/lib/engine/study';
import { getSolarResource } from '@/lib/engine/resource';
import { defaultTariffFor } from '@/lib/engine/default-tariffs';
import { getStore } from '@/lib/data/store';
import { PROVINCES } from '@/lib/ecuador';
import { guard, json } from '@/lib/request';
import { firstError } from '@/lib/schemas';

export const runtime = 'nodejs';

/** Ejecuta el cálculo y guarda el estudio BLOQUEADO. Solo devuelve un adelanto mínimo. */
export async function POST(req: Request) {
  if (!(await guard('study', 20, 3600))) return json({ error: 'Demasiadas solicitudes. Intenta más tarde.' }, 429);
  const parsed = StudyInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: firstError(parsed.error) }, 400);
  const input = parsed.data;
  const prov = PROVINCES.find((p) => p.name === input.province);
  if (!prov) return json({ error: 'Provincia no válida' }, 400);

  const store = getStore();
  const [params, tariffs] = await Promise.all([store.getActiveParams(), store.listTariffs()]);
  const tariff = tariffs.find((t) => t.code === input.tariffCode && t.segment === input.segment)
    ?? tariffs.find((t) => t.segment === input.segment) ?? defaultTariffFor(input.segment);

  const lat = input.lat ?? prov.lat, lng = input.lng ?? prov.lng;
  const resource = await getSolarResource(lat, lng, input.tilt, prov.region, params);
  if (input.lat == null) resource.notes.push(`Ubicación aproximada: capital provincial (${prov.capital}).`);

  const results = runStudy(input, resource, tariff, params);
  const study = await store.createStudy({ mode: input.mode, inputs: { ...input, lat, lng }, results, params_version: params.version, solar_source: resource.source });
  await store.track('calc_completed', { segment: input.segment, mode: input.mode });

  return json({ code: study.code, teaser: { kwp: results.sizing.kwp, modules: results.sizing.modules, annualGeneration: results.sizing.annualGeneration } });
}
