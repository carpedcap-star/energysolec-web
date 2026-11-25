import { z } from 'zod';
import { DISTRIBUTORS } from '@/lib/ecuador';
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
  })).describe('Historial de consumo mensual que muestre la planilla (tabla o gráfico), incluido el mes facturado; vacío si no hay'),
  notes: z.string().nullable().describe('Observación breve sobre la lectura (dudas, valores ilegibles), sin datos personales'),
});
export type BillExtraction = z.infer<typeof BillExtraction>;

// ---------------------------------------------------------------- Saneamiento
export type BillData = {
  distributor: string | null;        // valor de DISTRIBUTORS o null
  distributorRaw: string | null;
  tariffCategory: string | null;
  billingPeriod: string | null;      // AAAA-MM
  energyKwh: number | null;
  electricityUsd: number | null;
  totalUsd: number | null;
  demandKw: number | null;
  history: { month: string; kwh: number }[];   // ordenado, sin repetidos, máximo 24 meses
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

/** Asocia el nombre leído a una distribuidora de la lista; si no hay coincidencia clara, null (el cliente elige). */
export function matchDistributor(raw: string | null): string | null {
  if (!raw) return null;
  const s = normalize(raw);
  const rules: [RegExp, string][] = [
    [/\bcnel\b|corporacion nacional de electricidad/, 'CNEL EP (unidades de negocio)'],
    [/\beeq\b|electrica quito/, 'Empresa Eléctrica Quito'],
    [/centro ?sur/, 'Centrosur'],
    [/regional del sur|\beerssa\b/, 'Empresa Eléctrica Regional del Sur'],
    [/ambato|\beeasa\b/, 'Empresa Eléctrica Ambato'],
    [/azogues/, 'Empresa Eléctrica Azogues'],
    [/riobamba|\beersa\b/, 'Empresa Eléctrica Riobamba'],
    [/cotopaxi|\belepco\b/, 'Empresa Eléctrica Cotopaxi'],
    [/emelnorte|regional norte|electrica norte/, 'Empresa Eléctrica Norte'],
    [/galapagos/, 'Empresa Eléctrica Galápagos'],
  ];
  const hit = rules.find(([re]) => re.test(s));
  return hit && DISTRIBUTORS.includes(hit[1]) ? hit[1] : null;
}

/** Valida rangos y formatos de la propuesta de la IA. Lo que no es plausible se descarta (el cliente lo completa). */
export function sanitizeExtraction(x: BillExtraction): BillData {
  const byMonth = new Map<string, number>();
  for (const h of x.history ?? []) {
    const m = (h.month ?? '').trim();
    const kwh = inRange(h.kwh, 0, 10_000_000);
    if (MONTH_RE.test(m) && kwh != null && !byMonth.has(m)) byMonth.set(m, kwh);
  }
  const period = MONTH_RE.test((x.billing_period ?? '').trim()) ? x.billing_period!.trim() : null;
  const energyKwh = inRange(x.energy_kwh, 1, 10_000_000);
  // El consumo del mes facturado también es un punto del historial.
  if (period && energyKwh != null && !byMonth.has(period)) byMonth.set(period, energyKwh);
  const history = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-24).map(([month, kwh]) => ({ month, kwh }));
  const distributorRaw = clip(x.distributor, 80);
  return {
    distributor: matchDistributor(distributorRaw), distributorRaw,
    tariffCategory: clip(x.tariff_category, 80), billingPeriod: period,
    energyKwh, electricityUsd: inRange(x.electricity_usd, 0.5, 5_000_000), totalUsd: inRange(x.total_usd, 0.5, 5_000_000),
    demandKw: inRange(x.demand_kw, 0.1, 100_000), history, notes: clip(x.notes, 300),
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

  const base = { history: slots, demandKw: d.demandKw != null ? fmt(d.demandKw) : '', distributor: d.distributor ?? '' };
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
  if (d.notes) warnings.push(`Nota de la lectura: ${d.notes}`);
  return out;
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
