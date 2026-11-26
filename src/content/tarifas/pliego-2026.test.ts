import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AV2, DISTRIBUTORS, OFFICIAL_TARIFFS, SCHEDULE, TABLES, suggestDistributor, tariffByCode, type GroupCode } from './pliego-2026';
import { computeBill } from '@/lib/engine/tariff-v2';
import { PROVINCES } from '@/lib/ecuador';

/**
 * Verifica la transcripción contra el texto del PDF oficial (docs/normativa/pliego_spee_2026_codificado.txt, extraído
 * con `pdftotext -layout` del documento de arconel.gob.ec). Si alguien cambia un valor del catálogo, esta prueba falla.
 */
const TEXT = readFileSync('docs/normativa/pliego_spee_2026_codificado.txt', 'utf8');
const flat = TEXT.replace(/\s+/g, ' ');

function slice(from: string, to: string) {
  const a = TEXT.indexOf(from);
  const b = TEXT.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`no se encontró la sección ${from} → ${to}`);
  return TEXT.slice(a, b);
}
const SECTIONS: Record<GroupCode, string> = {
  SIERRA_SUR: slice('ANEXO 1:', 'CNEL EL ORO - CNEL ESMERALDAS'),
  COSTA_ORIENTE: slice('CNEL EL ORO - CNEL ESMERALDAS', 'CNEL UN GUAYAQUIL'),
  GYE: slice('CNEL UN GUAYAQUIL', 'EMPRESA ELÉCTRICA QUITO S.A.'),
  EEQ: slice('EMPRESA ELÉCTRICA QUITO S.A.', 'ANEXO 2:'),
};
/** Cifras con coma decimal en orden de aparición, sin los cargos de comercialización (1,414 y 7,066). */
const numbers = (s: string) => [...s.matchAll(/\d+,\d+/g)].map((m) => Number(m[0].replace(',', '.'))).filter((n) => n !== 1.414 && n !== 7.066);

/** ¿`expected` aparece como subsecuencia ordenada de `tokens`? Devuelve el primer valor que no encontró. */
function missingInOrder(tokens: number[], expected: number[]) {
  let i = 0;
  for (const v of expected) {
    while (i < tokens.length && Math.abs(tokens[i] - v) > 1e-9) i++;
    if (i === tokens.length) return v;
    i++;
  }
  return null;
}

describe('pliego 2026 codificado: transcripción verificada contra el texto oficial', () => {
  it('vigencia y resoluciones', () => {
    expect(flat).toContain('rige a partir de 01 de octubre de 2026 y tendrá vigencia hasta 31 de diciembre de 2026');
    for (const r of ['ARCONEL – 023/25', 'ARCONEL – 029/25', 'ARCONEL – 009/26']) expect(flat).toContain(r);
    expect(SCHEDULE.validFrom).toBe('2026-10-01');
    expect(SCHEDULE.validTo).toBe('2026-12-31');
  });

  for (const g of Object.keys(TABLES) as GroupCode[]) {
    it(`grupo ${g}: todos los cargos en el orden del documento`, () => {
      const t = TABLES[g];
      const dry = t.residential.map((v, i) => (i === 8 ? 0.105 : i === 9 ? 0.1109 : v));
      // En la Costa y Guayaquil las dos temporadas van en dos columnas: los valores se leen intercalados por fila.
      const res = t.residentialSeasonal ? t.residential.flatMap((v, i) => [v, dry[i]]) : t.residential;
      const expected = [
        ...res, ...t.comBvSd, ...t.artBvSd,
        t.bvDemand, t.comBvD, t.bvDemand, t.indBvD,
        t.bvDemand, ...t.comBvH, t.bvDemand, ...t.indBvH,
        t.mvDemand, t.comMvD, t.mvDemand, t.indMvD,
        t.mvHorariaDemand, ...t.comMvH,
        t.mvHorariaDemand, ...t.indMvHD,
        t.avDemand, ...t.comAvH,
        t.avDemand, ...t.indAv1HD,
        AV2.demand, ...AV2.energy,
      ];
      expect(missingInOrder(numbers(SECTIONS[g]), expected)).toBeNull();
    });
  }

  it('Anexo 2: límites del subsidio cruzado por distribuidora', () => {
    const anexo2 = TEXT.slice(TEXT.indexOf('ANEXO 2:')).replace(/[ \t]+/g, ' ');
    const label: Record<string, string> = {
      EEASA: 'Ambato', EEA: 'Azogues', CENTROSUR: 'CentroSur', ELEPCO: 'Cotopaxi', EMELNORTE: 'Norte', EEQ: 'Quito', EERSA: 'Riobamba',
      EERSSA: 'Sur', EEGAL: 'Galápagos', 'CNEL-BOL': 'CNEL Bolívar', 'CNEL-ORO': 'CNEL El Oro', 'CNEL-ESM': 'CNEL Esmeraldas', 'CNEL-GYE': 'CNEL Guayaquil',
      'CNEL-GLR': 'CNEL Guayas-Los Ríos', 'CNEL-LRS': 'CNEL Los Ríos', 'CNEL-MAN': 'CNEL Manabí', 'CNEL-MIL': 'CNEL Milagro', 'CNEL-STE': 'CNEL Santa Elena',
      'CNEL-SDO': 'CNEL Santo Domingo', 'CNEL-SUC': 'CNEL Sucumbíos',
    };
    expect(DISTRIBUTORS).toHaveLength(20);
    for (const d of DISTRIBUTORS) expect(anexo2, d.code).toMatch(new RegExp(`${label[d.code]} ${d.receivesUpToKwh} ${d.contributesAboveKwh}\\b`));
  });
});

describe('catálogo derivado', () => {
  it('14 tarifas por grupo, provisionales y con su fuente', () => {
    expect(OFFICIAL_TARIFFS).toHaveLength(56);
    for (const t of OFFICIAL_TARIFFS) {
      expect(t.status).toBe('provisional');
      expect(t.sourceNote).toContain('Pliego Tarifario del SPEE 2026');
      expect(t.distributors.length).toBeGreaterThan(0);
    }
  });
  it('factura residencial de Quito y de la Sierra con 200 kWh', () => {
    const eeq = computeBill(tariffByCode('EEQ-RES')!.structure, { month: 11, kwhByPeriod: { unico: 200 } });
    expect(eeq.spee).toBeCloseTo(50 * (0.078 + 0.081 + 0.083 + 0.097) + 1.414, 2);
    const sierra = computeBill(tariffByCode('SIERRA_SUR-RES')!.structure, { month: 11, kwhByPeriod: { unico: 200 } });
    expect(sierra.spee).toBeCloseTo(50 * (0.091 + 0.093 + 0.095 + 0.097) + 1.414, 2);
  });
  it('sugerencia de distribuidora por provincia y cantón', () => {
    expect(suggestDistributor('Pichincha')?.code).toBe('EEQ');
    expect(suggestDistributor('Guayas', 'Guayaquil')?.code).toBe('CNEL-GYE');
    expect(suggestDistributor('guayas', 'MILAGRO')?.code).toBe('CNEL-MIL');
    expect(suggestDistributor('Guayas', 'Daule')?.code).toBe('CNEL-GLR');
    expect(suggestDistributor('Atlántida')).toBeNull();
    for (const p of PROVINCES) expect(suggestDistributor(p.name), p.name).not.toBeNull();
  });
});
