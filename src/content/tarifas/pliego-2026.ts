import type { DemandFactor, DemandType, EnergyCharge, PeriodScheme, TariffStructure, TariffV2, VoltageGroup } from '@/lib/engine/tariff-v2/types';

/**
 * Pliego Tarifario del SPEE 2026 CODIFICADO (Res. ARCONEL-023/25, 029/25 y 009/26), Anexo 1 y Anexo 2.
 * Vigencia: 01-10-2026 a 31-12-2026 (numeral 7). Copia del documento en docs/normativa/.
 *
 * TRANSCRIPCIÓN, no cálculo: cada valor se verifica contra el texto oficial en `pliego-2026.test.ts`.
 * Cubre las categorías que usa la calculadora (residencial, comercial, industrial artesanal e industrial). Las demás
 * («otros»: entidades oficiales, bombeo, asistencia social, vehículos eléctricos…) quedan para una carga posterior.
 * Estado: PROVISIONAL hasta que Gerencia lo revise contra el PDF (parámetro `financial.officialTariffsReviewed`).
 */
export const SCHEDULE = {
  code: 'SPEE-2026-Q4',
  title: 'Pliego Tarifario del SPEE 2026 codificado (octubre a diciembre)',
  resolutions: ['ARCONEL-023/25 (28-11-2025)', 'ARCONEL-029/25 (31-12-2025)', 'ARCONEL-009/26 (29-09-2026)'],
  validFrom: '2026-10-01',
  validTo: '2026-12-31',
  documentUrl: 'https://arconel.gob.ec/wp-content/uploads/downloads/2026/09/pliego_tarifario_spee_2026_codificado_1.pdf',
} as const;

export type GroupCode = 'SIERRA_SUR' | 'COSTA_ORIENTE' | 'GYE' | 'EEQ';

/** Las 20 distribuidoras del Anexo 2, su grupo del Anexo 1 y los límites del subsidio cruzado residencial. */
export const DISTRIBUTORS: { code: string; name: string; group: GroupCode; receivesUpToKwh: number; contributesAboveKwh: number; contributionShare: number }[] = [
  { code: 'EEASA', name: 'Empresa Eléctrica Ambato', group: 'SIERRA_SUR', receivesUpToKwh: 80, contributesAboveKwh: 100, contributionShare: 0.1 },
  { code: 'EEA', name: 'Empresa Eléctrica Azogues', group: 'SIERRA_SUR', receivesUpToKwh: 70, contributesAboveKwh: 80, contributionShare: 0.1 },
  { code: 'CENTROSUR', name: 'Empresa Eléctrica Regional Centro Sur', group: 'SIERRA_SUR', receivesUpToKwh: 90, contributesAboveKwh: 100, contributionShare: 0.1 },
  { code: 'ELEPCO', name: 'Empresa Eléctrica Cotopaxi', group: 'SIERRA_SUR', receivesUpToKwh: 70, contributesAboveKwh: 80, contributionShare: 0.1 },
  { code: 'EMELNORTE', name: 'Empresa Eléctrica Regional Norte', group: 'SIERRA_SUR', receivesUpToKwh: 90, contributesAboveKwh: 100, contributionShare: 0.1 },
  { code: 'EERSA', name: 'Empresa Eléctrica Riobamba', group: 'SIERRA_SUR', receivesUpToKwh: 70, contributesAboveKwh: 80, contributionShare: 0.1 },
  { code: 'EERSSA', name: 'Empresa Eléctrica Regional del Sur', group: 'SIERRA_SUR', receivesUpToKwh: 70, contributesAboveKwh: 80, contributionShare: 0.1 },
  { code: 'CNEL-BOL', name: 'CNEL EP Bolívar', group: 'SIERRA_SUR', receivesUpToKwh: 50, contributesAboveKwh: 60, contributionShare: 0.1 },
  { code: 'EEQ', name: 'Empresa Eléctrica Quito', group: 'EEQ', receivesUpToKwh: 130, contributesAboveKwh: 160, contributionShare: 0.1 },
  { code: 'EEGAL', name: 'Empresa Eléctrica Galápagos', group: 'COSTA_ORIENTE', receivesUpToKwh: 130, contributesAboveKwh: 170, contributionShare: 0.1 },
  { code: 'CNEL-ORO', name: 'CNEL EP El Oro', group: 'COSTA_ORIENTE', receivesUpToKwh: 120, contributesAboveKwh: 130, contributionShare: 0.1 },
  { code: 'CNEL-ESM', name: 'CNEL EP Esmeraldas', group: 'COSTA_ORIENTE', receivesUpToKwh: 130, contributesAboveKwh: 140, contributionShare: 0.1 },
  { code: 'CNEL-GYE', name: 'CNEL EP Guayaquil', group: 'GYE', receivesUpToKwh: 130, contributesAboveKwh: 250, contributionShare: 0.05 },
  { code: 'CNEL-GLR', name: 'CNEL EP Guayas-Los Ríos', group: 'COSTA_ORIENTE', receivesUpToKwh: 130, contributesAboveKwh: 190, contributionShare: 0.1 },
  { code: 'CNEL-LRS', name: 'CNEL EP Los Ríos', group: 'COSTA_ORIENTE', receivesUpToKwh: 120, contributesAboveKwh: 130, contributionShare: 0.1 },
  { code: 'CNEL-MAN', name: 'CNEL EP Manabí', group: 'COSTA_ORIENTE', receivesUpToKwh: 130, contributesAboveKwh: 150, contributionShare: 0.1 },
  { code: 'CNEL-MIL', name: 'CNEL EP Milagro', group: 'COSTA_ORIENTE', receivesUpToKwh: 100, contributesAboveKwh: 130, contributionShare: 0.1 },
  { code: 'CNEL-STE', name: 'CNEL EP Santa Elena', group: 'COSTA_ORIENTE', receivesUpToKwh: 130, contributesAboveKwh: 140, contributionShare: 0.1 },
  { code: 'CNEL-SDO', name: 'CNEL EP Santo Domingo', group: 'COSTA_ORIENTE', receivesUpToKwh: 110, contributesAboveKwh: 110, contributionShare: 0.1 },
  { code: 'CNEL-SUC', name: 'CNEL EP Sucumbíos', group: 'COSTA_ORIENTE', receivesUpToKwh: 90, contributesAboveKwh: 120, contributionShare: 0.1 },
];

/**
 * Distribuidora sugerida por provincia, con excepciones por cantón. COMPILADA (no es un dato del pliego) y
 * PROVISIONAL: el cliente siempre puede corregirla, y la planilla manda cuando se lee.
 */
export const COVERAGE: { province: string; distributor: string; cantons?: Record<string, string> }[] = [
  { province: 'Azuay', distributor: 'CENTROSUR' },
  { province: 'Bolívar', distributor: 'CNEL-BOL' },
  { province: 'Cañar', distributor: 'CENTROSUR', cantons: { Azogues: 'EEA' } },
  { province: 'Carchi', distributor: 'EMELNORTE' },
  { province: 'Chimborazo', distributor: 'EERSA' },
  { province: 'Cotopaxi', distributor: 'ELEPCO' },
  { province: 'El Oro', distributor: 'CNEL-ORO' },
  { province: 'Esmeraldas', distributor: 'CNEL-ESM' },
  { province: 'Galápagos', distributor: 'EEGAL' },
  { province: 'Guayas', distributor: 'CNEL-GLR', cantons: { Guayaquil: 'CNEL-GYE', Milagro: 'CNEL-MIL' } },
  { province: 'Imbabura', distributor: 'EMELNORTE' },
  { province: 'Loja', distributor: 'EERSSA' },
  { province: 'Los Ríos', distributor: 'CNEL-LRS' },
  { province: 'Manabí', distributor: 'CNEL-MAN' },
  { province: 'Morona Santiago', distributor: 'CENTROSUR' },
  { province: 'Napo', distributor: 'EEASA' },
  { province: 'Orellana', distributor: 'CNEL-SUC' },
  { province: 'Pastaza', distributor: 'EEASA' },
  { province: 'Pichincha', distributor: 'EEQ' },
  { province: 'Santa Elena', distributor: 'CNEL-STE' },
  { province: 'Santo Domingo de los Tsáchilas', distributor: 'CNEL-SDO' },
  { province: 'Sucumbíos', distributor: 'CNEL-SUC' },
  { province: 'Tungurahua', distributor: 'EEASA' },
  { province: 'Zamora Chinchipe', distributor: 'EERSSA' },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function suggestDistributor(province: string, canton?: string) {
  const c = COVERAGE.find((x) => norm(x.province) === norm(province));
  if (!c) return null;
  const byCanton = canton ? Object.entries(c.cantons ?? {}).find(([k]) => norm(k) === norm(canton))?.[1] : undefined;
  return DISTRIBUTORS.find((d) => d.code === (byCanton ?? c.distributor)) ?? null;
}
export const distributorByCode = (code: string) => DISTRIBUTORS.find((d) => d.code === code) ?? null;

// ---------------------------------------------------------------- Tablas del Anexo 1 (transcripción)
/** Límites superiores de los rangos residenciales «1-50, 51-100, …, Superior» (bloques incrementales). */
export const RES_LIMITS = [50, 100, 150, 200, 250, 300, 350, 500, 700, 1000, 1500, 2500, 3500, null] as const;
const RES_BASE = [0.091, 0.093, 0.095, 0.097, 0.099, 0.101, 0.103, 0.105, 0.1285, 0.145, 0.1709, 0.2752, 0.436, 0.6812];
const withFirst3 = (a: number, b: number, c: number) => [a, b, c, ...RES_BASE.slice(3)];
/** Temporada diciembre–mayo de la Costa: bloques 501–700 y 701–1000. */
const dryMonths = (r: number[]) => r.map((v, i) => (i === 8 ? 0.105 : i === 9 ? 0.1109 : v));

type Two = [number, number];
type Four = [number, number, number, number];
export type GroupTables = {
  residential: number[];
  residentialSeasonal: boolean;
  comBvSd: Two; artBvSd: Two;
  bvDemand: number; comBvD: number; indBvD: number;
  comBvH: Two; indBvH: Two;
  mvDemand: number; comMvD: number; indMvD: number;
  mvHorariaDemand: number; comMvH: Two;
  indMvHD: Four;
  avDemand: number; comAvH: Two; indAv1HD: Four;
};

/** Por grupo: valores tal como aparecen en el Anexo 1 (comercialización 1,414 salvo AV2: 7,066). */
export const TABLES: Record<GroupCode, GroupTables> = {
  SIERRA_SUR: {
    residential: RES_BASE, residentialSeasonal: false,
    comBvSd: [0.092, 0.103], artBvSd: [0.073, 0.089],
    bvDemand: 4.79, comBvD: 0.09, indBvD: 0.08, comBvH: [0.09, 0.072], indBvH: [0.065, 0.069],
    mvDemand: 4.79, comMvD: 0.123, indMvD: 0.118, mvHorariaDemand: 4.576, comMvH: [0.123, 0.105],
    indMvHD: [0.1178, 0.1318, 0.1001, 0.1178],
    avDemand: 4.4, comAvH: [0.3005, 0.2808], indAv1HD: [0.3106, 0.3509, 0.2747, 0.3106],
  },
  COSTA_ORIENTE: {
    residential: RES_BASE, residentialSeasonal: true,
    comBvSd: [0.092, 0.103], artBvSd: [0.073, 0.089],
    bvDemand: 4.79, comBvD: 0.09, indBvD: 0.08, comBvH: [0.09, 0.072], indBvH: [0.065, 0.069],
    mvDemand: 4.79, comMvD: 0.123, indMvD: 0.118, mvHorariaDemand: 4.576, comMvH: [0.123, 0.105],
    indMvHD: [0.1178, 0.1318, 0.1001, 0.1178],
    avDemand: 4.4, comAvH: [0.3005, 0.2808], indAv1HD: [0.3106, 0.3509, 0.2747, 0.3106],
  },
  GYE: {
    residential: withFirst3(0.078, 0.081, 0.083), residentialSeasonal: true,
    comBvSd: [0.082, 0.11], artBvSd: [0.064, 0.1],
    bvDemand: 4.055, comBvD: 0.092, indBvD: 0.082, comBvH: [0.092, 0.074], indBvH: [0.067, 0.071],
    mvDemand: 4.003, comMvD: 0.123, indMvD: 0.114, mvHorariaDemand: 4.003, comMvH: [0.123, 0.106],
    indMvHD: [0.1142, 0.1262, 0.1002, 0.1142],
    avDemand: 3.93, comAvH: [0.3005, 0.2808], indAv1HD: [0.3106, 0.3509, 0.2747, 0.3106],
  },
  EEQ: {
    residential: withFirst3(0.078, 0.081, 0.083), residentialSeasonal: false,
    comBvSd: [0.081, 0.104], artBvSd: [0.062, 0.094],
    bvDemand: 4.182, comBvD: 0.088, indBvD: 0.078, comBvH: [0.088, 0.07], indBvH: [0.063, 0.067],
    mvDemand: 4.129, comMvD: 0.123, indMvD: 0.118, mvHorariaDemand: 4.129, comMvH: [0.123, 0.105],
    indMvHD: [0.1176, 0.1316, 0.1011, 0.1176],
    avDemand: 4.053, comAvH: [0.3005, 0.2808], indAv1HD: [0.3106, 0.3509, 0.2747, 0.3106],
  },
};
/** AV2 (Grupo 2, > 138 kV) es igual en los cuatro grupos. */
export const AV2 = { demand: 4.3, energy: [0.2905, 0.3338, 0.2676, 0.2905] as Four, commercialization: 7.066 };
export const COMMERCIALIZATION = 1.414;

// ---------------------------------------------------------------- Construcción de tarifas
const one = (p: number): EnergyCharge[] => [{ period: 'unico', blocks: [{ fromKwh: 0, toKwh: null, usdPerKwh: p }] }];
const twoRanges = ([a, b]: Two): EnergyCharge[] => [{ period: 'unico', blocks: [{ fromKwh: 0, toKwh: 300, usdPerKwh: a }, { fromKwh: 300, toKwh: null, usdPerKwh: b }] }];
const horaria = ([d, n]: Two): EnergyCharge[] => [
  { period: 'h08_22', blocks: [{ fromKwh: 0, toKwh: null, usdPerKwh: d }] },
  { period: 'h22_08', blocks: [{ fromKwh: 0, toKwh: null, usdPerKwh: n }] },
];
const diferenciada = ([a, b, c, d]: Four): EnergyCharge[] => [
  { period: 'lv_08_18', blocks: [{ fromKwh: 0, toKwh: null, usdPerKwh: a }] },
  { period: 'lv_18_22', blocks: [{ fromKwh: 0, toKwh: null, usdPerKwh: b }] },
  { period: 'base', blocks: [{ fromKwh: 0, toKwh: null, usdPerKwh: c }] },
  { period: 'sdf_18_22', blocks: [{ fromKwh: 0, toKwh: null, usdPerKwh: d }] },
];
function resBlocks(prices: number[]) {
  let from = 0;
  return RES_LIMITS.map((to, i) => { const b = { fromKwh: from, toKwh: to, usdPerKwh: prices[i] }; if (to != null) from = to; return b; });
}

type Spec = {
  key: string; name: string; category: 'residencial' | 'general'; consumerGroup: string; demandType: DemandType; voltage: VoltageGroup;
  scheme: PeriodScheme; energy: EnergyCharge[]; demand?: { usd: number; factor: DemandFactor }; commercialization?: number; page: string;
};

function specs(t: GroupTables): Spec[] {
  const res: EnergyCharge[] = t.residentialSeasonal
    ? [{ period: 'unico', months: [6, 7, 8, 9, 10, 11], blocks: resBlocks(t.residential) }, { period: 'unico', months: [12, 1, 2, 3, 4, 5], blocks: resBlocks(dryMonths(t.residential)) }]
    : [{ period: 'unico', blocks: resBlocks(t.residential) }];
  return [
    { key: 'RES', name: 'Residencial (bajo y medio voltaje)', category: 'residencial', consumerGroup: 'residencial', demandType: 'sin_demanda', voltage: 'BV', scheme: 'UNICO', energy: res, page: 'Anexo 1, categoría residencial' },
    { key: 'COM-BV-SD', name: 'Comercial, bajo voltaje sin demanda', category: 'general', consumerGroup: 'comercial', demandType: 'sin_demanda', voltage: 'BV', scheme: 'UNICO', energy: twoRanges(t.comBvSd), page: 'Anexo 1, BV sin demanda' },
    { key: 'ART-BV-SD', name: 'Industrial artesanal, bajo voltaje sin demanda', category: 'general', consumerGroup: 'industrial_artesanal', demandType: 'sin_demanda', voltage: 'BV', scheme: 'UNICO', energy: twoRanges(t.artBvSd), page: 'Anexo 1, BV sin demanda' },
    { key: 'COM-BV-D', name: 'Comercial, bajo voltaje con demanda', category: 'general', consumerGroup: 'comercial', demandType: 'con_demanda', voltage: 'BV', scheme: 'UNICO', energy: one(t.comBvD), demand: { usd: t.bvDemand, factor: 'ninguno' }, page: 'Anexo 1, BV con demanda' },
    { key: 'IND-BV-D', name: 'Industrial, bajo voltaje con demanda', category: 'general', consumerGroup: 'industrial', demandType: 'con_demanda', voltage: 'BV', scheme: 'UNICO', energy: one(t.indBvD), demand: { usd: t.bvDemand, factor: 'ninguno' }, page: 'Anexo 1, BV con demanda' },
    { key: 'COM-BV-H', name: 'Comercial, bajo voltaje con demanda horaria', category: 'general', consumerGroup: 'comercial', demandType: 'horaria', voltage: 'BV', scheme: 'HORARIA_2', energy: horaria(t.comBvH), demand: { usd: t.bvDemand, factor: 'FGD' }, page: 'Anexo 1, BV con demanda horaria' },
    { key: 'IND-BV-H', name: 'Industrial, bajo voltaje con demanda horaria', category: 'general', consumerGroup: 'industrial', demandType: 'horaria', voltage: 'BV', scheme: 'HORARIA_2', energy: horaria(t.indBvH), demand: { usd: t.bvDemand, factor: 'FGD' }, page: 'Anexo 1, BV con demanda horaria' },
    { key: 'COM-MV-D', name: 'Comercial, medio voltaje con demanda', category: 'general', consumerGroup: 'comercial', demandType: 'con_demanda', voltage: 'MV', scheme: 'UNICO', energy: one(t.comMvD), demand: { usd: t.mvDemand, factor: 'ninguno' }, page: 'Anexo 1, MV con demanda' },
    { key: 'IND-MV-D', name: 'Industrial, medio voltaje con demanda', category: 'general', consumerGroup: 'industrial', demandType: 'con_demanda', voltage: 'MV', scheme: 'UNICO', energy: one(t.indMvD), demand: { usd: t.mvDemand, factor: 'ninguno' }, page: 'Anexo 1, MV con demanda' },
    { key: 'COM-MV-H', name: 'Comercial, medio voltaje con demanda horaria', category: 'general', consumerGroup: 'comercial', demandType: 'horaria', voltage: 'MV', scheme: 'HORARIA_2', energy: horaria(t.comMvH), demand: { usd: t.mvHorariaDemand, factor: 'FGD' }, page: 'Anexo 1, MV con demanda horaria' },
    { key: 'IND-MV-HD', name: 'Industrial, medio voltaje con demanda horaria diferenciada', category: 'general', consumerGroup: 'industrial', demandType: 'horaria_diferenciada', voltage: 'MV', scheme: 'DIFERENCIADA_4', energy: diferenciada(t.indMvHD), demand: { usd: t.mvHorariaDemand, factor: 'FGDI' }, page: 'Anexo 1, MV con demanda horaria diferenciada' },
    { key: 'COM-AV-H', name: 'Comercial, alto voltaje (AV1) con demanda horaria', category: 'general', consumerGroup: 'comercial', demandType: 'horaria', voltage: 'AV1', scheme: 'HORARIA_2', energy: horaria(t.comAvH), demand: { usd: t.avDemand, factor: 'FGD' }, page: 'Anexo 1, AV con demanda horaria' },
    { key: 'IND-AV1-HD', name: 'Industrial, alto voltaje AV1 con demanda horaria diferenciada', category: 'general', consumerGroup: 'industrial', demandType: 'horaria_diferenciada', voltage: 'AV1', scheme: 'DIFERENCIADA_4', energy: diferenciada(t.indAv1HD), demand: { usd: t.avDemand, factor: 'FGDI' }, page: 'Anexo 1, AV con demanda horaria diferenciada' },
    { key: 'IND-AV2-HD', name: 'Industrial, alto voltaje AV2 con demanda horaria diferenciada', category: 'general', consumerGroup: 'industrial', demandType: 'horaria_diferenciada', voltage: 'AV2', scheme: 'DIFERENCIADA_4', energy: diferenciada(AV2.energy), demand: { usd: AV2.demand, factor: 'ninguno' }, commercialization: AV2.commercialization, page: 'Anexo 1, AV2' },
  ];
}

/** Todas las tarifas del pliego cargadas en la calculadora (56: 14 por grupo). */
export const OFFICIAL_TARIFFS: TariffV2[] = (Object.keys(TABLES) as GroupCode[]).flatMap((g) =>
  specs(TABLES[g]).map((s) => {
    const structure: TariffStructure = {
      scheme: s.scheme,
      commercialization: { usdPerMonth: s.commercialization ?? COMMERCIALIZATION },
      energy: s.energy,
      ...(s.demand ? { demand: { usdPerKwMonth: s.demand.usd, factor: s.demand.factor, minShareOfMax12: 0.6 } } : {}),
      ...(s.category === 'general' ? { powerFactor: { threshold: 0.94 } } : {}),
    };
    return {
      code: `${g}-${s.key}`, officialName: s.name, category: s.category, consumerGroup: s.consumerGroup, demandType: s.demandType,
      voltageGroup: s.voltage, distributors: DISTRIBUTORS.filter((d) => d.group === g).map((d) => d.code), structure,
      sourceNote: `${SCHEDULE.title}; ${s.page}.`, sourcePage: s.page, status: 'provisional', version: 1,
    } satisfies TariffV2;
  }));

export const tariffByCode = (code: string) => OFFICIAL_TARIFFS.find((t) => t.code === code) ?? null;
export const tariffKeyOf = (code: string) => code.replace(/^(SIERRA_SUR|COSTA_ORIENTE|GYE|EEQ)-/, '');
export const groupOf = (distributorCode: string): GroupCode | null => distributorByCode(distributorCode)?.group ?? null;
