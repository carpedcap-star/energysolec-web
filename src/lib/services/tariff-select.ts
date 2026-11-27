import { DISTRIBUTORS, SCHEDULE, distributorByCode, suggestDistributor, tariffByCode, type GroupCode } from '@/content/tarifas/pliego-2026';
import type { CalcParams } from '../engine/params';
import type { SelectedTariff } from '../engine/study';

/** Claves de tarifa que puede elegir (o que la planilla puede indicar) cada segmento. */
export const TARIFF_CHOICES: Record<'residencial' | 'comercial' | 'industrial', { key: string; label: string }[]> = {
  residencial: [{ key: 'RES', label: 'Residencial' }],
  comercial: [
    { key: 'COM-BV-SD', label: 'Comercial sin demanda (hasta 10 kW)' },
    { key: 'COM-BV-D', label: 'Comercial con demanda, bajo voltaje' },
    { key: 'COM-BV-H', label: 'Comercial con demanda horaria, bajo voltaje' },
    { key: 'COM-MV-D', label: 'Comercial con demanda, medio voltaje' },
    { key: 'COM-MV-H', label: 'Comercial con demanda horaria, medio voltaje' },
    { key: 'COM-AV-H', label: 'Comercial alto voltaje' },
  ],
  industrial: [
    { key: 'ART-BV-SD', label: 'Industrial artesanal (hasta 10 kW)' },
    { key: 'IND-BV-D', label: 'Industrial con demanda, bajo voltaje' },
    { key: 'IND-BV-H', label: 'Industrial con demanda horaria, bajo voltaje' },
    { key: 'IND-MV-D', label: 'Industrial con demanda, medio voltaje' },
    { key: 'IND-MV-HD', label: 'Industrial con demanda horaria, medio voltaje' },
    { key: 'IND-AV1-HD', label: 'Industrial alto voltaje (AV1)' },
    { key: 'IND-AV2-HD', label: 'Industrial alto voltaje (AV2)' },
  ],
};

/** Categoría supuesta cuando el cliente no la sabe (se advierte en el estudio). */
export function defaultTariffKey(segment: 'residencial' | 'comercial' | 'industrial', monthlyKwh?: number, demandKw?: number) {
  if (segment === 'residencial') return 'RES';
  const d = demandKw ?? 0;
  if (segment === 'comercial') return d > 10 || (monthlyKwh ?? 0) > 3000 ? 'COM-BV-D' : 'COM-BV-SD';
  if (d > 50 || (monthlyKwh ?? 0) > 10_000) return 'IND-MV-HD';
  return d > 10 || (monthlyKwh ?? 0) > 3000 ? 'IND-BV-D' : 'ART-BV-SD';
}

/** Distribuidora a partir de un texto (código o nombre como aparece en la planilla). */
export function matchDistributor(text: string | undefined | null) {
  if (!text) return null;
  const n = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const byCode = distributorByCode(text.toUpperCase());
  if (byCode) return byCode;
  const rules: [RegExp, string][] = [
    [/quito|\beeq\b/, 'EEQ'], [/guayaquil|\bgye\b|eelgye/, 'CNEL-GYE'], [/centro ?sur/, 'CENTROSUR'], [/ambato|eeasa/, 'EEASA'],
    [/azogues/, 'EEA'], [/cotopaxi|elepco/, 'ELEPCO'], [/norte|emelnorte/, 'EMELNORTE'], [/riobamba|eersa\b/, 'EERSA'],
    [/regional del sur|\bsur\b|eerssa/, 'EERSSA'], [/galapagos|elecgalapagos/, 'EEGAL'], [/bolivar/, 'CNEL-BOL'], [/el oro/, 'CNEL-ORO'],
    [/esmeraldas/, 'CNEL-ESM'], [/guayas.?los rios/, 'CNEL-GLR'], [/los rios/, 'CNEL-LRS'], [/manabi/, 'CNEL-MAN'], [/milagro/, 'CNEL-MIL'],
    [/santa elena/, 'CNEL-STE'], [/santo domingo/, 'CNEL-SDO'], [/sucumbios/, 'CNEL-SUC'],
  ];
  for (const [re, code] of rules) if (re.test(n)) return distributorByCode(code);
  return null;
}

/** Tarifa con la que se calcula el estudio: pliego oficial por distribuidora y categoría. */
export function selectTariff(o: {
  segment: 'residencial' | 'comercial' | 'industrial'; province: string; city?: string; distributor?: string; tariffKey?: string;
  monthlyKwh?: number; demandKw?: number; p: CalcParams;
}): SelectedTariff {
  const given = matchDistributor(o.distributor);
  const dist = given ?? suggestDistributor(o.province, o.city) ?? DISTRIBUTORS.find((d) => d.code === 'EEQ')!;
  const valid = TARIFF_CHOICES[o.segment].some((c) => c.key === o.tariffKey);
  const key = valid ? o.tariffKey! : defaultTariffKey(o.segment, o.monthlyKwh, o.demandKw);
  const t = tariffByCode(`${dist.group as GroupCode}-${key}`)!;
  return {
    code: t.code, name: `${t.officialName} · ${dist.name}`, sourceNote: t.sourceNote, isPlaceholder: !o.p.financial.officialTariffsReviewed,
    structure: t.structure,
    options: o.segment === 'residencial' ? {
      crossSubsidy: { distributor: dist.code, receivesUpToKwh: dist.receivesUpToKwh, contributesAboveKwh: dist.contributesAboveKwh, contributionShare: dist.contributionShare, status: 'provisional', sourceNote: `${SCHEDULE.title}, Anexo 2` },
    } : undefined,
    distributor: { code: dist.code, name: dist.name, suggested: !given },
    assumed: !valid && o.segment !== 'residencial',
  };
}

/**
 * Tarifa especial que el motor no tiene transcrita (bombeo de agua, entidades oficiales…): estudio PRELIMINAR con el
 * costo efectivo de la planilla. Energía = cargos de energía ÷ kWh (si la planilla los desglosa; si no, el servicio
 * eléctrico completo ÷ kWh, y se advierte que puede sobrestimar el ahorro). El resto del servicio (demanda,
 * comercialización, otros) queda como cargo fijo que la generación solar no reduce. Nunca se asigna otra categoría.
 */
export function effectiveCostTariff(o: { category: string; kwh: number; serviceUsd: number; energyUsd?: number | null; distributor?: string; province: string; city?: string; p: CalcParams }): SelectedTariff & { effective: { usdPerKwh: number; fixedUsd: number; fromBreakdown: boolean } } {
  const fromBreakdown = !!(o.energyUsd && o.energyUsd > 0 && o.energyUsd <= o.serviceUsd);
  const energy = fromBreakdown ? o.energyUsd! : o.serviceUsd;
  const usdPerKwh = Math.round((energy / o.kwh) * 1e5) / 1e5;
  const fixedUsd = Math.round((o.serviceUsd - energy) * 100) / 100;
  const dist = matchDistributor(o.distributor) ?? suggestDistributor(o.province, o.city);
  return {
    code: 'ESPECIAL', name: `${o.category} (tarifa especial, costo efectivo de tu planilla)`,
    sourceNote: `Costo efectivo leído de tu planilla: $${usdPerKwh.toFixed(4)} por kWh de energía${fixedUsd > 0 ? ` y $${fixedUsd.toFixed(2)} al mes de cargos que no dependen de la energía (demanda, comercialización, otros)` : ''}. La categoría no está transcrita en el motor tarifario.`,
    isPlaceholder: true,
    structure: { scheme: 'UNICO', commercialization: { usdPerMonth: fixedUsd }, energy: [{ period: 'unico', blocks: [{ fromKwh: 0, toKwh: null, usdPerKwh }] }] },
    distributor: dist ? { code: dist.code, name: dist.name, suggested: !matchDistributor(o.distributor) } : null,
    assumed: false,
    effective: { usdPerKwh, fixedUsd, fromBreakdown },
  };
}
