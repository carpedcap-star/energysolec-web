import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { extractBill } from '@/lib/services/bill-extractor';
import { checkBillFile, sanitizeExtraction, toCalculatorInput } from '@/lib/services/bill';
import { checkBill } from '@/lib/services/bill-check';
import { DEFAULT_PARAMS } from '@/lib/engine/params';
import { CASOS, type Caso } from './casos';

/**
 * Evaluación de la lectura de planillas con IA sobre planillas SINTÉTICAS (`casos.ts`).
 * Gasto: tope acumulado de USD 5 (`EVAL_TOPE_USD`, nunca mayor). El libro de gastos persiste en `out/costo.json`,
 * así varias corridas suman. Antes de cada lectura se reserva el peor caso; si no cabe, la evaluación se detiene.
 * Uso: `npm run eval:planillas` (sin ANTHROPIC_API_KEY solo genera los archivos y no gasta nada).
 */
const OUT = path.join(import.meta.dirname, 'out');
const LEDGER = path.join(OUT, 'costo.json');
const TOPE = Math.min(5, Number(process.env.EVAL_TOPE_USD) || 5);
// USD por millón de tokens (entrada, salida). Un modelo desconocido se cobra como el más caro.
const PRECIOS: [RegExp, number, number][] = [[/opus/, 4, 20], [/sonnet/, 2, 10], [/haiku/, 0.1, 0.5]];
const precio = (model: string) => PRECIOS.find(([re]) => re.test(model)) ?? [/./, 4, 20];
// Peor caso por lectura: 16 000 tokens de salida y ~12 000 de entrada (imagen o PDF de 1-2 páginas).
const RESERVA = (12_000 * 4 + 16_000 * 20) / 1e6;

type Ledger = { spentUsd: number; calls: { at: string; caso: string; model: string; input: number; output: number; usd: number }[] };
const readLedger = (): Ledger => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { spentUsd: 0, calls: [] });

async function render(casos: Caso[]) {
  mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const files = new Map<string, Uint8Array>();
  for (const c of casos) {
    const p = await b.newPage({ viewport: { width: 900, height: 1200 } });
    await p.setContent(c.html);
    let bytes: Buffer;
    if (c.formato === 'pdf') bytes = await p.pdf({ format: 'A4', printBackground: true });
    else {
      // «Foto»: ligeramente girada, con fondo y compresión JPEG.
      await p.addStyleTag({ content: 'html{background:#8a8378} body{background:#fff;transform:rotate(1.6deg);box-shadow:0 0 12px #0006;padding:12px}' });
      bytes = await p.screenshot({ type: 'jpeg', quality: 72, fullPage: true });
    }
    writeFileSync(path.join(OUT, `${c.id}.${c.formato === 'pdf' ? 'pdf' : 'jpg'}`), bytes);
    files.set(c.id, new Uint8Array(bytes));
    await p.close();
  }
  await b.close();
  return files;
}

const near = (a: number | null | undefined, b: number, tol: number) => a != null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

describe('lectura de planillas sintéticas', () => {
  it('genera, lee y compara (con tope de gasto)', async () => {
    const files = await render(CASOS);
    if (!process.env.ANTHROPIC_API_KEY) { console.log(`Sin ANTHROPIC_API_KEY: solo se generaron las planillas en ${OUT}.`); return; }
    const ledger = readLedger();
    const rows: string[] = [];
    let ok = 0, total = 0;
    for (const c of CASOS) {
      if (ledger.spentUsd + RESERVA > TOPE) { rows.push(`| ${c.titulo} | — | No se leyó: el gasto acumulado (USD ${ledger.spentUsd.toFixed(3)}) no deja margen bajo el tope de USD ${TOPE}. |`); continue; }
      const bytes = files.get(c.id)!;
      const type = checkBillFile(bytes);
      if (typeof type === 'string') throw new Error(type);
      const t0 = Date.now();
      const r = await extractBill(bytes, type, { onUsage: (u) => {
        const [, pin, pout] = precio(u.model);
        const usd = (u.input * pin + u.output * pout) / 1e6;
        ledger.spentUsd = Math.round((ledger.spentUsd + usd) * 1e6) / 1e6;
        ledger.calls.push({ at: new Date().toISOString(), caso: c.id, model: u.model, input: u.input, output: u.output, usd: Math.round(usd * 1e5) / 1e5 });
        writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
      } });
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      const checks: [string, boolean][] = [];
      const e = c.esperado;
      if (!e.readable) checks.push(['rechaza lo que no es planilla', !r.ok && r.reason === 'unreadable']);
      else if (!r.ok) checks.push([`lectura (${r.reason})`, false]);
      else {
        const raw = JSON.stringify(r.data);
        const d = sanitizeExtraction(r.data);
        const prop = toCalculatorInput(d, 'profesional');
        checks.push(['sin datos personales', !c.personales.some((x) => raw.toLowerCase().includes(x.toLowerCase()))]);
        checks.push(['distribuidora', d.distributor === e.distributor]);
        checks.push(['segmento', d.segment === e.segment]);
        checks.push(['categoría tarifaria', d.tariffKey === e.tariffKey]);
        checks.push(['provincia', d.province === e.province]);
        checks.push(['kWh del mes', near(d.energyKwh, e.energyKwh!, 0.005)]);
        checks.push(['servicio eléctrico USD', near(d.electricityUsd, e.electricityUsd!, 0.01)]);
        checks.push(['total a pagar USD', near(d.totalUsd, e.totalUsd!, 0.01)]);
        checks.push(['historial 12 meses', d.history.length === e.historyMonths && !('error' in prop) && prop.input === 'history']);
        if (e.demandKw != null) checks.push(['demanda kW', near(d.demandKw ?? d.demandRegisteredKw, e.demandKw, 0.01)]);
        if (e.scheme) checks.push(['franjas horarias', d.timeOfUse?.scheme === e.scheme]);
        if (e.powerFactor != null) checks.push(['factor de potencia', near(d.powerFactor, e.powerFactor, 0.005)]);
        const chk = checkBill(d, DEFAULT_PARAMS);
        checks.push(['comprobación con el pliego', chk?.ok === true]);
      }
      const pass = checks.filter(([, v]) => v).length;
      ok += pass; total += checks.length;
      rows.push(`| ${c.titulo} | ${pass}/${checks.length} | ${checks.filter(([, v]) => !v).map(([k]) => k).join(', ') || 'todo correcto'} · ${secs} s |`);
    }
    const md = [
      '# Evaluación de la lectura de planillas (sintéticas)', '',
      `Fecha: ${new Date().toISOString().slice(0, 10)} · Aciertos: ${ok}/${total} · Gasto acumulado: USD ${ledger.spentUsd.toFixed(3)} de USD ${TOPE} · Lecturas: ${ledger.calls.length}`, '',
      'Planillas generadas por `evals/planillas/casos.ts` (datos ficticios; servicio eléctrico calculado con el pliego oficial).', '',
      '| Caso | Aciertos | Fallos · tiempo |', '|---|---|---|', ...rows, '',
    ].join('\n');
    writeFileSync(path.join(import.meta.dirname, 'RESULTADOS.md'), md);
    console.log(md);
    expect(ledger.spentUsd).toBeLessThanOrEqual(TOPE);
  }, 1_800_000);
});
