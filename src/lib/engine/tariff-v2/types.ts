/**
 * Motor tarifario v2: tipos. Basado en el Pliego Tarifario del SPEE 2026 codificado (Res. ARCONEL-023/25, 029/25 y
 * 009/26) y en la Regulación ARCONEL-005/24 codificada. Ver docs/tarifas/PROPUESTA_MODULO_TARIFARIO.md.
 *
 * Todo es puro y determinista: la IA nunca calcula nada de esto.
 */

/** Esquemas de franjas horarias del pliego (numerales 3, 4.3.4.4 a 4.5.5). */
export type PeriodScheme = 'UNICO' | 'HORARIA_2' | 'DIFERENCIADA_4' | 'VE_3';

/**
 * Franjas por esquema:
 * - UNICO: `unico`.
 * - HORARIA_2 (con demanda horaria): `h08_22` (08:00–22:00) y `h22_08` (22:00–08:00), todos los días.
 * - DIFERENCIADA_4 (industrial MV/AV, SPAP): `lv_08_18`, `lv_18_22`, `base` (L-V 22:00–08:00 y S, D, F 22:00–18:00)
 *   y `sdf_18_22` (S, D, F 18:00–22:00).
 * - VE_3 (vehículos eléctricos y carga rápida): `ld_18_22` (punta L-D), `lv_08_18` (media L-V) y `base`
 *   (L-D 22:00–08:00 y S-D 08:00–18:00).
 */
export type PeriodKey = 'unico' | 'h08_22' | 'h22_08' | 'lv_08_18' | 'lv_18_22' | 'base' | 'sdf_18_22' | 'ld_18_22';

export const SCHEME_PERIODS: Record<PeriodScheme, PeriodKey[]> = {
  UNICO: ['unico'],
  HORARIA_2: ['h08_22', 'h22_08'],
  DIFERENCIADA_4: ['lv_08_18', 'lv_18_22', 'base', 'sdf_18_22'],
  VE_3: ['lv_08_18', 'ld_18_22', 'base'],
};

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  unico: 'Todo el mes',
  h08_22: '08:00 a 22:00',
  h22_08: '22:00 a 08:00',
  lv_08_18: 'Lunes a viernes 08:00 a 18:00',
  lv_18_22: 'Lunes a viernes 18:00 a 22:00',
  base: 'Base (22:00 a 08:00, y fines de semana y feriados fuera de 18:00–22:00)',
  sdf_18_22: 'Sábados, domingos y feriados 18:00 a 22:00',
  ld_18_22: 'Lunes a domingo 18:00 a 22:00',
};

/** Bloque incremental: cada kWh paga el precio del bloque en que cae (pliego 4.3.1 y 4.3.4.1). */
export type Block = { fromKwh: number; toKwh: number | null; usdPerKwh: number };

/** Cargo de energía de una franja; `months` (1–12) para tarifas estacionales; vacío = todo el año. */
export type EnergyCharge = { period: PeriodKey; months?: number[]; blocks: Block[] };

export type DemandFactor = 'ninguno' | 'FGD' | 'FGDI' | 'FGDVE';

export type TariffStructure = {
  scheme: PeriodScheme;
  commercialization: { usdPerMonth: number };
  energy: EnergyCharge[];
  demand?: {
    usdPerKwMonth: number;
    factor: DemandFactor;
    /** Demanda facturable mínima como fracción de la máxima de 12 meses (4.6.4.1: 0,60). null = sin mínimo (bombeo agrícola). */
    minShareOfMax12: number | null;
  };
  /** Penalización por bajo factor de potencia (4.6.6). Solo categoría general con medición de reactiva. */
  powerFactor?: { threshold: number };
};

export type TariffCategory = 'residencial' | 'general';
export type DemandType = 'sin_demanda' | 'con_demanda' | 'horaria' | 'horaria_diferenciada';
export type VoltageGroup = 'BV' | 'MV' | 'AV1' | 'AV2';
export type RecordStatus = 'provisional' | 'validada' | 'historica';

/** Tarifa versionada (fila de `tariffs` con las columnas de la migración 0012). */
export type TariffV2 = {
  id?: string;
  scheduleId?: string;
  code: string;
  officialName: string;
  category: TariffCategory;
  consumerGroup: string;
  demandType: DemandType;
  voltageGroup: VoltageGroup;
  /** Códigos de distribuidora a los que aplica (grupo del Anexo 1). */
  distributors: string[];
  structure: TariffStructure;
  sourceNote: string;
  sourcePage?: string;
  status: RecordStatus;
  version: number;
};

/** Consumo de un mes para facturar. */
export type MonthUsage = {
  /** 1 a 12 (para tarifas estacionales). */
  month: number;
  /** kWh por franja del esquema de la tarifa. En UNICO: `{ unico: kWh }`. */
  kwhByPeriod: Partial<Record<PeriodKey, number>>;
  /** Demanda máxima registrada del mes (DM), kW. */
  demandKw?: number;
  /** Demanda máxima del mes en la franja 18:00–22:00 (DP), kW. Necesaria para FGD y FGDI. */
  peakDemandKw?: number;
  /** Máxima demanda de los últimos 12 meses incluido el actual (DMmax12), kW. */
  dmMax12Kw?: number;
  /** Para FGDVE: la demanda máxima ocurrió en punta. */
  dmInPeak?: boolean;
  /** Factor de potencia registrado (0–1). */
  powerFactor?: number;
  /** Consumidor de medio voltaje medido en bajo voltaje: recargo del 2 % (pliego 4.4). */
  measuredInLowVoltage?: boolean;
};

/** Cargos que no son del SPEE (alumbrado público, bomberos, recolección de basura…): dependen del municipio. */
export type ThirdPartyCharge = {
  code: string;
  name: string;
  method: 'fijo' | 'porcentaje_spee' | 'por_kwh';
  value: number;
  /** ¿La generación propia lo reduce? Un cargo fijo no; uno por kWh o porcentual, sí en parte. */
  reducibleByPv: boolean;
  status: RecordStatus;
  sourceNote: string;
};

/** Subsidio cruzado residencial (pliego 4.6.1 y Anexo 2). */
export type CrossSubsidy = {
  distributor: string;
  receivesUpToKwh: number;
  contributesAboveKwh: number;
  /** Fracción de la factura del SPEE que aporta quien supera el umbral (p. ej. 0,10). */
  contributionShare: number;
  status: RecordStatus;
  sourceNote: string;
};

export type Reducibility = 'si' | 'no' | 'condicional';

export type BillLine = {
  code: 'energia' | 'demanda' | 'perdidas_transformador' | 'comercializacion' | 'penalizacion_fp' | 'subsidio_cruzado' | 'tercero';
  label: string;
  amount: number;
  /** Desglose (kWh por bloque y franja, kW facturables, factor…). */
  detail: string;
  reducibleByPv: Reducibility;
  /** Valor de una fuente provisional o supuesta. */
  provisional?: boolean;
};

export type BillResult = {
  lines: BillLine[];
  /** Factura por servicio público de energía eléctrica: E + P + PIT + C + PBFP (pliego 6), más el aporte al subsidio cruzado. */
  spee: number;
  thirdParty: number;
  total: number;
  billableDemandKw: number;
  warnings: string[];
};
