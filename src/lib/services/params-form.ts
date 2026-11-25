import { CalcParams, DEFAULT_PARAMS } from '../engine/params';

/**
 * Formulario guiado de los parámetros de cálculo. El registro PARAM_FIELDS genera el formulario
 * y su lectura; los porcentajes se muestran ×100 pero se guardan como fracción (3 % → 0.03).
 */

type Kind = 'pct' | 'num' | 'int' | 'bool' | 'enum';
export type ParamField = { path: string; label: string; unit?: string; kind: Kind; hint?: string; step?: string; options?: [string, string][] };
export type ParamSection = { id: string; title: string; intro?: string; fields: ParamField[] };
export type EditableParams = Omit<CalcParams, 'version'>;

const pct = (path: string, label: string, hint?: string): ParamField => ({ path, label, unit: '%', kind: 'pct', hint, step: '0.01' });
const num = (path: string, label: string, unit: string, hint?: string, step = 'any'): ParamField => ({ path, label, unit, kind: 'num', hint, step });
const int = (path: string, label: string, unit: string, hint?: string): ParamField => ({ path, label, unit, kind: 'int', hint, step: '1' });

export const SCENARIOS = [['conservador', 'Conservador'], ['base', 'Base'], ['optimista', 'Optimista']] as const;
export const REGIONS = [['costa', 'Costa'], ['sierra', 'Sierra'], ['amazonia', 'Amazonía'], ['insular', 'Galápagos']] as const;

export const PARAM_SECTIONS: ParamSection[] = [
  {
    id: 'precios', title: 'Precios', intro: 'Precio llave en mano por kWp (sin IVA) por tramo de tamaño: ver la tabla de tramos más abajo.',
    fields: [
      pct('pricing.engineeringShare', 'Ingeniería y permisos', 'Sobre equipos e instalación.'),
      num('pricing.batteryUsdPerKwh', 'Baterías', 'USD/kWh'),
      pct('pricing.vatOnCapex', 'IVA sobre la inversión'),
      num('pricing.minimumProjectUsd', 'Proyecto mínimo', 'USD', 'Ningún estudio cotiza por debajo de este valor.'),
    ],
  },
  {
    id: 'tecnicos', title: 'Diseño del sistema',
    fields: [
      num('technical.moduleWp', 'Potencia del módulo de referencia', 'Wp', undefined, '1'),
      num('technical.moduleAreaM2', 'Área del módulo', 'm²'),
      num('technical.roofM2PerKwp', 'Área en cubierta por kWp', 'm²/kWp', 'Incluye pasillos y retiros.'),
      num('technical.groundM2PerKwp', 'Área en suelo por kWp', 'm²/kWp'),
      num('technical.dcAcRatio', 'Relación CC/CA', '', 'Entre 0,8 y 1,6.'),
      pct('technical.coverageTarget', 'Cobertura objetivo con compensación de excedentes', 'Fracción del consumo anual a cubrir si se valoran los excedentes.'),
      num('technical.gridCo2KgPerKwh', 'Factor de emisión del SNI', 'kg CO₂/kWh', 'Usa el factor oficial vigente (MAATE/CENACE).'),
    ],
  },
  {
    id: 'perdidas', title: 'Pérdidas, degradación y rendimiento',
    intro: 'Las pérdidas se aplican una sola vez: las fuentes de irradiación se consultan sin pérdidas (loss=0).',
    fields: [
      pct('technical.soilingLoss', 'Suciedad'), pct('technical.dcWiringMismatchLoss', 'Cableado CC y desajuste'), pct('technical.acWiringLoss', 'Cableado CA'),
      pct('technical.inverterEfficiency', 'Eficiencia del inversor'), pct('technical.availability', 'Disponibilidad'),
      pct('technical.shadingLoss.none', 'Sombreado: ninguno'), pct('technical.shadingLoss.partial', 'Sombreado: parcial'), pct('technical.shadingLoss.significant', 'Sombreado: significativo'),
      pct('technical.firstYearDegradation', 'Degradación del primer año'), pct('technical.annualDegradation', 'Degradación anual'),
      ...REGIONS.map(([k, l]) => num(`technical.fallbackYield.${k}`, `Rendimiento de respaldo: ${l}`, 'kWh/kWp·año', 'Solo si PVGIS y NASA POWER no responden. Antes de pérdidas.', '1')),
    ],
  },
  {
    id: 'consumo', title: 'Baterías y perfil de consumo',
    fields: [
      pct('technical.batteryRoundTrip', 'Eficiencia de ida y vuelta de baterías'), pct('technical.batteryUsableDoD', 'Profundidad de descarga utilizable'),
      pct('technical.defaultDaytimeShare.residencial', 'Consumo diurno típico: residencial'), pct('technical.defaultDaytimeShare.comercial', 'Consumo diurno típico: comercial'),
      pct('technical.defaultDaytimeShare.industrial', 'Consumo diurno típico: industrial'),
    ],
  },
  {
    id: 'financieros', title: 'Evaluación financiera',
    fields: [
      int('financial.lifetimeYears', 'Vida útil del análisis', 'años'), pct('financial.discountRate', 'Tasa de descuento'),
      num('financial.omUsdPerKwpYear', 'Operación y mantenimiento', 'USD/kWp·año'), pct('financial.omEscalation', 'Incremento anual de O&M'),
      int('financial.inverterReplacementYear', 'Reemplazo del inversor', 'año'), pct('financial.inverterReplacementShareOfCapex', 'Costo del reemplazo del inversor', 'Sobre la inversión inicial.'),
      int('financial.batteryReplacementYear', 'Reemplazo de baterías', 'año'),
    ],
  },
  {
    id: 'excedentes', title: 'Excedentes y demanda',
    intro: 'Por regla, los excedentes valen $0 y el cargo por demanda no se reduce, salvo que la regulación aplicable lo respalde.',
    fields: [
      { path: 'financial.exportCompensation', label: 'Compensación de excedentes', kind: 'enum', options: [['none', 'Sin compensación (excedentes a $0)'], ['net_balance', 'Balance neto de energía'], ['fixed_price', 'Precio fijo por kWh exportado']] },
      num('financial.exportPriceUsdPerKwh', 'Precio de los excedentes', 'USD/kWh', 'Solo con «Precio fijo».'),
      { path: 'financial.demandSavingsFromPv', label: 'Reducir el cargo por demanda con la generación solar', kind: 'bool', hint: 'Desactivado por defecto: la demanda máxima suele ocurrir sin sol.' },
    ],
  },
  {
    id: 'financiamiento', title: 'Financiamiento',
    fields: [
      { path: 'financial.financing.enabled', label: 'Mostrar simulación de financiamiento', kind: 'bool' },
      pct('financial.financing.annualRate', 'Tasa anual'), int('financial.financing.years', 'Plazo', 'años'), pct('financial.financing.downPayment', 'Entrada'),
    ],
  },
];
/** Escenarios: tabla aparte (filas = escenarios, columnas = factores). */
export const SCENARIO_FIELDS: [string, string, Kind][] = [
  ['yieldFactor', 'Generación', 'pct'], ['tariffEscalation', 'Alza anual de tarifa', 'pct'], ['capexFactor', 'Inversión', 'pct'], ['extraDegradation', 'Degradación adicional', 'pct'],
];

const get = (o: unknown, path: string) => path.split('.').reduce<any>((a, k) => (a == null ? a : a[k]), o);
function set(o: any, path: string, v: unknown) {
  const ks = path.split('.');
  let cur = o;
  for (const k of ks.slice(0, -1)) cur = cur[k] ??= {};
  cur[ks.at(-1)!] = v;
}
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
/** Valor para mostrar en el campo (porcentajes ×100, sin ruido de coma flotante). */
export function displayValue(f: { kind: Kind }, v: unknown): string {
  if (f.kind === 'bool' || f.kind === 'enum') return String(v ?? '');
  if (typeof v !== 'number') return '';
  return String(f.kind === 'pct' ? Math.round(v * 1e6) / 1e4 : v);
}
const NO_LIMIT = 1e9;

/** Lista plana de [nombre del campo, valor mostrado] para precargar el formulario. */
export function toFormValues(p: EditableParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of PARAM_SECTIONS) for (const f of s.fields) out[f.path] = displayValue(f, get(p, f.path));
  for (const [sc] of SCENARIOS) for (const [k] of SCENARIO_FIELDS) out[`financial.scenarios.${sc}.${k}`] = displayValue({ kind: 'pct' }, get(p, `financial.scenarios.${sc}.${k}`));
  return out;
}

function readNumber(fd: FormData, name: string): number | null {
  const raw = String(fd.get(name) ?? '').trim().replace(/\s/g, '');
  if (!raw) return null;
  const n = Number(raw.includes(',') && !raw.includes('.') ? raw.replace(',', '.') : raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/** FormData → parámetros validados (esquema del motor + reglas de coherencia). */
export function parseParamsForm(fd: FormData): { data: EditableParams } | { error: string } {
  const out: any = structuredClone({ ...DEFAULT_PARAMS, version: undefined });
  delete out.version;
  const fields: [ParamField, string][] = PARAM_SECTIONS.flatMap((s) => s.fields.map((f) => [f, f.path] as [ParamField, string]));
  for (const [sc] of SCENARIOS) for (const [k, label] of SCENARIO_FIELDS) fields.push([{ path: `financial.scenarios.${sc}.${k}`, label: `${label} (${sc})`, kind: 'pct' }, `financial.scenarios.${sc}.${k}`]);
  for (const [f, name] of fields) {
    if (f.kind === 'bool') { set(out, f.path, fd.get(name) === 'on'); continue; }
    if (f.kind === 'enum') { set(out, f.path, String(fd.get(name) ?? '')); continue; }
    const n = readNumber(fd, name);
    if (n == null || Number.isNaN(n)) return { error: `«${f.label}»: ingresa un número.` };
    if (f.kind === 'int' && !Number.isInteger(n)) return { error: `«${f.label}»: debe ser un número entero.` };
    set(out, f.path, f.kind === 'pct' ? r6(n / 100) : n);
  }
  // Tramos de precio: «hasta kWp» (vacío en el último = sin límite) y USD/kWp.
  const ups = fd.getAll('tier_up').map(String), prices = fd.getAll('tier_price').map(String);
  const tiers: { upToKwp: number; usdPerKwp: number }[] = [];
  for (let i = 0; i < prices.length; i++) {
    const last = i === prices.length - 1;
    const upRaw = (ups[i] ?? '').trim(), pr = Number((prices[i] ?? '').trim().replace(',', '.'));
    if (!upRaw && !String(prices[i]).trim()) continue;
    const up = upRaw === '' && last ? NO_LIMIT : Number(upRaw.replace(',', '.'));
    if (!Number.isFinite(up) || up <= 0) return { error: `Tramo ${i + 1}: indica hasta cuántos kWp aplica${last ? ' (o déjalo vacío: sin límite)' : ''}.` };
    if (!Number.isFinite(pr) || pr <= 0) return { error: `Tramo ${i + 1}: el precio por kWp debe ser mayor a 0.` };
    tiers.push({ upToKwp: up, usdPerKwp: pr });
  }
  out.pricing.pvTiers = tiers;
  out.isPlaceholder = fd.get('validated') !== 'on';
  // Sin compensación, los excedentes valen $0 (regla de negocio): el precio se ignora.
  if (out.financial.exportCompensation === 'none') out.financial.exportPriceUsdPerKwh = 0;

  const schema = CalcParams.omit({ version: true }).safeParse(out);
  if (!schema.success) {
    const i = schema.error.issues[0];
    const path = i.path.join('.');
    const f = fields.find(([x]) => x.path === path)?.[0];
    return { error: f ? `«${f.label}»: valor fuera del rango permitido.` : `${path}: ${i.message}` };
  }
  const problem = paramsProblem(schema.data);
  return problem ? { error: problem } : { data: schema.data };
}

/** Reglas de coherencia que el esquema del motor no expresa. Devuelve el primer problema o null. */
export function paramsProblem(p: EditableParams): string | null {
  const t = p.pricing.pvTiers;
  if (!t.length) return 'Agrega al menos un tramo de precio por kWp.';
  for (let i = 1; i < t.length; i++) if (t[i].upToKwp <= t[i - 1].upToKwp) return `Tramos de precio: el tramo ${i + 1} debe cubrir una potencia mayor que el anterior.`;
  if (t.at(-1)!.upToKwp < NO_LIMIT) return 'Tramos de precio: deja vacío el «hasta» del último tramo (sin límite) para cubrir cualquier tamaño.';
  const s = p.technical.shadingLoss;
  if (!(s.none <= s.partial && s.partial <= s.significant && s.significant <= 0.5)) return 'Sombreado: ninguno ≤ parcial ≤ significativo, y como máximo 50 %.';
  for (const [k, v] of Object.entries(p.technical.defaultDaytimeShare)) if (v < 0.05 || v > 1) return `Consumo diurno típico (${k}): entre 5 % y 100 %.`;
  const sc = p.financial.scenarios;
  if (!(sc.conservador.yieldFactor <= sc.base.yieldFactor && sc.base.yieldFactor <= sc.optimista.yieldFactor)) return 'Escenarios: la generación debe ir de conservador ≤ base ≤ optimista.';
  if (!(sc.conservador.capexFactor >= sc.base.capexFactor && sc.base.capexFactor >= sc.optimista.capexFactor)) return 'Escenarios: la inversión debe ir de conservador ≥ base ≥ optimista.';
  if (!(sc.conservador.tariffEscalation <= sc.base.tariffEscalation && sc.base.tariffEscalation <= sc.optimista.tariffEscalation)) return 'Escenarios: el alza de tarifa debe ir de conservador ≤ base ≤ optimista.';
  for (const x of Object.values(sc)) if (x.yieldFactor <= 0 || x.capexFactor <= 0 || x.extraDegradation < 0 || x.extraDegradation > 0.02) return 'Escenarios: generación e inversión mayores a 0 %; degradación adicional entre 0 % y 2 %.';
  const f = p.financial;
  if (f.exportCompensation === 'fixed_price' && f.exportPriceUsdPerKwh <= 0) return 'Con «Precio fijo» indica el precio de los excedentes (USD/kWh).';
  for (const [y, l] of [[f.inverterReplacementYear, 'del inversor'], [f.batteryReplacementYear, 'de baterías']] as const)
    if (y < 1 || y > f.lifetimeYears) return `El reemplazo ${l} debe ocurrir entre el año 1 y la vida útil (${f.lifetimeYears} años).`;
  if (f.financing.enabled && (f.financing.years < 1 || f.financing.annualRate < 0 || f.financing.downPayment < 0 || f.financing.downPayment >= 1)) return 'Financiamiento: plazo de al menos 1 año, tasa no negativa y entrada menor al 100 %.';
  return null;
}
