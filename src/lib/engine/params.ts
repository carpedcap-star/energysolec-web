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
  scenarios: z.object({
    conservador: z.object({ yieldFactor: z.number(), tariffEscalation: z.number(), capexFactor: z.number(), extraDegradation: z.number() }),
    base:        z.object({ yieldFactor: z.number(), tariffEscalation: z.number(), capexFactor: z.number(), extraDegradation: z.number() }),
    optimista:   z.object({ yieldFactor: z.number(), tariffEscalation: z.number(), capexFactor: z.number(), extraDegradation: z.number() }),
  }),
  financing: z.object({ enabled: z.boolean(), annualRate: z.number(), years: z.number().int(), downPayment: z.number() }),
});

export const PricingParams = z.object({
  // Precio llave en mano por kWp (USD, sin IVA) por tramo de tamaño: economías de escala
  pvTiers: z.array(z.object({ upToKwp: z.number(), usdPerKwp: z.number() })).min(1),
  engineeringShare: z.number().min(0).max(0.3),     // ingeniería/permisos sobre equipos+instalación
  batteryUsdPerKwh: z.number().min(0),
  vatOnCapex: z.number().min(0).max(0.3),
  minimumProjectUsd: z.number().min(0),
});

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
    annualDegradation: 0.004,
    batteryRoundTrip: 0.9,
    batteryUsableDoD: 0.9,
    defaultDaytimeShare: { residencial: 0.35, comercial: 0.65, industrial: 0.7 },
    coverageTarget: 0.9,
    gridCo2KgPerKwh: 0.3,          // PROVISIONAL: reemplazar con el factor oficial vigente del SNI (MAATE/CENACE)
    fallbackYield: { costa: 1150, sierra: 1250, amazonia: 1050, insular: 1400 },
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
    scenarios: {
      conservador: { yieldFactor: 0.93, tariffEscalation: 0, capexFactor: 1.1, extraDegradation: 0.002 },
      base:        { yieldFactor: 1.0,  tariffEscalation: 0.01, capexFactor: 1.0, extraDegradation: 0 },
      optimista:   { yieldFactor: 1.03, tariffEscalation: 0.02, capexFactor: 0.95, extraDegradation: 0 },
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
    engineeringShare: 0.05,
    batteryUsdPerKwh: 480,
    vatOnCapex: 0.15,
    minimumProjectUsd: 3500,
  },
};
