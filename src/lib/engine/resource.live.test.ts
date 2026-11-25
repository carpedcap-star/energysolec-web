import { describe, expect, it } from 'vitest';
import { checkSources, getSolarResource, REFERENCE_POINTS } from './resource';
import { DEFAULT_PARAMS } from './params';

/**
 * Verificación EN VIVO contra PVGIS y NASA POWER. No corre con `npm test` (depende de la red y de servicios externos):
 * `npm run test:live`. Comprueba que las API siguen respondiendo con el formato que el motor espera y que los valores
 * son plausibles para Ecuador.
 */
describe.skipIf(!process.env.LIVE_SOURCES)('fuentes de recurso solar en vivo', () => {
  it('las tres fuentes responden y validan en los puntos de referencia', async () => {
    const r = await checkSources();
    const fails = r.filter((x) => !x.ok);
    expect(fails, fails.map((x) => `${x.point} ${x.source}: ${x.error}`).join('\n')).toHaveLength(0);
    // Plausibilidad: entre 800 y 2200 kWh/kWp al año antes de pérdidas de sistema en todo Ecuador.
    for (const x of r) expect(x.annual!, `${x.point} ${x.source}`).toBeGreaterThan(800);
    for (const x of r) expect(x.annual!, `${x.point} ${x.source}`).toBeLessThan(2200);
  }, 120_000);

  it('el motor adopta el menor de los tres valores consultados', async () => {
    const g = REFERENCE_POINTS[0];
    const r = await getSolarResource(g.lat, g.lng, 10, 'costa', { ...DEFAULT_PARAMS, version: 1 });
    expect(r.candidates).toHaveLength(3);
    const annual = Math.round(r.monthlyYieldPreLoss.reduce((a, b) => a + b));
    expect(annual).toBe(Math.min(...r.candidates.map((c) => c.annual)));
  }, 60_000);
});
