import { z } from 'zod';
import type { PeriodKey } from '../engine/tariff-v2/types';
import { TARIFF_CHOICES, matchDistributor as matchDistributorCode } from './tariff-select';
import { sniffFile, type SniffedType } from './catalog';

/**
 * Carga de planillas eléctricas: validación del archivo, saneamiento de lo que extrae la IA y paso a datos de la
 * calculadora. Módulo puro (sin red ni base de datos) para poder probarlo.
 *
 * Principio: lo que devuelve la IA es una PROPUESTA. Se valida aquí, se muestra al cliente para que la corrija y solo
 * se calcula con lo que el cliente confirma. Nunca se extraen datos personales (nombre, cédula, dirección, cuenta).
 */

export { BILL_CONSENT_TEXT, BILL_CONSENT_VERSION } from './bill-consent';

// ---------------------------------------------------------------- Archivo
/**
 * 4 MB por archivo: las funciones de Vercel rechazan cuerpos de más de 4,5 MB, y el proveedor de IA admite imágenes de
 * hasta 5 MB. El navegador reduce las fotos antes de subirlas (una planilla en PDF pesa mucho menos).
 */
export const BILL_LIMITS = { image: 4 * 1024 * 1024, pdf: 4 * 1024 * 1024 };

export function checkBillFile(bytes: Uint8Array): SniffedType | string {
  if (!bytes.length) return 'Selecciona el archivo de tu planilla.';
  const t = sniffFile(bytes);
  if (!t) return 'El archivo debe ser un PDF o una foto JPG, PNG o WebP.';
  const max = t.kind === 'document' ? BILL_LIMITS.pdf : BILL_LIMITS.image;
  if (bytes.length > max) return `El archivo supera el máximo de ${max / 1024 / 1024} MB${t.kind === 'image' ? ' para fotos: toma la foto con menor resolución o súbela en PDF' : ''}.`;
  return t;
}

// ---------------------------------------------------------------- Esquema de extracción (salida estructurada de la IA)
/**
 * Lo que se pide a la IA. Sin restricciones numéricas en el esquema (las salidas estructuradas no las admiten todas):
 * los rangos se validan después, en `sanitizeExtraction`. A propósito NO hay campos de datos personales.
 */
export const BillExtraction = z.object({
  readable: z.boolean().describe('true si el documento es una planilla o factura de energía eléctrica legible'),
  distributor: z.string().nullable().describe('Empresa distribuidora que emite la planilla, tal como aparece'),
  tariff_category: z.string().nullable().describe('Tarifa o categoría (p. ej. Residencial, Comercial BT, Industrial MT con demanda)'),
  billing_period: z.string().nullable().describe('Mes facturado en formato AAAA-MM'),
  energy_kwh: z.number().nullable().describe('Consumo de energía del período facturado, en kWh'),
  electricity_usd: z.number().nullable().describe('Valor del servicio eléctrico en USD (energía, demanda, comercialización, subsidios e impuestos del servicio), SIN tasas de terceros como recolección de basura, bomberos o alumbrado público'),
  total_usd: z.number().nullable().describe('Total a pagar de la planilla en USD, incluidas las tasas de terceros'),
  demand_kw: z.number().nullable().describe('Demanda facturada en kW, solo si la planilla la muestra'),
  history: z.array(z.object({
    month: z.string().describe('Mes en formato AAAA-MM'),
    kwh: z.number().describe('Consumo de ese mes en kWh'),
    usd: z.number().nullable().describe('Valor total facturado ese mes en USD, solo si el historial lo muestra; si no, null'),
  })).describe('Historial de consumo mensual que muestre la planilla (tabla o gráfico), incluido el mes facturado; vacío si no hay'),
  notes: z.string().nullable().describe('Observación breve sobre la lectura (dudas, valores ilegibles), sin datos personales'),
  // Ampliación: todo lo que la planilla muestre para calcular con la tarifa oficial. Nunca datos personales.
  customer_type: z.string().nullable().describe('Tipo de cliente o categoría general tal como aparece: residencial, comercial, industrial, artesanal, oficial…'),
  voltage_level: z.string().nullable().describe('Nivel de tensión o voltaje del suministro tal como aparece (BT, MT, AT, bajo, medio, alto)'),
  province: z.string().nullable().describe('Provincia del suministro; NUNCA la dirección'),
  canton: z.string().nullable().describe('Cantón o ciudad del suministro; NUNCA la dirección'),
  demand_registered_kw: z.number().nullable().describe('Demanda máxima registrada en el mes, en kW, si aparece aparte de la facturada'),
  demand_history: z.array(z.object({ month: z.string().describe('AAAA-MM'), kw: z.number() })).describe('Historial de demanda que muestre la planilla; vacío si no hay'),
  time_of_use: z.array(z.object({
    label: z.string().describe('Nombre de la franja tal como aparece (punta, media, base, fin de semana…)'),
    hours: z.string().nullable().describe('Horario de la franja tal como aparece (p. ej. 08:00-22:00, 18h00-22h00, S,D,F 18-22)'),
    kwh: z.number().describe('kWh de esa franja en el mes facturado'),
  })).describe('Consumo por franjas horarias, solo si la planilla lo desglosa; vacío si no'),
  power_factor: z.number().nullable().describe('Factor de potencia registrado (entre 0 y 1), si aparece'),
  charges: z.array(z.object({
    concept: z.string().describe('Concepto tal como aparece'),
    kind: z.enum(['energia', 'demanda', 'comercializacion', 'perdidas_transformador', 'penalizacion_fp', 'subsidio', 'alumbrado_publico', 'bomberos', 'basura', 'impuesto', 'credito', 'saldo_anterior', 'otro']).describe('Tipo de cargo'),
    usd: z.number().describe('Valor en USD; los descuentos y subsidios en negativo'),
  })).describe('Cada rubro de la planilla con su valor; vacío si no se lee'),
  energy_credits_kwh: z.number().nullable().describe('Créditos o saldo de energía a favor (generación distribuida), en kWh, si aparece'),
  previous_balance_usd: z.number().nullable().describe('Deuda o saldo de meses anteriores incluido en el total, en USD, si aparece'),
  uncertain_fields: z.array(z.string()).describe('Nombres de los campos de este esquema que leíste con dudas'),
});
export type BillExtraction = z.infer<typeof BillExtraction>;

// ---------------------------------------------------------------- Saneamiento
export type ChargeKind = BillExtraction['charges'][number]['kind'];
export type BillData = {
  distributor: string | null;        // código de distribuidora del pliego (EEQ, CNEL-GYE…) o null
  distributorName: string | null;
  distributorRaw: string | null;
  segment: 'residencial' | 'comercial' | 'industrial' | null;
  voltage: 'BV' | 'MV' | 'AV1' | 'AV2' | null;
  province: string | null;
  canton: string | null;
  demandRegisteredKw: number | null;
  demandHistory: { month: string; kw: number }[];
  /** kWh por franja con las claves del pliego, y el esquema detectado. */
  timeOfUse: { scheme: 'HORARIA_2' | 'DIFERENCIADA_4'; kwh: Partial<Record<PeriodKey, number>> } | null;
  powerFactor: number | null;
  charges: { concept: string; kind: ChargeKind; usd: number }[];
  creditsKwh: number | null;
  previousBalanceUsd: number | null;
  /** Clave de tarifa del pliego deducida de la categoría, tensión, demanda y franjas (null si no es clara). */
  tariffKey: string | null;
  /** Categoría especial no transcrita en el motor (p. ej. bombeo de agua): el estudio usa el costo efectivo. */
  specialTariff: string | null;
  uncertain: string[];
  tariffCategory: string | null;
  billingPeriod: string | null;      // AAAA-MM
  energyKwh: number | null;
  electricityUsd: number | null;
  totalUsd: number | null;
  demandKw: number | null;
  history: { month: string; kwh: number }[];   // ordenado, sin repetidos, máximo 24 meses
  /** Valores facturados por mes, si el historial los muestra (ordenado). */
  billedHistory: { month: string; usd: number }[];
  notes: string | null;
};

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, n) : null;
};
const inRange = (v: number | null | undefined, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 100) / 100 : null;
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export { matchDistributor } from './tariff-select';

const SEGMENT_RULES: [RegExp, BillData['segment']][] = [[/resid/, 'residencial'], [/industr|artesan/, 'industrial'], [/comerc|general|oficial|servicio|asistencia|culto|bombeo/, 'comercial']];
export function segmentFrom(text: string | null): BillData['segment'] {
  if (!text) return null;
  const n = normalize(text);
  return SEGMENT_RULES.find(([re]) => re.test(n))?.[1] ?? null;
}
export function voltageFrom(text: string | null): BillData['voltage'] {
  if (!text) return null;
  const n = normalize(text);
  if (/av2|138|grupo ?2/.test(n)) return 'AV2';
  if (/\bat\b|alt[oa]|\bav1?\b/.test(n)) return 'AV1';
  if (/\bmt\b|medi[oa]|\bmv\b/.test(n)) return 'MV';
  if (/\bbt\b|baj[oa]|\bbv\b/.test(n)) return 'BV';
  return null;
}

/**
 * Franjas de la planilla → claves del pliego. Con cuatro franjas (o alguna de lunes a viernes / fin de semana) es la
 * tarifa diferenciada; con dos (08–22 y 22–08) es la horaria. Si una franja no se reconoce, no se usan (el estudio usa
 * el perfil tipo y lo advierte).
 */
export function mapTimeOfUse(items: { label: string; hours: string | null; kwh: number }[]): BillData['timeOfUse'] {
  const clean = items.filter((x) => Number.isFinite(x.kwh) && x.kwh >= 0);
  if (clean.length < 2) return null;
  const hrs = (x: { label: string; hours: string | null }) => normalize(`${x.label} ${x.hours ?? ''}`).replace(/h(\d\d)/g, ':$1').replace(/\s+/g, ' ');
  const weekend = (t: string) => /sab|dom|feriad|fin de semana|s,? ?d|sdf/.test(t);
  const has = (t: string, a: number, b: number) => new RegExp(`\\b0?${a}(:00)?\\s*(-|a|hasta)\\s*0?${b}(:00)?\\b`).test(t);
  const four = clean.length >= 3 || clean.some((x) => weekend(hrs(x)) || /punta|media/.test(hrs(x)));
  const out: Partial<Record<PeriodKey, number>> = {};
  for (const x of clean) {
    const t = hrs(x);
    let k: PeriodKey | null = null;
    // El horario manda sobre el nombre: «punta media 08-18» es la franja 08-18, no la punta.
    if (four) {
      if (weekend(t) && has(t, 18, 22)) k = 'sdf_18_22';
      else if (has(t, 18, 22)) k = 'lv_18_22';
      else if (has(t, 8, 18)) k = 'lv_08_18';
      else if (has(t, 22, 8)) k = 'base';
      else if (weekend(t) && /punta/.test(t)) k = 'sdf_18_22';
      else if (/media/.test(t)) k = 'lv_08_18';
      else if (/punta/.test(t)) k = 'lv_18_22';
      else if (/base/.test(t)) k = 'base';
    } else {
      if (has(t, 8, 22)) k = 'h08_22';
      else if (has(t, 22, 8)) k = 'h22_08';
    }
    if (!k) return null;
    out[k] = (out[k] ?? 0) + x.kwh;
  }
  return { scheme: four ? 'DIFERENCIADA_4' : 'HORARIA_2', kwh: out };
}

/**
 * Categorías del pliego que el motor aún no tiene transcritas (pliego, «otros»): no se asimilan a otra tarifa; el estudio
 * se hace con el costo efectivo de la planilla. Devuelve el nombre de la categoría o null si es una categoría soportada.
 */
export function specialCategory(category: string | null): string | null {
  const c = normalize(category ?? '');
  const m = c.match(/bombeo|entidad(es)? oficial|asistencia social|beneficio publico|culto|escenario(s)? deportivo|alumbrado publico|vehiculo(s)? electrico|autoconsumo|servicio(s)? comunitario/);
  return m ? (category ?? '').trim().slice(0, 80) : null;
}

/** Clave de tarifa del pliego a partir de lo leído. Solo si la combinación existe para el segmento. */
export function tariffKeyFromBill(segment: BillData['segment'], category: string | null, voltage: BillData['voltage'], hasDemand: boolean, scheme: 'HORARIA_2' | 'DIFERENCIADA_4' | null): string | null {
  if (!segment || specialCategory(category)) return null;
  if (segment === 'residencial') return 'RES';
  const cat = normalize(category ?? '');
  const v = voltage ?? 'BV';
  // La categoría puede decir «horaria» aunque la planilla no desglose las franjas.
  if (!scheme && /horari/.test(cat)) scheme = v === 'BV' || segment === 'comercial' ? 'HORARIA_2' : 'DIFERENCIADA_4';
  let key: string;
  if (segment === 'industrial') {
    if (/artesan/.test(cat) || (v === 'BV' && !hasDemand && !scheme)) key = 'ART-BV-SD';
    else if (v === 'AV2') key = 'IND-AV2-HD';
    else if (v === 'AV1') key = 'IND-AV1-HD';
    else if (v === 'MV') key = scheme ? 'IND-MV-HD' : 'IND-MV-D';
    else key = scheme ? 'IND-BV-H' : 'IND-BV-D';
  } else {
    if (v === 'AV1' || v === 'AV2') key = 'COM-AV-H';
    else if (v === 'MV') key = scheme ? 'COM-MV-H' : 'COM-MV-D';
    else key = scheme ? 'COM-BV-H' : hasDemand ? 'COM-BV-D' : 'COM-BV-SD';
  }
  return TARIFF_CHOICES[segment].some((c) => c.key === key) ? key : null;
}

/** Valida rangos y formatos de la propuesta de la IA. Lo que no es plausible se descarta (el cliente lo completa). */
export function sanitizeExtraction(x: BillExtraction): BillData {
  const byMonth = new Map<string, number>();
  const usdByMonth = new Map<string, number>();
  for (const h of x.history ?? []) {
    const m = (h.month ?? '').trim();
    const kwh = inRange(h.kwh, 0, 10_000_000);
    if (MONTH_RE.test(m) && kwh != null && !byMonth.has(m)) byMonth.set(m, kwh);
    const usd = inRange(h.usd ?? null, 0.5, 5_000_000);
    if (MONTH_RE.test(m) && usd != null && !usdByMonth.has(m)) usdByMonth.set(m, usd);
  }
  const period = MONTH_RE.test((x.billing_period ?? '').trim()) ? x.billing_period!.trim() : null;
  const energyKwh = inRange(x.energy_kwh, 1, 10_000_000);
  // El consumo del mes facturado también es un punto del historial.
  if (period && energyKwh != null && !byMonth.has(period)) byMonth.set(period, energyKwh);
  const history = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-24).map(([month, kwh]) => ({ month, kwh }));
  const distributorRaw = clip(x.distributor, 80);
  const dist = matchDistributorCode(distributorRaw);
  const tariffCategory = clip(x.tariff_category, 80);
  const segment = segmentFrom(`${x.customer_type ?? ''} ${tariffCategory ?? ''}`.trim() || null);
  const voltage = voltageFrom(`${x.voltage_level ?? ''} ${tariffCategory ?? ''}`.trim() || null);
  const demandKw = inRange(x.demand_kw, 0.1, 100_000);
  const demandRegisteredKw = inRange(x.demand_registered_kw, 0.1, 100_000);
  const timeOfUse = mapTimeOfUse((x.time_of_use ?? []).map((t) => ({ label: clip(t.label, 40) ?? '', hours: clip(t.hours, 40), kwh: t.kwh })));
  const demandHistory: { month: string; kw: number }[] = [];
  for (const h of x.demand_history ?? []) { const kw = inRange(h.kw, 0.1, 100_000); if (MONTH_RE.test((h.month ?? '').trim()) && kw != null) demandHistory.push({ month: h.month.trim(), kw }); }
  const charges = (x.charges ?? []).flatMap((c) => { const usd = inRange(c.usd, -5_000_000, 5_000_000); const concept = clip(c.concept, 60); return usd != null && concept ? [{ concept, kind: c.kind, usd }] : []; }).slice(0, 40);
  return {
    distributor: dist?.code ?? null, distributorName: dist?.name ?? null, distributorRaw,
    tariffCategory, billingPeriod: period,
    energyKwh, electricityUsd: inRange(x.electricity_usd, 0.5, 5_000_000), totalUsd: inRange(x.total_usd, 0.5, 5_000_000),
    demandKw, history, notes: clip(x.notes, 300),
    billedHistory: [...usdByMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-24).map(([month, usd]) => ({ month, usd })),
    segment, voltage, province: clip(x.province, 40), canton: clip(x.canton, 60), demandRegisteredKw,
    demandHistory: demandHistory.sort((a, b) => a.month.localeCompare(b.month)).slice(-24),
    timeOfUse, powerFactor: inRange(x.power_factor, 0.1, 1), charges,
    creditsKwh: inRange(x.energy_credits_kwh, 0, 10_000_000), previousBalanceUsd: inRange(x.previous_balance_usd, -5_000_000, 5_000_000),
    tariffKey: tariffKeyFromBill(segment, tariffCategory, voltage, demandKw != null || demandRegisteredKw != null, timeOfUse?.scheme ?? null),
    specialTariff: specialCategory(tariffCategory),
    uncertain: (x.uncertain_fields ?? []).map((f) => clip(f, 40)).filter((f): f is string => !!f).slice(0, 20),
  };
}

// ---------------------------------------------------------------- Paso a la calculadora
export type CalcMode = 'rapida' | 'profesional';
export type BillCalcInput = {
  input: 'history' | 'kwh' | 'bill';
  monthlyKwh: string;
  monthlyBillUsd: string;
  /** Doce meses por posición de calendario (Ene…Dic), como los pide el formulario; '' donde no hay dato. */
  history: string[];
  demandKw: string;
  distributor: string;
  /** Datos de la planilla para el resto del recorrido (los confirma el cliente). */
  segment?: BillData['segment'];
  tariffKey?: string | null;
  province?: string | null;
  canton?: string | null;
  periodKwh?: Partial<Record<PeriodKey, number>> | null;
  powerFactor?: number | null;
  /** Facturación real de referencia para el retorno: promedio de 12 meses facturados o una sola planilla. */
  billedUsd?: number | null;
  billedMonths?: number;
  /** Tarifa especial (no transcrita): el estudio se calcula con el costo efectivo de esta planilla. */
  specialTariff?: string | null;
  /** Servicio eléctrico del mes y la parte que corresponde a energía (para el costo efectivo). */
  serviceUsd?: number | null;
  energyUsd?: number | null;
  serviceKwh?: number | null;
  /** Avisos para el cliente antes de confirmar. */
  warnings: string[];
};

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Propone los datos del paso «Consumo». Prioridad: 12 meses de historial (solo en modo profesional) → promedio del
 * historial en kWh → kWh del mes → valor de la factura. Devuelve un error si la planilla no trae ningún dato útil.
 */
export function toCalculatorInput(d: BillData, mode: CalcMode): BillCalcInput | { error: string } {
  const warnings: string[] = [];
  const latest = d.history.at(-1)?.month;
  // Ventana de los 12 meses más recientes que muestra la planilla.
  const window = latest ? d.history.filter((h) => h.month > addMonths(latest, -12)) : [];
  const slots: string[] = Array(12).fill('');
  for (const h of window) slots[Number(h.month.slice(5)) - 1] = fmt(h.kwh);
  const full = window.length === 12 && window.every((h) => h.kwh > 0);

  // Valor del servicio eléctrico: sin tasas de terceros, que no dependen del consumo y la energía solar no reduce.
  const usd = d.electricityUsd ?? d.totalUsd;
  if (d.electricityUsd == null && d.totalUsd != null)
    warnings.push('Tomamos el total a pagar. Si tu planilla incluye tasas de recolección de basura, bomberos u otras, réstalas: no dependen de tu consumo eléctrico.');

  const demand = d.demandKw ?? d.demandRegisteredKw;
  const base = {
    history: slots, demandKw: demand != null ? fmt(demand) : '', distributor: d.distributor ?? '',
    segment: d.segment, tariffKey: d.tariffKey, province: d.province, canton: d.canton,
    periodKwh: d.timeOfUse?.kwh ?? null, powerFactor: d.powerFactor,
    ...billedReference(d),
    specialTariff: d.specialTariff, serviceUsd: d.electricityUsd, serviceKwh: d.energyKwh,
    energyUsd: (() => { const e = d.charges.filter((c) => c.kind === 'energia').reduce((a, c) => a + c.usd, 0); return e > 0 ? Math.round(e * 100) / 100 : null; })(),
  };
  let out: BillCalcInput;
  if (mode === 'profesional' && full) {
    out = { ...base, input: 'history', monthlyKwh: '', monthlyBillUsd: usd != null ? fmt(usd) : '', warnings };
  } else if (window.length >= 3) {
    const avg = window.reduce((s, h) => s + h.kwh, 0) / window.length;
    if (!(avg > 0)) return { error: 'La planilla no muestra consumo de energía. Ingresa tus datos manualmente.' };
    warnings.push(`El consumo es el promedio de los ${window.length} meses que muestra tu planilla.`);
    if (mode === 'profesional' && !full) warnings.push('Tu planilla no muestra los 12 meses completos: completa el historial a mano si quieres más precisión.');
    // El valor de un solo mes no se compara con un promedio: el cálculo los marcaría como incoherentes.
    out = { ...base, input: 'kwh', monthlyKwh: String(Math.round(avg)), monthlyBillUsd: '', warnings };
  } else if (d.energyKwh != null) {
    out = { ...base, input: 'kwh', monthlyKwh: String(Math.round(d.energyKwh)), monthlyBillUsd: usd != null ? fmt(usd) : '', warnings };
    warnings.push('Usamos el consumo de un solo mes: si tu consumo varía mucho durante el año, ingresa un promedio.');
  } else if (usd != null) {
    out = { ...base, input: 'bill', monthlyKwh: '', monthlyBillUsd: fmt(usd), warnings };
    warnings.push('No encontramos los kWh en tu planilla: estimaremos el consumo a partir del valor.');
  } else {
    return { error: 'No encontramos el consumo ni el valor en tu planilla. Revisa que sea legible o ingresa tus datos manualmente.' };
  }

  // Coherencia entre energía y valor (precio medio implícito).
  const kwhRef = d.energyKwh;
  if (kwhRef && usd) {
    const price = usd / kwhRef;
    if (price < 0.03 || price > 0.5)
      warnings.push(`El valor y el consumo leídos dan $${price.toFixed(2)} por kWh, una cifra poco habitual: revisa ambos datos.`);
  }
  if (d.previousBalanceUsd && d.previousBalanceUsd > 0) warnings.push('Tu planilla incluye saldos de meses anteriores: no los tomamos como consumo.');
  if (d.creditsKwh) warnings.push(`Tu planilla muestra ${Math.round(d.creditsKwh)} kWh de créditos de energía: ya tienes generación propia; un asesor revisará tu caso.`);
  if (d.uncertain.length) warnings.push(`Revisa con atención: ${d.uncertain.join(', ')} (lectura con dudas).`);
  if (d.notes) warnings.push(`Nota de la lectura: ${d.notes}`);
  return out;
}

/** Facturación de referencia: promedio de los 12 últimos meses facturados si están todos; si no, el valor de esta planilla. */
export function billedReference(d: Pick<BillData, 'billedHistory' | 'totalUsd' | 'electricityUsd'>): { billedUsd: number | null; billedMonths: number } {
  const last = d.billedHistory.at(-1)?.month;
  const win = last ? d.billedHistory.filter((h) => h.month > addMonths(last, -12)) : [];
  if (win.length === 12) return { billedUsd: Math.round((win.reduce((a, h) => a + h.usd, 0) / 12) * 100) / 100, billedMonths: 12 };
  const one = d.totalUsd ?? d.electricityUsd;
  return { billedUsd: one, billedMonths: one != null ? 1 : 0 };
}

// ---------------------------------------------------------------- Confirmación
/** Lo que el cliente confirmó (se guarda junto a la propuesta de la IA para auditar diferencias). */
export const BillConfirmation = z.object({
  monthlyKwh: z.number().positive().max(10_000_000).optional(),
  monthlyHistoryKwh: z.array(z.number().nonnegative()).length(12).optional(),
  monthlyBillUsd: z.number().positive().max(5_000_000).optional(),
  demandKw: z.number().nonnegative().max(100_000).optional(),
});
export type BillConfirmation = z.infer<typeof BillConfirmation>;

/** Identificador de carga: UUID v4 (no adivinable). */
export const isBillUploadId = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

/** Una carga solo se puede vincular a un estudio una vez y durante las 2 horas siguientes a subirla. */
export const BILL_CONFIRM_WINDOW_MS = 2 * 60 * 60 * 1000;
export const canConfirmBill = (u: { confirmed_by_user: boolean; study_id: string | null; created_at: string }, now = Date.now()) =>
  !u.confirmed_by_user && !u.study_id && now - Date.parse(u.created_at) <= BILL_CONFIRM_WINDOW_MS;
