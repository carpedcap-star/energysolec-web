import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../engine/params';
import { defaultTariffKey, matchDistributor, selectTariff } from './tariff-select';

const P = DEFAULT_PARAMS;
describe('selección de tarifa del pliego oficial', () => {
  it('reconoce la distribuidora como la escribe una planilla', () => {
    expect(matchDistributor('Empresa Eléctrica Quito S.A.')?.code).toBe('EEQ');
    expect(matchDistributor('CNEL EP Unidad de Negocio Guayaquil')?.code).toBe('CNEL-GYE');
    expect(matchDistributor('CNEL EP UN GUAYAS LOS RIOS')?.code).toBe('CNEL-GLR');
    expect(matchDistributor('CENTROSUR')?.code).toBe('CENTROSUR');
    expect(matchDistributor('Empresa Eléctrica Regional del Sur')?.code).toBe('EERSSA');
    expect(matchDistributor('???')).toBeNull();
  });
  it('sin distribuidora la sugiere por ubicación y lo marca', () => {
    const t = selectTariff({ segment: 'residencial', province: 'Guayas', city: 'Guayaquil', p: P });
    expect(t.code).toBe('GYE-RES');
    expect(t.distributor).toEqual({ code: 'CNEL-GYE', name: 'CNEL EP Guayaquil', suggested: true });
    expect(t.options?.crossSubsidy?.contributionShare).toBe(0.05);
    expect(t.isPlaceholder).toBe(true);
  });
  it('la planilla manda sobre la ubicación', () => {
    const t = selectTariff({ segment: 'comercial', province: 'Guayas', distributor: 'Empresa Eléctrica Quito', tariffKey: 'COM-BV-H', p: P });
    expect(t.code).toBe('EEQ-COM-BV-H');
    expect(t.distributor?.suggested).toBe(false);
    expect(t.assumed).toBe(false);
  });
  it('categoría supuesta por consumo y demanda, advertida', () => {
    expect(defaultTariffKey('comercial', 500)).toBe('COM-BV-SD');
    expect(defaultTariffKey('comercial', 5000)).toBe('COM-BV-D');
    expect(defaultTariffKey('industrial', 50_000)).toBe('IND-MV-HD');
    expect(defaultTariffKey('industrial', 1000, 20)).toBe('IND-BV-D');
    expect(selectTariff({ segment: 'industrial', province: 'Azuay', monthlyKwh: 50_000, p: P }).assumed).toBe(true);
  });
  it('revisado por Gerencia deja de ser provisional', () => {
    const p = { ...P, financial: { ...P.financial, officialTariffsReviewed: true } };
    expect(selectTariff({ segment: 'residencial', province: 'Pichincha', p }).isPlaceholder).toBe(false);
  });
});
