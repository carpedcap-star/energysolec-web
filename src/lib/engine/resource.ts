import type { CalcParams } from './params';
import type { SolarResource } from './solar';
import { DAYS_IN_MONTH, sum } from './solar';
import type { Region } from '../ecuador';

/**
 * Recurso solar para Ecuador.
 * - PVGIS-NSRDB (satelital; API 5.2; América entre 60°N y 20°S) y PVGIS-ERA5 (reanálisis global ~30 km; API 5.3).
 *   SARAH no cubre Sudamérica.
 * - NASA POWER: climatología satelital/reanálisis (CERES/MERRA-2), cobertura global.
 * Los reanálisis tienden a sobrestimar la irradiación en zonas tropicales nubosas, por eso
 * se consultan ambas y se usa la MENOR (escenario conservador), informando ambas en el reporte.
 * Ambas se piden SIN pérdidas de sistema; esas se aplican una sola vez en solar.ts.
 */

type Fetcher = typeof fetch;
const TIMEOUT = 8000;

export async function fetchPvgis(lat: number, lng: number, tilt: number, f: Fetcher = fetch, db: 'PVGIS-ERA5' | 'PVGIS-NSRDB' = 'PVGIS-ERA5'): Promise<SolarResource> {
  const aspect = lat < 0 ? 180 : 0; // aspect PVGIS: 0 = sur. Al sur del ecuador los módulos miran al norte (180)
  const ver = db === 'PVGIS-NSRDB' ? 'v5_2' : 'v5_3';       // NSRDB (satelital, América 60°N–20°S) solo existe en la API 5.2
  const url = `https://re.jrc.ec.europa.eu/api/${ver}/PVcalc?lat=${lat}&lon=${lng}&peakpower=1&loss=0&raddatabase=${db}&angle=${tilt}&aspect=${aspect}&outputformat=json`;
  const r = await f(url, { signal: AbortSignal.timeout(TIMEOUT), next: { revalidate: 60 * 60 * 24 * 30 } } as RequestInit);
  if (!r.ok) throw new Error(`PVGIS ${r.status}`);
  const j = await r.json();
  const m = j?.outputs?.monthly?.fixed as Record<string, number>[];
  if (!Array.isArray(m) || m.length !== 12 || m.some((x) => !(x.E_m > 0))) throw new Error('PVGIS: respuesta sin datos mensuales');
  return {
    source: `${db} (JRC, Comisión Europea)`,
    monthlyYieldPreLoss: m.map((x) => x.E_m),
    monthlyPoaKwhM2: m.map((x) => x['H(i)_m'] ?? x.H_i_m),
    notes: [],
  };
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export async function fetchNasaPower(lat: number, lng: number, f: Fetcher = fetch): Promise<SolarResource> {
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,T2M&community=RE&longitude=${lng}&latitude=${lat}&format=JSON`;
  const r = await f(url, { signal: AbortSignal.timeout(TIMEOUT), next: { revalidate: 60 * 60 * 24 * 30 } } as RequestInit);
  if (!r.ok) throw new Error(`NASA POWER ${r.status}`);
  const j = await r.json();
  const ghi = j?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
  const t2m = j?.properties?.parameter?.T2M;
  if (!ghi || !t2m) throw new Error('NASA POWER: respuesta sin datos');
  return fromGhi(MONTHS.map((k) => ghi[k]), MONTHS.map((k) => t2m[k]), 'NASA POWER (climatología, LaRC)');
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

export async function getSolarResource(lat: number, lng: number, tilt: number, region: Region, p: CalcParams, f: Fetcher = fetch): Promise<SolarResource & { candidates: { source: string; annual: number }[] }> {
  const results = await Promise.allSettled([fetchPvgis(lat, lng, tilt, f, 'PVGIS-NSRDB'), fetchPvgis(lat, lng, tilt, f, 'PVGIS-ERA5'), fetchNasaPower(lat, lng, f)]);
  const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (ok.length === 0) return { ...regionalFallback(p, region), candidates: [] };
  const candidates = ok.map((r) => ({ source: r.source, annual: Math.round(sum(r.monthlyYieldPreLoss)) }));
  const chosen = ok.reduce((a, b) => (sum(a.monthlyYieldPreLoss) <= sum(b.monthlyYieldPreLoss) ? a : b));
  const notes = [...chosen.notes];
  if (ok.length > 1) notes.push(`Se compararon ${candidates.map((c) => `${c.source}: ${c.annual} kWh/kWp`).join(' y ')}; se adoptó el valor menor.`);
  else notes.push(`Solo respondió ${chosen.source}; el valor no pudo contrastarse con una segunda fuente.`);
  return { ...chosen, notes, candidates };
}
