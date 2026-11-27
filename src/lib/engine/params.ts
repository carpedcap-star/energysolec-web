import { z } from 'zod';

/**
 * Parámetros del motor. En producción se leen de calc_params (versión activa)
 * y se editan en /admin/parametros. Los valores por defecto de este archivo son
 * PROVISIONALES (isPlaceholder=true) y la interfaz lo advierte mientras lo sean.
 */
export const TechnicalParams = z.object({
  moduleWp: z.number().positive(),            // potencia del módulo de referencia
  moduleAreaM2: z.number().positive(),
  roofM2PerKwp: z.number().positive(),        // incluye pasillos y retiros
  groundM2PerKwp: z.number().positive(),
  dcAcRatio: z.number().min(0.8).max(1.6),
  // Pérdidas de sistema (se aplican UNA sola vez sobre un rendimiento de fuente que NO las incluye)
  soilingLoss: z.number().min(0).max(0.3),
  dcWiringMismatchLoss: z.number().min(0).max(0.1),
  acWiringLoss: z.number().min(0).max(0.05),
  inverterEfficiency: z.number().min(0.9).max(1),
  availability: z.number().min(0.9).max(1),
  shadingLoss: z.object({ none: z.number(), partial: z.number(), significant: z.number() }),
  firstYearDegradation: z.number().min(0).max(0.05),
  annualDegradation: z.number().min(0).max(0.02),
  batteryRoundTrip: z.number().min(0.7).max(1),
  batteryUsableDoD: z.number().min(0.5).max(1),
  defaultDaytimeShare: z.object({ residencial: z.number(), comercial: z.number(), industrial: z.number() }),
  coverageTarget: z.number().min(0.3).max(1.2),     // fracción del consumo a cubrir si hay compensación de excedentes
  gridCo2KgPerKwh: z.number().min(0),               // factor de emisión del SNI
  // Rendimientos regionales conservadores (kWh/kWp/año ANTES de pérdidas de sistema) si las APIs no responden
  fallbackYield: z.record(z.string(), z.number()),
  // Superficies: m² por kWp según el tipo de implantación (incluye pasillos, retiros y separación entre filas).
  // Supuestos a validar por Ingeniería, editables en el panel.
  mountingM2PerKwp: z.object({ techo_metalico: z.number().positive(), techo_inclinado: z.number().positive(), losa: z.number().positive(), terreno: z.number().positive() })
    .default({ techo_metalico: 6, techo_inclinado: 6, losa: 12, terreno: 12 }),
  // Almacenamiento. La reserva mínima de SOC y la profundidad de descarga NO se suman: se usa la más restrictiva.
  /** Fuente de radiación: mediana de PVGIS-NSRDB, PVGIS-ERA5 y NASA POWER, o la menor (conservador). */
  resourceSelection: z.enum(['mediana', 'minimo']).default('mediana'),
  /** Usar el terreno solo después de cubiertas y losas (criterio de Gerencia). */
  groundLast: z.boolean().default(true),
  socMinReserve: z.number().min(0).max(0.5).default(0.1),
  hybridBackupHours: z.number().min(1).max(72).default(8),
  offGridAutonomyHours: z.number().min(12).max(168).default(48),
  offGridReliability: z.number().min(0.9).max(1).default(0.999),
  // Supuestos de perfil de carga (sin curva de carga medida): fracción de la carga que es «esencial» o «parcial» y
  // relación entre la potencia pico y la media. Se muestran como supuestos en el estudio.
  backupLoadShare: z.object({ esencial: z.number().min(0.05).max(1), parcial: z.number().min(0.05).max(1), total: z.number().min(0.05).max(1) })
    .default({ esencial: 0.25, parcial: 0.5, total: 1 }),
  peakToAverageLoad: z.object({ residencial: z.number().min(1).max(10), comercial: z.number().min(1).max(10), industrial: z.number().min(1).max(10) })
    .default({ residencial: 3, comercial: 2.5, industrial: 2 }),
  // Off Grid: días seguidos de baja generación y fracción del rendimiento del mes crítico en esos días.
  offGridLowSunDays: z.number().int().min(1).max(10).default(3),
  offGridLowSunFactor: z.number().min(0.05).max(1).default(0.3),
});

export const FinancialParams = z.object({
  lifetimeYears: z.number().int().min(10).max(40),
  discountRate: z.number().min(0).max(0.3),
  omUsdPerKwpYear: z.number().min(0),
  omEscalation: z.number().min(0).max(0.1),
  inverterReplacementYear: z.number().int(),
  inverterReplacementShareOfCapex: z.number().min(0).max(0.5),
  batteryReplacementYear: z.number().int(),
  // Excedentes: por defecto NO se valoran hasta verificar la regulación aplicable
  exportCompensation: z.enum(['none', 'net_balance', 'fixed_price']),
  exportPriceUsdPerKwh: z.number().min(0),
  demandSavingsFromPv: z.boolean(),                 // por defecto false (conservador)
  /** Gerencia revisó el pliego oficial cargado (src/content/tarifas) contra el PDF de ARCONEL. */
  officialTariffsReviewed: z.boolean().default(false),
  scenarios: z.object({
    conservador: z.object({ yieldFactor: z.number(), tariffEscalation: z.number(), capexFactor: z.number(), extraDegradation: z.number() }),
    base:        z.object({ yieldFactor: z.number(), tariffEscalation: z.number(), capexFactor: z.number(), extraDegradation: z.number() }),
    optimista:   z.object({ yieldFactor: z.number(), tariffEscalation: z.number(), capexFactor: z.number(), extraDegradation: z.number() }),
  }),
  financing: z.object({ enabled: z.boolean(), annualRate: z.number(), years: z.number().int(), downPayment: z.number() }),
});

const Tiers = z.array(z.object({ upToKwp: z.number(), usdPerKwp: z.number() })).min(1);
/** Sobreprecio por kWp según la estructura (0 = incluido en el precio base del sistema). */
export const MOUNTING_PRICE_KEYS = ['cubierta_metalica', 'techo_inclinado', 'losa', 'hincado', 'cimentado'] as const;

const PricingObject = z.object({
  // Precio llave en mano por kWp (USD, sin IVA) por tramo de tamaño: economías de escala
  pvTiers: z.array(z.object({ upToKwp: z.number(), usdPerKwp: z.number() })).min(1),
  engineeringShare: z.number().min(0).max(0.3),     // ingeniería/permisos sobre equipos+instalación
  batteryUsdPerKwh: z.number().min(0),
  vatOnCapex: z.number().min(0).max(0.3),
  minimumProjectUsd: z.number().min(0),
  // Precios por tipo de sistema (USD/kWp de la parte fotovoltaica, sin estructura especial ni baterías).
  hybridPvTiers: Tiers,
  offGridPvTiers: Tiers,
  mountingUsdPerKwp: z.object(Object.fromEntries(MOUNTING_PRICE_KEYS.map((k) => [k, z.number().min(0)])) as Record<(typeof MOUNTING_PRICE_KEYS)[number], z.ZodNumber>),
  // Baterías por capacidad (USD/kWh nominal) en tramos.
  batteryTiers: z.array(z.object({ upToKwh: z.number(), usdPerKwh: z.number() })).min(1),
});
/** Las versiones guardadas antes de esta ampliación toman los precios nuevos de los que ya tenían (no se inventan). */
export const PricingParams = z.preprocess((v) => {
  if (!v || typeof v !== 'object') return v;
  const p = v as Record<string, any>;
  return {
    ...p,
    hybridPvTiers: p.hybridPvTiers ?? p.pvTiers,
    offGridPvTiers: p.offGridPvTiers ?? p.pvTiers,
    mountingUsdPerKwp: p.mountingUsdPerKwp ?? Object.fromEntries(MOUNTING_PRICE_KEYS.map((k) => [k, 0])),
    batteryTiers: p.batteryTiers ?? [{ upToKwh: 1e9, usdPerKwh: p.batteryUsdPerKwh }],
  };
}, PricingObject);

export const CalcParams = z.object({
  version: z.number().int(),
  isPlaceholder: z.boolean(),
  technical: TechnicalParams,
  financial: FinancialParams,
  pricing: PricingParams,
});
export type CalcParams = z.infer<typeof CalcParams>;

export const DEFAULT_PARAMS: CalcParams = {
  version: 0,
  isPlaceholder: true,
  technical: {
    moduleWp: 580,
    moduleAreaM2: 2.58,
    roofM2PerKwp: 6.0,
    groundM2PerKwp: 12.0,
    dcAcRatio: 1.2,
    soilingLoss: 0.03,
    dcWiringMismatchLoss: 0.025,
    acWiringLoss: 0.01,
    inverterEfficiency: 0.975,
    availability: 0.99,
    shadingLoss: { none: 0, partial: 0.06, significant: 0.15 },
    firstYearDegradation: 0.01,
    annualDegradation: 0.005,     // aprobado como referencia inicial (0,50 %/año)
    batteryRoundTrip: 0.9,
    batteryUsableDoD: 0.9,
    defaultDaytimeShare: { residencial: 0.35, comercial: 0.65, industrial: 0.7 },
    coverageTarget: 0.9,
    gridCo2KgPerKwh: 0.3,          // PROVISIONAL: reemplazar con el factor oficial vigente del SNI (MAATE/CENACE)
    fallbackYield: { costa: 1150, sierra: 1250, amazonia: 1050, insular: 1400 },
    mountingM2PerKwp: { techo_metalico: 6, techo_inclinado: 6, losa: 12, terreno: 12 },
    resourceSelection: 'mediana',
    groundLast: true,
    socMinReserve: 0.1,
    hybridBackupHours: 8,
    offGridAutonomyHours: 48,
    offGridReliability: 0.999,
    backupLoadShare: { esencial: 0.25, parcial: 0.5, total: 1 },
    peakToAverageLoad: { residencial: 3, comercial: 2.5, industrial: 2 },
    offGridLowSunDays: 3,
    offGridLowSunFactor: 0.3,
  },
  financial: {
    lifetimeYears: 25,
    discountRate: 0.1,
    omUsdPerKwpYear: 12,
    omEscalation: 0.02,
    inverterReplacementYear: 13,
    inverterReplacementShareOfCapex: 0.1,
    batteryReplacementYear: 12,
    exportCompensation: 'none',
    exportPriceUsdPerKwh: 0,
    demandSavingsFromPv: false,
    officialTariffsReviewed: false,
    // Incremento tarifario: base 0 % y alternativo 3 % anual (criterios aprobados como referencia inicial).
    scenarios: {
      conservador: { yieldFactor: 0.93, tariffEscalation: 0, capexFactor: 1.1, extraDegradation: 0.002 },
      base:        { yieldFactor: 1.0,  tariffEscalation: 0, capexFactor: 1.0, extraDegradation: 0 },
      optimista:   { yieldFactor: 1.03, tariffEscalation: 0.03, capexFactor: 0.95, extraDegradation: 0 },
    },
    financing: { enabled: false, annualRate: 0.11, years: 5, downPayment: 0.3 },
  },
  pricing: {
    pvTiers: [
      { upToKwp: 5, usdPerKwp: 1150 },
      { upToKwp: 20, usdPerKwp: 980 },
      { upToKwp: 100, usdPerKwp: 840 },
      { upToKwp: 500, usdPerKwp: 720 },
      { upToKwp: 1e9, usdPerKwp: 640 },
    ],
    engineeringShare: 0,          // el precio por kWp es el precio final de venta: la ingeniería ya está incluida
    batteryUsdPerKwh: 480,
    vatOnCapex: 0.15,
    minimumProjectUsd: 3500,
    hybridPvTiers: [
      { upToKwp: 5, usdPerKwp: 1150 }, { upToKwp: 20, usdPerKwp: 980 }, { upToKwp: 100, usdPerKwp: 840 }, { upToKwp: 500, usdPerKwp: 720 }, { upToKwp: 1e9, usdPerKwp: 640 },
    ],
    offGridPvTiers: [
      { upToKwp: 5, usdPerKwp: 1150 }, { upToKwp: 20, usdPerKwp: 980 }, { upToKwp: 100, usdPerKwp: 840 }, { upToKwp: 500, usdPerKwp: 720 }, { upToKwp: 1e9, usdPerKwp: 640 },
    ],
    mountingUsdPerKwp: { cubierta_metalica: 0, techo_inclinado: 0, losa: 0, hincado: 0, cimentado: 0 },
    batteryTiers: [{ upToKwh: 1e9, usdPerKwh: 480 }],
  },
};
