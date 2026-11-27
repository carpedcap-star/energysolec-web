import { CalcParams, DEFAULT_PARAMS, MOUNTING_PRICE_KEYS } from '../engine/params';

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

const MOUNTING_LABEL: Record<(typeof MOUNTING_PRICE_KEYS)[number], string> = {
  cubierta_metalica: 'cubierta metálica', techo_inclinado: 'techo inclinado', losa: 'losa', hincado: 'terreno con estructura hincada', cimentado: 'terreno con estructura cimentada',
};

export const PARAM_SECTIONS: ParamSection[] = [
  {
    id: 'precios', title: 'Precios', intro: 'Los tramos de arriba son el PRECIO FINAL DE VENTA por kWp sin IVA (equipos, instalación, ingeniería y margen). La inversión = precio por kWp × kWp + adicional de implantación + baterías + ingeniería adicional (si la hay) + IVA, una sola vez cada uno.',
    fields: [
      pct('pricing.engineeringShare', 'Ingeniería y permisos adicionales', 'Déjalo en 0 % si el precio por kWp ya los incluye: si no, se cobrarían dos veces.'),
      pct('pricing.vatOnCapex', 'IVA sobre la inversión'),
      num('pricing.minimumProjectUsd', 'Proyecto mínimo', 'USD', 'Ningún estudio cotiza por debajo de este valor.'),
    ],
  },
  {
    id: 'implantacion', title: 'Tipo de implantación',
    intro: 'Área que ocupa cada kWp (factor de ocupación) por tipo de superficie, y adicional por kWp sin IVA solo si el precio llave en mano NO incluye esa estructura (con 0 no se suma nada).',
    fields: [
      ...MOUNTING_PRICE_KEYS.map((k) => num(`pricing.mountingUsdPerKwp.${k}`, `Adicional: ${MOUNTING_LABEL[k]}`, 'USD/kWp')),
      ...([['techo_metalico', 'techo de metal'], ['techo_inclinado', 'techo inclinado'], ['losa', 'losa'], ['terreno', 'terreno']] as const)
        .map(([k, l]) => num(`technical.mountingM2PerKwp.${k}`, `Área por kWp en ${l}`, 'm²/kWp', k === 'losa' || k === 'terreno' ? 'Estructura inclinada: incluye separación entre filas.' : undefined)),
      { path: 'technical.groundLast', label: 'Usar el terreno solo después de cubiertas y losas', kind: 'bool', hint: 'Si el cliente indica varias superficies, se llenan primero los techos y losas.' },
    ],
  },
  {
    id: 'almacenamiento', title: 'Almacenamiento y sistemas aislados',
    intro: 'Criterios de dimensionamiento de las alternativas híbrida y aislada (Off Grid).',
    fields: [
      pct('technical.socMinReserve', 'Reserva mínima de carga (SOC)', 'La batería no se descarga por debajo de este nivel.'),
      int('technical.hybridBackupHours', 'Respaldo híbrido por defecto', 'h', 'Si el cliente no indica horas.'),
      int('technical.offGridAutonomyHours', 'Autonomía Off Grid', 'h'),
      pct('technical.offGridReliability', 'Confiabilidad objetivo Off Grid', 'Fracción de la energía demandada que el sistema debe suministrar en la simulación.'),
      int('technical.offGridLowSunDays', 'Días seguidos de baja radiación', 'días'),
      pct('technical.offGridLowSunFactor', 'Generación en días de baja radiación', 'Fracción de la generación de un día típico del peor mes.'),
      pct('technical.backupLoadShare.esencial', 'Respaldo «lo esencial»', 'Fracción de la carga promedio.'),
      pct('technical.backupLoadShare.parcial', 'Respaldo «una parte»'),
      pct('technical.backupLoadShare.total', 'Respaldo «todo»'),
      num('technical.peakToAverageLoad.residencial', 'Pico / promedio de carga: residencial', '×', 'Para dimensionar el inversor aislado.'),
      num('technical.peakToAverageLoad.comercial', 'Pico / promedio de carga: comercial', '×'),
      num('technical.peakToAverageLoad.industrial', 'Pico / promedio de carga: industrial', '×'),
    ],
  },
  {
    id: 'tecnicos', title: 'Diseño del sistema',
    fields: [
      num('technical.moduleWp', 'Potencia del módulo de referencia', 'Wp', undefined, '1'),
      num('technical.moduleAreaM2', 'Área del módulo', 'm²'),
      num('technical.roofM2PerKwp', 'Área en cubierta por kWp (cálculo general)', 'm²/kWp', 'Incluye pasillos y retiros. Las alternativas usan el área por tipo de implantación.'),
      num('technical.groundM2PerKwp', 'Área en suelo por kWp (cálculo general)', 'm²/kWp'),
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
      { path: 'financial.exportCompensation', label: 'Compensación de excedentes', kind: 'enum', options: [['none', 'Sin compensación (excedentes a $0)'], ['net_balance', 'Balance neto (Regulación ARCONEL-005/24)'], ['fixed_price', 'Precio fijo por kWh exportado (no previsto en la regulación vigente)']],
        hint: 'Balance neto: créditos en kWh que se descuentan en los meses siguientes y se reinician cada 24 meses sin pago. Actívalo solo para clientes que tramitan la habilitación con su distribuidora.' },
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
/** Tablas de tramos de precio (filas «hasta» + precio; la última sin límite). */
export const TIER_TABLES = [
  { id: 'pv', path: 'pvTiers', up: 'upToKwp', price: 'usdPerKwp', names: ['tier_up', 'tier_price'], title: 'Sistema conectado a la red (On Grid)', unitUp: 'kWp', unitPrice: 'USD/kWp' },
  { id: 'hy', path: 'hybridPvTiers', up: 'upToKwp', price: 'usdPerKwp', names: ['hy_up', 'hy_price'], title: 'Sistema híbrido (sin baterías)', unitUp: 'kWp', unitPrice: 'USD/kWp' },
  { id: 'og', path: 'offGridPvTiers', up: 'upToKwp', price: 'usdPerKwp', names: ['og_up', 'og_price'], title: 'Sistema aislado Off Grid (sin baterías)', unitUp: 'kWp', unitPrice: 'USD/kWp' },
  { id: 'bt', path: 'batteryTiers', up: 'upToKwh', price: 'usdPerKwh', names: ['bt_up', 'bt_price'], title: 'Baterías por capacidad instalada', unitUp: 'kWh', unitPrice: 'USD/kWh' },
] as const;
export type TierTable = (typeof TIER_TABLES)[number];
/** Filas de una tabla para precargar el formulario. */
export function tierRows(p: EditableParams, t: TierTable): { up: string; price: string }[] {
  const list = (p.pricing as any)[t.path] as Record<string, number>[];
  return list.map((r, i) => ({ up: i === list.length - 1 ? '' : String(r[t.up]), price: String(r[t.price]) }));
}

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
  // Tramos de precio: «hasta» (vacío en el último = sin límite) y precio. Una tabla ausente conserva su valor por defecto.
  for (const t of TIER_TABLES) {
    const ups = fd.getAll(t.names[0]).map(String), prices = fd.getAll(t.names[1]).map(String);
    if (!prices.length) continue;
    const label = t.id === 'pv' ? 'Tramo' : `${t.title}, tramo`;
    const rows: Record<string, number>[] = [];
    for (let i = 0; i < prices.length; i++) {
      const last = i === prices.length - 1;
      const upRaw = (ups[i] ?? '').trim(), pr = Number((prices[i] ?? '').trim().replace(',', '.'));
      if (!upRaw && !String(prices[i]).trim()) continue;
      const up = upRaw === '' && last ? NO_LIMIT : Number(upRaw.replace(',', '.'));
      if (!Number.isFinite(up) || up <= 0) return { error: `${label} ${i + 1}: indica hasta cuántos ${t.unitUp} aplica${last ? ' (o déjalo vacío: sin límite)' : ''}.` };
      if (!Number.isFinite(pr) || pr <= 0) return { error: `${label} ${i + 1}: el precio debe ser mayor a 0.` };
      rows.push({ [t.up]: up, [t.price]: pr });
    }
    out.pricing[t.path] = rows;
  }
  // Precio de referencia heredado (cálculo general): el primer tramo de baterías.
  out.pricing.batteryUsdPerKwh = out.pricing.batteryTiers[0]?.usdPerKwh ?? out.pricing.batteryUsdPerKwh;
  out.financial.officialTariffsReviewed = fd.get('tariffs_reviewed') === 'on';
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
  for (const tt of TIER_TABLES) {
    const t = ((p.pricing as any)[tt.path] as Record<string, number>[]).map((r) => r[tt.up]);
    const name = tt.id === 'pv' ? 'Tramos de precio' : `Tramos de precio (${tt.title})`;
    if (!t.length) return `${name}: agrega al menos un tramo.`;
    for (let i = 1; i < t.length; i++) if (t[i] <= t[i - 1]) return `${name}: el tramo ${i + 1} debe cubrir una ${tt.unitUp === 'kWh' ? 'capacidad' : 'potencia'} mayor que el anterior.`;
    if (t.at(-1)! < NO_LIMIT) return `${name}: deja vacío el «hasta» del último tramo (sin límite) para cubrir cualquier tamaño.`;
  }
  const bl = p.technical.backupLoadShare;
  if (!(bl.esencial <= bl.parcial && bl.parcial <= bl.total)) return 'Respaldo: «lo esencial» ≤ «una parte» ≤ «todo».';
  if (p.technical.socMinReserve + (1 - p.technical.batteryUsableDoD) > 0.6) return 'Baterías: la reserva mínima y la profundidad de descarga dejan menos del 40 % utilizable; revisa los valores.';
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
