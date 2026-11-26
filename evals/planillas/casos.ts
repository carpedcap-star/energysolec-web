import { computeBill } from '@/lib/engine/tariff-v2';
import type { PeriodKey } from '@/lib/engine/tariff-v2/types';
import { DEFAULT_PARAMS } from '@/lib/engine/params';
import { selectTariff } from '@/lib/services/tariff-select';

/**
 * Planillas SINTÉTICAS para evaluar la lectura con IA. Ningún dato es real: los nombres, cédulas, cuentas y direcciones
 * son ficticios y cada documento lleva la marca «DOCUMENTO SINTÉTICO DE PRUEBA». Los valores del servicio eléctrico se
 * calculan con el pliego oficial (motor tarifa-v2), así la comprobación determinista debe coincidir.
 */
export type Caso = {
  id: string; titulo: string; formato: 'pdf' | 'jpeg';
  html: string;
  /** Datos personales ficticios que la lectura NUNCA debe devolver. */
  personales: string[];
  esperado: {
    readable: boolean;
    distributor?: string; segment?: 'residencial' | 'comercial' | 'industrial'; tariffKey?: string;
    energyKwh?: number; electricityUsd?: number; totalUsd?: number; demandKw?: number; historyMonths?: number;
    scheme?: 'HORARIA_2' | 'DIFERENCIADA_4'; powerFactor?: number; province?: string;
  };
};

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const money = (n: number) => n.toFixed(2).replace('.', ',');
const r2 = (n: number) => Math.round(n * 100) / 100;

type Def = {
  id: string; titulo: string; formato: 'pdf' | 'jpeg';
  distribuidora: string; codigo: string; provincia: string; canton: string;
  segmento: 'residencial' | 'comercial' | 'industrial'; categoria: string; tarifa: string; voltaje: string;
  periodo: string; historial: number[]; demanda?: number; fp?: number;
  franjas?: { etiqueta: string; horario: string; clave: PeriodKey; kwh: number }[];
  terceros: { concepto: string; usd: number }[];
  cliente: { nombre: string; id: string; cuenta: string; medidor: string; direccion: string };
};

function construir(d: Def): Caso {
  const kwh = d.historial[11];
  const t = selectTariff({ segment: d.segmento, province: d.provincia, city: d.canton, distributor: d.codigo, tariffKey: d.tarifa, monthlyKwh: kwh, demandKw: d.demanda, p: DEFAULT_PARAMS });
  const month = Number(d.periodo.slice(5));
  const kwhByPeriod: Partial<Record<PeriodKey, number>> = d.franjas ? Object.fromEntries(d.franjas.map((f) => [f.clave, f.kwh])) : { unico: kwh };
  const bill = computeBill(t.structure, { month, kwhByPeriod, demandKw: d.demanda, peakDemandKw: d.demanda, dmMax12Kw: d.demanda, powerFactor: d.fp }, t.options);
  const servicio = r2(bill.lines.reduce((a, l) => a + l.amount, 0));
  const terceros = r2(d.terceros.reduce((a, x) => a + x.usd, 0));
  const total = r2(servicio + terceros);
  const [y, m] = d.periodo.split('-').map(Number);
  const hist = d.historial.map((k, i) => {
    const dt = new Date(Date.UTC(y, m - 12 + i, 1));
    return { label: `${MESES[dt.getUTCMonth()]}-${String(dt.getUTCFullYear()).slice(2)}`, kwh: k };
  });
  const PER: Record<string, string> = { lv_08_18: 'L-V 08h00-18h00', lv_18_22: 'L-V 18h00-22h00', base: '22h00-08h00', sdf_18_22: 'S,D,F 18h00-22h00', unico: '' };
  const filas = bill.lines.map((l) => `<tr><td>${l.label.replace(/\((\w+)\)/, (_, k) => (PER[k] != null ? (PER[k] ? `(${PER[k]})` : '') : `(${k})`))}</td><td class="n">${money(l.amount)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#222;margin:28px}
    h1{font-size:16px;margin:0} .marca{background:#c00;color:#fff;padding:4px 8px;font-weight:bold;display:inline-block;margin:6px 0}
    table{border-collapse:collapse;width:100%;margin-top:8px} td,th{border:1px solid #bbb;padding:3px 6px} .n{text-align:right}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-top:8px} .box{border:1px solid #999;padding:8px;margin-top:10px}
  </style></head><body>
  <h1>${d.distribuidora}</h1>
  <div class="marca">DOCUMENTO SINTÉTICO DE PRUEBA — NO ES UNA PLANILLA REAL</div>
  <div class="box"><b>Factura de servicio eléctrico</b>
    <div class="grid">
      <span>Cliente: ${d.cliente.nombre}</span><span>C.I./RUC: ${d.cliente.id}</span>
      <span>Cuenta contrato: ${d.cliente.cuenta}</span><span>Medidor: ${d.cliente.medidor}</span>
      <span>Dirección: ${d.cliente.direccion}</span><span>Provincia: ${d.provincia} · Cantón: ${d.canton}</span>
      <span>Tipo de cliente: ${d.segmento.toUpperCase()}</span><span>Tarifa: ${d.categoria}</span>
      <span>Nivel de voltaje: ${d.voltaje}</span><span>Período facturado: ${MESES[month - 1]} ${y}</span>
    </div></div>
  <div class="box"><b>Consumo</b><div class="grid">
    <span>Energía consumida: ${kwh.toLocaleString('es-EC')} kWh</span>
    ${d.demanda != null ? `<span>Demanda facturable: ${d.demanda.toLocaleString('es-EC')} kW</span>` : '<span></span>'}
    ${d.fp != null ? `<span>Factor de potencia: ${d.fp.toFixed(2).replace('.', ',')}</span>` : ''}
  </div>
  ${d.franjas ? `<table><tr><th>Franja horaria</th><th>Horario</th><th class="n">kWh</th></tr>${d.franjas.map((f) => `<tr><td>${f.etiqueta}</td><td>${f.horario}</td><td class="n">${f.kwh.toLocaleString('es-EC')}</td></tr>`).join('')}</table>` : ''}
  </div>
  <div class="box"><b>Detalle de valores</b><table>
    <tr><th>Servicio eléctrico</th><th class="n">USD</th></tr>${filas}
    <tr><td><b>Subtotal servicio eléctrico</b></td><td class="n"><b>${money(servicio)}</b></td></tr>
    <tr><th>Valores de terceros</th><th class="n">USD</th></tr>
    ${d.terceros.map((x) => `<tr><td>${x.concepto}</td><td class="n">${money(x.usd)}</td></tr>`).join('')}
    <tr><td><b>TOTAL A PAGAR</b></td><td class="n"><b>${money(total)}</b></td></tr>
  </table></div>
  <div class="box"><b>Historial de consumo (kWh)</b><table><tr>${hist.map((h) => `<th>${h.label}</th>`).join('')}</tr><tr>${hist.map((h) => `<td class="n">${h.kwh}</td>`).join('')}</tr></table></div>
  </body></html>`;
  return {
    id: d.id, titulo: d.titulo, formato: d.formato, html,
    personales: [d.cliente.nombre, d.cliente.id, d.cliente.cuenta, d.cliente.medidor, d.cliente.direccion.split(',')[0]],
    esperado: {
      readable: true, distributor: d.codigo, segment: d.segmento, tariffKey: d.tarifa, energyKwh: kwh, electricityUsd: servicio, totalUsd: total,
      demandKw: d.demanda, historyMonths: 12, scheme: d.franjas ? 'DIFERENCIADA_4' : undefined, powerFactor: d.fp, province: d.provincia,
    },
  };
}

const RES_HIST = [298, 305, 312, 290, 301, 315, 322, 330, 318, 309, 314, 320];
export const CASOS: Caso[] = [
  construir({
    id: 'eeq-residencial', titulo: 'Residencial EEQ (Quito)', formato: 'pdf',
    distribuidora: 'EMPRESA ELÉCTRICA QUITO S.A.', codigo: 'EEQ', provincia: 'Pichincha', canton: 'Quito',
    segmento: 'residencial', categoria: 'RESIDENCIAL', tarifa: 'RES', voltaje: 'Bajo voltaje', periodo: '2026-10', historial: RES_HIST,
    terceros: [{ concepto: 'Tasa de recolección de basura', usd: 4.1 }, { concepto: 'Contribución Cuerpo de Bomberos', usd: 1.2 }],
    cliente: { nombre: 'Lucía Prueba Ficticia', id: '1799999901', cuenta: '900000001', medidor: 'MED-0000001', direccion: 'Calle Ficticia N12-34, Sector Ejemplo' },
  }),
  construir({
    id: 'gye-residencial', titulo: 'Residencial CNEL Guayaquil', formato: 'pdf',
    distribuidora: 'CNEL EP UNIDAD DE NEGOCIO GUAYAQUIL', codigo: 'CNEL-GYE', provincia: 'Guayas', canton: 'Guayaquil',
    segmento: 'residencial', categoria: 'RESIDENCIAL', tarifa: 'RES', voltaje: 'BT', periodo: '2026-10',
    historial: [410, 450, 480, 470, 430, 390, 360, 350, 355, 370, 380, 395],
    terceros: [{ concepto: 'Recolección de basura (municipio)', usd: 6.4 }, { concepto: 'Bomberos', usd: 1.5 }],
    cliente: { nombre: 'Andrés Ejemplo Inventado', id: '0999999902', cuenta: '800000002', medidor: 'GYE-0000002', direccion: 'Mz. 0 Villa 0, Urbanización Ficticia' },
  }),
  construir({
    id: 'centrosur-comercial', titulo: 'Comercial con demanda, CentroSur', formato: 'pdf',
    distribuidora: 'EMPRESA ELÉCTRICA REGIONAL CENTRO SUR C.A.', codigo: 'CENTROSUR', provincia: 'Azuay', canton: 'Cuenca',
    segmento: 'comercial', categoria: 'COMERCIAL CON DEMANDA BV', tarifa: 'COM-BV-D', voltaje: 'Bajo voltaje', periodo: '2026-09', demanda: 28,
    historial: [4010, 3950, 4120, 4080, 4200, 4150, 4300, 4250, 4180, 4100, 4220, 4200],
    terceros: [{ concepto: 'Tasa de recolección de desechos', usd: 18.0 }, { concepto: 'Cuerpo de Bomberos', usd: 3.6 }],
    cliente: { nombre: 'Comercial Ficticio Ejemplo Cía. Ltda.', id: '0199999999001', cuenta: '700000003', medidor: 'CS-0000003', direccion: 'Av. Inventada 1-23, Parque de Prueba' },
  }),
  construir({
    id: 'manabi-industrial-horaria', titulo: 'Industrial MV horaria con factor de potencia bajo, CNEL Manabí', formato: 'pdf',
    distribuidora: 'CNEL EP UNIDAD DE NEGOCIO MANABÍ', codigo: 'CNEL-MAN', provincia: 'Manabí', canton: 'Manta',
    segmento: 'industrial', categoria: 'INDUSTRIAL MEDIA TENSIÓN CON DEMANDA HORARIA DIFERENCIADA', tarifa: 'IND-MV-HD', voltaje: 'Medio voltaje (13,8 kV)', periodo: '2026-10',
    demanda: 180, fp: 0.91,
    historial: [61000, 60500, 63200, 62800, 64000, 63500, 65100, 64800, 63900, 64500, 63000, 62000],
    franjas: [
      { etiqueta: 'Punta media (L-V)', horario: 'Lunes a viernes 08:00-18:00', clave: 'lv_08_18', kwh: 29000 },
      { etiqueta: 'Punta (L-V)', horario: 'Lunes a viernes 18:00-22:00', clave: 'lv_18_22', kwh: 9500 },
      { etiqueta: 'Base', horario: 'Todos los días 22:00-08:00', clave: 'base', kwh: 21500 },
      { etiqueta: 'Fin de semana', horario: 'Sábados, domingos y feriados 18:00-22:00', clave: 'sdf_18_22', kwh: 2000 },
    ],
    terceros: [{ concepto: 'Alumbrado público', usd: 120.0 }, { concepto: 'Bomberos', usd: 24.0 }],
    cliente: { nombre: 'Industria Inventada de Prueba S.A.', id: '1399999999001', cuenta: '600000004', medidor: 'MAN-0000004', direccion: 'Km 0 Vía Ficticia, Zona Industrial de Ejemplo' },
  }),
];
// La misma planilla comercial como foto (JPEG, ligeramente girada) y un documento que NO es una planilla.
CASOS.push({ ...CASOS[2], id: 'centrosur-comercial-foto', titulo: 'Comercial CentroSur, como foto', formato: 'jpeg' });
CASOS.push({
  id: 'no-es-planilla', titulo: 'Recibo de restaurante (no es planilla)', formato: 'pdf', personales: ['Pedro Inventado'],
  html: `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body style="font-family:Arial;margin:40px"><h1>Restaurante El Ejemplo</h1><p>DOCUMENTO SINTÉTICO DE PRUEBA</p><p>Cliente: Pedro Inventado</p><table><tr><td>2 almuerzos</td><td>$9,00</td></tr><tr><td>Jugos</td><td>$3,00</td></tr><tr><td><b>Total</b></td><td><b>$12,00</b></td></tr></table></body></html>`,
  esperado: { readable: false },
});
