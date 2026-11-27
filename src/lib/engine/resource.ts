import type { CalcParams } from './params';
import type { SolarResource } from './solar';
import { DAYS_IN_MONTH, sum } from './solar';
import type { Region } from '../ecuador';

/**
 * Recurso solar para Ecuador.
 * - PVGIS-NSRDB (satelital; API 5.2; América entre 60°N y 20°S) y PVGIS-ERA5 (reanálisis global ~30 km; API 5.3).
 *   SARAH no cubre Sudamérica.
 * - NASA POWER: climatología satelital/reanálisis (CERES/MERRA-2), cobertura global.
 * Las fuentes difieren hasta un 30 % en un mismo punto y ninguna es sistemáticamente la menor (verificado en vivo:
 * en Guayaquil la menor es ERA5; en Quito y Loja, NASA POWER, y en Loja ERA5 es la mayor), por eso se consultan las
 * tres y se adopta la MENOR (escenario
 * conservador), informando todas en el reporte. Todas se piden SIN pérdidas de sistema; se aplican una vez en solar.ts.
 *
 * Caché: el resultado de cada fuente se guarda por celda de 0,05° (~5,5 km) e inclinación entera durante
 * CACHE_TTL_DAYS. La consulta usa siempre las coordenadas EXACTAS (una celda redondeada en la costa puede caer en el
 * mar: PVGIS responde 400); dentro de una celda la diferencia es despreciable frente a la resolución de las fuentes.
 */

type Fetcher = typeof fetch;
const TIMEOUT = 8000;

export type SourceId = 'PVGIS-NSRDB' | 'PVGIS-ERA5' | 'NASA-POWER';
export const SOURCES: SourceId[] = ['PVGIS-NSRDB', 'PVGIS-ERA5', 'NASA-POWER'];
export const SOURCE_LABEL: Record<SourceId, string> = {
  'PVGIS-NSRDB': 'PVGIS-NSRDB (JRC, Comisión Europea)',
  'PVGIS-ERA5': 'PVGIS-ERA5 (JRC, Comisión Europea)',
  'NASA-POWER': 'NASA POWER (climatología, LaRC)',
};

/** Resultado de una fuente, tal como se guarda en la caché. */
export type SourceResult = {
  monthlyYieldPreLoss: number[];
  monthlyPoaKwhM2?: number[];
  /** Período de datos que reporta la fuente (p. ej. «2005–2015»). */
  period?: string;
  fetchedAt: string;
};
export type ResourceCache = {
  get(cell: string, source: SourceId): Promise<SourceResult | null>;
  put(cell: string, source: SourceId, r: SourceResult, at: { lat: number; lng: number; tilt: number }): Promise<void>;
};
export const CACHE_TTL_DAYS = 180;

export type Candidate = { source: string; annual: number; origin?: 'live' | 'cache' | 'stale'; period?: string; fetchedAt?: string };

// ---------------------------------------------------------------- Celda
export function cellFor(lat: number, lng: number, tilt: number) {
  const r = (x: number) => (Math.round(x * 20) / 20).toFixed(2);
  const t = Math.max(0, Math.min(45, Math.round(tilt)));
  return { key: `lat:${r(lat)}|lng:${r(lng)}|tilt:${t}`, tilt: t };
}

// ---------------------------------------------------------------- Validación de respuestas
/**
 * Rendimiento mensual plausible en Ecuador, antes de pérdidas de sistema: 30–300 kWh/kWp por mes. Fuera de ese rango
 * la respuesta está dañada (o trae valores de relleno) y se descarta en lugar de entrar al cálculo.
 */
export function validMonthly(v: unknown, min = 30, max = 300): v is number[] {
  return Array.isArray(v) && v.length === 12 && v.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max);
}

export function parsePvgis(j: unknown, db: 'PVGIS-ERA5' | 'PVGIS-NSRDB'): Omit<SourceResult, 'fetchedAt'> {
  const o = j as { outputs?: { monthly?: { fixed?: Record<string, number>[] } }; inputs?: { meteo_data?: { radiation_db?: string; year_min?: number; year_max?: number } } };
  const m = o?.outputs?.monthly?.fixed;
  if (!Array.isArray(m) || m.length !== 12) throw new Error(`${db}: respuesta sin datos mensuales`);
  const used = o.inputs?.meteo_data?.radiation_db;
  if (used && used !== db) throw new Error(`${db}: la respuesta corresponde a ${used}`);
  const sorted = [...m].sort((a, b) => a.month - b.month);
  const y = sorted.map((x) => x.E_m);
  if (!validMonthly(y)) throw new Error(`${db}: valores mensuales fuera de rango`);
  const poa = sorted.map((x) => x['H(i)_m'] ?? x.H_i_m);
  const md = o.inputs?.meteo_data;
  return { monthlyYieldPreLoss: y, monthlyPoaKwhM2: validMonthly(poa, 30, 350) ? poa : undefined, period: md?.year_min && md?.year_max ? `${md.year_min}–${md.year_max}` : undefined };
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function parseNasaPower(j: unknown): Omit<SourceResult, 'fetchedAt'> {
  const o = j as { properties?: { parameter?: Record<string, Record<string, number>> }; header?: { fill_value?: number; range?: string } };
  const ghi = o?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
  const t2m = o?.properties?.parameter?.T2M;
  if (!ghi || !t2m) throw new Error('NASA POWER: respuesta sin datos');
  const g = MONTHS.map((k) => ghi[k]), t = MONTHS.map((k) => t2m[k]);
  // NASA marca los meses sin dato con fill_value (−999): nunca deben entrar al cálculo.
  const fill = o.header?.fill_value ?? -999;
  if (g.some((x) => typeof x !== 'number' || x === fill || !(x >= 1 && x <= 9))) throw new Error('NASA POWER: irradiación mensual ausente o fuera de rango');
  if (t.some((x) => typeof x !== 'number' || x === fill || !(x >= -10 && x <= 45))) throw new Error('NASA POWER: temperatura mensual ausente o fuera de rango');
  const r = fromGhi(g, t, SOURCE_LABEL['NASA-POWER']);
  const yr = o.header?.range?.match(/(\d{4})\D+(\d{4})\)?\s*$/);
  return { monthlyYieldPreLoss: r.monthlyYieldPreLoss, monthlyPoaKwhM2: r.monthlyPoaKwhM2, period: yr ? `${yr[1]}–${yr[2]}` : undefined };
}

// ---------------------------------------------------------------- Consulta en vivo
/**
 * Un reintento solo ante errores de RED (TypeError de fetch: p. ej. una conexión reutilizada que el servidor ya cerró,
 * UND_ERR_SOCKET, observado en vivo con PVGIS). No se reintenta una respuesta HTTP con error ni un tiempo agotado.
 */
async function fetchOnceRetry(f: Fetcher, url: string): Promise<Response> {
  try {
    return await f(url, { signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' } as RequestInit);
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    await new Promise((r) => setTimeout(r, 250));
    return f(url, { signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' } as RequestInit);
  }
}

async function getJson(f: Fetcher, url: string, label: string) {
  const r = await fetchOnceRetry(f, url);
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    const msg = (() => { try { return (JSON.parse(body) as { message?: string }).message; } catch { return undefined; } })();
    throw new Error(`${label} ${r.status}${msg ? `: ${msg}` : ''}`);
  }
  return r.json();
}

export async function fetchSource(source: SourceId, lat: number, lng: number, tilt: number, f: Fetcher = fetch): Promise<Omit<SourceResult, 'fetchedAt'>> {
  if (source === 'NASA-POWER') {
    return parseNasaPower(await getJson(f, `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,T2M&community=RE&longitude=${lng}&latitude=${lat}&format=JSON`, 'NASA POWER'));
  }
  const aspect = lat < 0 ? 180 : 0; // aspect PVGIS: 0 = sur. Al sur del ecuador los módulos miran al norte (180)
  const ver = source === 'PVGIS-NSRDB' ? 'v5_2' : 'v5_3';  // NSRDB (satelital, América 60°N–20°S) solo existe en la API 5.2
  const url = `https://re.jrc.ec.europa.eu/api/${ver}/PVcalc?lat=${lat}&lon=${lng}&peakpower=1&loss=0&raddatabase=${source}&angle=${tilt}&aspect=${aspect}&outputformat=json`;
  return parsePvgis(await getJson(f, url, source), source);
}

/**
 * Convierte GHI diario medio (kWh/m²/día) en rendimiento kWh/kWp antes de pérdidas de sistema.
 * Cerca del ecuador y con inclinaciones bajas (≤15°) la irradiación en plano ≈ GHI (factor 1.0).
 * Temperatura de celda ≈ T ambiente + 25 °C en horas de producción; coeficiente −0,35 %/°C.
 * Baja irradiancia y espectro: −2 %.
 */
export function fromGhi(ghiDaily: number[], tAmb: number[], source: string): SolarResource {
  const poa = ghiDaily.map((g, i) => g * DAYS_IN_MONTH[i]);
  const y = poa.map((h, i) => h * (1 + -0.0035 * (tAmb[i] + 25 - 25)) * 0.98);
  return { source, monthlyYieldPreLoss: y, monthlyPoaKwhM2: poa, notes: [] };
}

export function regionalFallback(p: CalcParams, region: Region): SolarResource {
  const annual = p.technical.fallbackYield[region] ?? Math.min(...Object.values(p.technical.fallbackYield));
  return {
    source: 'Estimación regional conservadora',
    monthlyYieldPreLoss: DAYS_IN_MONTH.map((d) => (annual * d) / 365),
    notes: ['No fue posible consultar PVGIS ni NASA POWER; se usó un rendimiento regional conservador sin estacionalidad. El estudio debe recalcularse.'],
  };
}

const fmtDay = (iso: string) => iso.slice(0, 10);

/** Una fuente: caché vigente → consulta en vivo (y guarda) → caché vencida como respaldo. */
async function resolveSource(source: SourceId, lat: number, lng: number, tilt: number, f: Fetcher, cache: ResourceCache | undefined, cell: string, now: number) {
  const cached = cache ? await cache.get(cell, source).catch(() => null) : null;
  const fresh = cached && validMonthly(cached.monthlyYieldPreLoss) && now - Date.parse(cached.fetchedAt) < CACHE_TTL_DAYS * 86_400e3;
  if (cached && fresh) return { source, r: cached, origin: 'cache' as const };
  try {
    const live = { ...(await fetchSource(source, lat, lng, tilt, f)), fetchedAt: new Date(now).toISOString() };
    if (cache) await cache.put(cell, source, live, { lat, lng, tilt }).catch(() => undefined);
    return { source, r: live, origin: 'live' as const };
  } catch (e) {
    console.warn(`[recurso solar] ${source} no respondió: ${(e as Error).message}`);
    // Mejor un dato guardado (vencido) que perder la fuente: con menos fuentes, el mínimo puede ser menos conservador.
    if (cached && validMonthly(cached.monthlyYieldPreLoss)) return { source, r: cached, origin: 'stale' as const, error: (e as Error).message };
    throw e;
  }
}

export async function getSolarResource(
  lat: number, lng: number, tilt: number, region: Region, p: CalcParams, f: Fetcher = fetch, cache?: ResourceCache, now = Date.now(),
): Promise<SolarResource & { candidates: Candidate[] }> {
  const cell = cellFor(lat, lng, tilt);
  const results = await Promise.allSettled(SOURCES.map((s) => resolveSource(s, lat, lng, cell.tilt, f, cache, cell.key, now)));
  const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (ok.length === 0) return { ...regionalFallback(p, region), candidates: [] };
  const candidates: Candidate[] = ok.map((x) => ({ source: SOURCE_LABEL[x.source], annual: Math.round(sum(x.r.monthlyYieldPreLoss)), origin: x.origin, period: x.r.period, fetchedAt: x.r.fetchedAt }));
  // Todas las fuentes se piden sobre la misma base (rendimiento por kWp, plano inclinado, sin pérdidas de sistema).
  // Criterio de Gerencia: «mediana» (con tres fuentes descarta el valor más alto y el más bajo; con dos se toma la menor,
  // porque no hay mediana que las contraste) o «mínimo» (la más conservadora).
  const sorted = [...ok].sort((a, b) => sum(a.r.monthlyYieldPreLoss) - sum(b.r.monthlyYieldPreLoss));
  const median = p.technical.resourceSelection === 'mediana' && sorted.length >= 3;
  const chosen = median ? sorted[Math.floor(sorted.length / 2)] : sorted[0];
  const notes: string[] = [];
  if (ok.length > 1) notes.push(`Se compararon ${candidates.map((c) => `${c.source}: ${c.annual} kWh/kWp`).join(', ')}; ${median ? `se adoptó la mediana (${SOURCE_LABEL[chosen.source]}): descarta el valor más alto y el más bajo` : 'se adoptó el valor menor (criterio conservador)'}.`);
  else notes.push(`Solo respondió ${SOURCE_LABEL[chosen.source]}; el valor no pudo contrastarse con otra fuente.`);
  const missing = SOURCES.filter((s) => !ok.some((x) => x.source === s));
  if (missing.length && ok.length > 1) notes.push(`No respondió: ${missing.map((s) => SOURCE_LABEL[s]).join(', ')}.`);
  for (const x of ok) if (x.origin === 'stale') notes.push(`${SOURCE_LABEL[x.source]} no respondió; se usó su último dato guardado (${fmtDay(x.r.fetchedAt)}).`);
  return { source: SOURCE_LABEL[chosen.source], monthlyYieldPreLoss: chosen.r.monthlyYieldPreLoss, monthlyPoaKwhM2: chosen.r.monthlyPoaKwhM2, notes, candidates };
}

// ---------------------------------------------------------------- Verificación en vivo
export const REFERENCE_POINTS = [
  { name: 'Guayaquil', lat: -2.171, lng: -79.9224 },
  { name: 'Quito', lat: -0.1807, lng: -78.4678 },
  { name: 'Puerto Baquerizo Moreno', lat: -0.9017, lng: -89.61 },
];
export type SourceCheck = { point: string; source: SourceId; ok: boolean; ms: number; annual?: number; period?: string; error?: string };

/** Consulta EN VIVO (sin caché) cada fuente en los puntos de referencia y valida la respuesta. */
export async function checkSources(f: Fetcher = fetch, points = REFERENCE_POINTS, tilt = 10): Promise<SourceCheck[]> {
  const jobs = points.flatMap((pt) => SOURCES.map(async (source): Promise<SourceCheck> => {
    const t0 = Date.now();
    try {
      const r = await fetchSource(source, pt.lat, pt.lng, tilt, f);
      return { point: pt.name, source, ok: true, ms: Date.now() - t0, annual: Math.round(sum(r.monthlyYieldPreLoss)), period: r.period };
    } catch (e) {
      return { point: pt.name, source, ok: false, ms: Date.now() - t0, error: (e as Error).message.slice(0, 200) };
    }
  }));
  return Promise.all(jobs);
}
