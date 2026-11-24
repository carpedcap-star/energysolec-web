import 'server-only';
import path from 'node:path';
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { Study } from '../data/types';
import type { StudyInput } from '../engine/study';
import { SITE } from '../site';
import { fmtKwh, fmtKwp, fmtNum, fmtPct, fmtUsd, fmtYears, MONTHS_ES } from '../format';

const Y = SITE.brand.yellow, G = SITE.brand.graphite, B = SITE.brand.blue;
const LOGO = path.join(process.cwd(), 'public', 'brand', 'logo.png');
const LOGO_DARK = path.join(process.cwd(), 'public', 'brand', 'logo-dark.png');

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, color: G, fontFamily: 'Helvetica', lineHeight: 1.4 },
  cover: { padding: 0, backgroundColor: G, color: '#fff', fontFamily: 'Helvetica' },
  h1: { fontSize: 26, fontFamily: 'Helvetica-Bold', lineHeight: 1.15 },
  h2: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 8, marginTop: 4 },
  h3: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  muted: { color: '#6b6767' },
  row: { flexDirection: 'row' },
  kpi: { flex: 1, padding: 10, borderLeftWidth: 3, borderLeftColor: Y, backgroundColor: '#f6f5f2', marginRight: 6 },
  kpiVal: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  kpiLab: { fontSize: 8, color: '#6b6767', marginTop: 2 },
  table: { borderTopWidth: 1, borderTopColor: '#ddd' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 4 },
  th: { fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, fontSize: 7.5, color: '#888', flexDirection: 'row', justifyContent: 'space-between' },
  note: { fontSize: 8, color: '#6b6767', marginTop: 6 },
  warn: { backgroundColor: '#fff8db', borderLeftWidth: 3, borderLeftColor: Y, padding: 8, marginVertical: 6, fontSize: 8.5 },
});

function Footer({ code }: { code: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{SITE.legalName} · {SITE.domain} · WhatsApp {SITE.whatsappDisplay}</Text>
      <Text render={({ pageNumber, totalPages }) => `Estudio ${code} · ${pageNumber}/${totalPages}`} />
    </View>
  );
}

function Kpi({ v, l }: { v: string; l: string }) {
  return <View style={s.kpi}><Text style={s.kpiVal}>{v}</Text><Text style={s.kpiLab}>{l}</Text></View>;
}

function MonthlyChart({ cons, gen, self }: { cons: number[]; gen: number[]; self: number[] }) {
  const max = Math.max(...cons, ...gen) || 1, H = 120;
  return (
    <View>
      <View style={[s.row, { height: H, alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: '#ccc' }]}>
        {cons.map((c, i) => (
          <View key={i} style={[s.row, { flex: 1, alignItems: 'flex-end', justifyContent: 'center' }]}>
            <View style={{ width: 9, height: (c / max) * H, backgroundColor: '#c9c6c3', marginRight: 1 }} />
            <View style={{ width: 9, height: (gen[i] / max) * H, backgroundColor: Y }}>
              <View style={{ position: 'absolute', bottom: 0, width: 9, height: (self[i] / max) * H, backgroundColor: B }} />
            </View>
          </View>
        ))}
      </View>
      <View style={s.row}>{MONTHS_ES.map((m) => <Text key={m} style={{ flex: 1, textAlign: 'center', fontSize: 7, color: '#888' }}>{m}</Text>)}</View>
      <View style={[s.row, { marginTop: 6, fontSize: 7.5 }]}>
        <Legend c="#c9c6c3" t="Consumo" /><Legend c={Y} t="Generación solar" /><Legend c={B} t="Energía autoconsumida" />
      </View>
    </View>
  );
}
const Legend = ({ c, t }: { c: string; t: string }) => (
  <View style={[s.row, { marginRight: 14, alignItems: 'center' }]}><View style={{ width: 8, height: 8, backgroundColor: c, marginRight: 4 }} /><Text>{t}</Text></View>
);

function CashflowChart({ cum }: { cum: number[] }) {
  const max = Math.max(...cum.map(Math.abs)) || 1, H = 60;
  return (
    <View style={[s.row, { height: H * 2, alignItems: 'center' }]}>
      {cum.map((v, i) => (
        <View key={i} style={{ flex: 1, height: H * 2, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ position: 'absolute', top: v >= 0 ? H - (v / max) * H : H, width: 7, height: Math.max(1, (Math.abs(v) / max) * H), backgroundColor: v >= 0 ? B : '#b9b5b2' }} />
        </View>
      ))}
    </View>
  );
}

export type ReportContact = { name: string; email: string; company: string | null; phone: string | null };

function StudyDoc({ study, contact }: { study: Study; contact: ReportContact }) {
  const r = study.results, z = r.sizing, b = r.scenarios.base;
  const input = study.inputs as StudyInput;
  const date = new Date(study.created_at).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
  const sc = [r.scenarios.conservador, r.scenarios.base, r.scenarios.optimista];
  const scName = ['Conservador', 'Base', 'Optimista'];
  return (
    <Document title={`Estudio solar ${study.code}`} author={SITE.legalName} language="es">
      {/* Portada */}
      <Page size="A4" style={s.cover}>
        <View style={{ padding: 48, flex: 1, justifyContent: 'space-between' }}>
          <Image src={LOGO_DARK} style={{ width: 190 }} />
          <View>
            <View style={{ width: 48, height: 4, backgroundColor: Y, marginBottom: 16 }} />
            <Text style={[s.h1, { color: '#fff' }]}>Estudio de prefactibilidad{'\n'}solar fotovoltaica</Text>
            <Text style={{ marginTop: 12, fontSize: 12, color: '#d9d6d3' }}>{contact.company || contact.name}</Text>
            <Text style={{ fontSize: 10, color: '#a9a5a2', marginTop: 4 }}>{input.city ? `${input.city}, ` : ''}{input.province} · {date}</Text>
          </View>
          <View style={[s.row, { justifyContent: 'space-between', fontSize: 9, color: '#a9a5a2' }]}>
            <Text>Código del estudio: {study.code}</Text>
            <Text>{SITE.domain}</Text>
          </View>
        </View>
      </Page>

      {/* Resumen */}
      <Page size="A4" style={s.page}>
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }]}>
          <Image src={LOGO} style={{ width: 110 }} />
          <Text style={s.muted}>Estudio {study.code} · {date}</Text>
        </View>
        <Text style={s.h2}>Datos del cliente</Text>
        <View style={s.table}>
          {[['Nombre', contact.name], ['Empresa', contact.company], ['Correo', contact.email], ['WhatsApp', contact.phone],
            ['Ubicación', `${input.city ? input.city + ', ' : ''}${input.province}`], ['Segmento', input.segment], ['Modalidad', input.mode === 'rapida' ? 'Calculadora rápida' : 'Calculadora profesional']]
            .filter(([, v]) => v).map(([k, v]) => <View key={k} style={s.tr}><Text style={{ width: 120, color: '#6b6767' }}>{k}</Text><Text>{v}</Text></View>)}
        </View>

        <Text style={[s.h2, { marginTop: 14 }]}>Sistema recomendado</Text>
        <View style={[s.row, { marginBottom: 6 }]}>
          <Kpi v={fmtKwp(z.kwp)} l="Potencia fotovoltaica" />
          <Kpi v={`${z.modules}`} l={`Módulos de referencia`} />
          <Kpi v={`${fmtNum(z.inverterKw)} kW`} l="Potencia de inversores" />
          <Kpi v={`${fmtNum(z.areaM2, 0)} m²`} l="Superficie requerida" />
        </View>
        <View style={s.row}>
          <Kpi v={fmtKwh(z.annualGeneration)} l="Generación año 1" />
          <Kpi v={fmtPct(z.coverage)} l="Cobertura del consumo" />
          <Kpi v={`${fmtNum(z.specificYieldYear1, 0)}`} l="kWh/kWp/año (rend. específico)" />
          <Kpi v={z.battery ? `${z.battery.kwh} kWh` : 'No'} l="Almacenamiento" />
        </View>

        <Text style={[s.h2, { marginTop: 14 }]}>Análisis de consumo frente a generación</Text>
        <Text style={[s.muted, { marginBottom: 6 }]}>Consumo anual: {fmtKwh(r.consumption.annualKwh)}{r.consumption.estimatedFromBill ? ' (estimado a partir de la factura)' : ''}. Autoconsumo de la generación: {fmtPct(z.selfConsumptionRatio)}.</Text>
        <MonthlyChart cons={r.consumption.monthlyKwh} gen={z.monthlyGeneration} self={z.monthlySelfConsumed} />

        <Text style={[s.h2, { marginTop: 14 }]}>Resultados económicos (escenario base)</Text>
        <View style={s.row}>
          <Kpi v={fmtUsd(b.capex.total)} l="Inversión estimada (IVA incl.)" />
          <Kpi v={fmtUsd(b.savingMonthYear1)} l="Ahorro mensual promedio" />
          <Kpi v={fmtUsd(b.savingYear1)} l="Ahorro año 1" />
          <Kpi v={fmtYears(b.simplePayback)} l="Retorno simple" />
        </View>
        <Footer code={study.code} />
      </Page>

      {/* Finanzas */}
      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Escenarios financieros</Text>
        <View style={s.table}>
          <View style={[s.tr, s.th]}><Text style={{ flex: 2 }}>Indicador</Text>{scName.map((n) => <Text key={n} style={{ flex: 1, textAlign: 'right' }}>{n}</Text>)}</View>
          {([
            ['Inversión estimada', (x) => fmtUsd(x.capex.total)],
            ['Ahorro año 1', (x) => fmtUsd(x.savingYear1)],
            ['Reducción de la factura', (x) => fmtPct(x.billReduction)],
            ['Retorno simple', (x) => fmtYears(x.simplePayback)],
            ['Retorno descontado', (x) => fmtYears(x.discountedPayback)],
            ['VAN', (x) => fmtUsd(x.npv)],
            ['TIR', (x) => (x.irr == null ? 'n/d' : fmtPct(x.irr))],
            ['LCOE (USD/kWh)', (x) => `$${x.lcoe.toFixed(3)}`],
            ['Ahorro acumulado 25 años', (x) => fmtUsd(x.savings25)],
            ['Rentabilidad neta acumulada', (x) => fmtPct(x.roi)],
          ] as [string, (x: typeof b) => string][]).map(([k, f]) => (
            <View key={k} style={s.tr}><Text style={{ flex: 2 }}>{k}</Text>{sc.map((x, i) => <Text key={i} style={{ flex: 1, textAlign: 'right' }}>{f(x)}</Text>)}</View>
          ))}
        </View>
        <Text style={s.note}>Factura anual actual estimada: {fmtUsd(b.billBeforeYear)}. Factura anual con el sistema (año 1): {fmtUsd(b.billAfterYear)}. Los cargos fijos y, salvo indicación, el cargo por demanda se mantienen.</Text>

        <Text style={[s.h2, { marginTop: 14 }]}>Recuperación de la inversión — flujo de caja acumulado (base)</Text>
        <CashflowChart cum={b.cumulative} />
        <View style={[s.row, { justifyContent: 'space-between', fontSize: 7, color: '#888' }]}><Text>Año 0</Text><Text>Año {b.cumulative.length - 1}</Text></View>

        <Text style={[s.h3, { marginTop: 12 }]}>Flujo de caja proyectado (base)</Text>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {b.cashflows.map((cf, y) => (
            <View key={y} style={{ width: '16.66%', paddingVertical: 2 }}><Text style={{ fontSize: 7.5 }}>Año {y}: {fmtUsd(cf)}</Text></View>
          ))}
        </View>

        <Text style={[s.h2, { marginTop: 14 }]}>Beneficios ambientales</Text>
        <View style={s.row}>
          <Kpi v={`${fmtNum(r.environment.co2TonsYear)} t`} l="CO₂ evitado por año" />
          <Kpi v={`${fmtNum(r.environment.co2Tons25, 0)} t`} l="CO₂ evitado en 25 años" />
          <Kpi v={fmtNum(r.environment.treesEquivalent, 0)} l="Árboles equivalentes / año" />
        </View>
        <Footer code={study.code} />
      </Page>

      {/* Supuestos */}
      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Supuestos técnicos y fuentes de información</Text>
        {r.warnings.map((w, i) => <Text key={i} style={s.warn}>{w}</Text>)}
        {z.assumptions.map((a, i) => <Text key={i} style={{ marginBottom: 3 }}>• {a}</Text>)}
        <Text style={[s.h3, { marginTop: 10 }]}>Pérdidas del sistema consideradas</Text>
        {z.lossItems.map((l) => <Text key={l.label}>• {l.label}: {fmtNum(l.loss * 100)} %</Text>)}
        <Text style={[s.h3, { marginTop: 10 }]}>Fuentes</Text>
        <Text>• Recurso solar: {r.resource.source}.{r.resource.candidates?.length ? ` Valores comparados: ${r.resource.candidates.map((c) => `${c.source} ${c.annual} kWh/kWp`).join('; ')}.` : ''}</Text>
        <Text>• Tarifa aplicada: {r.tariff.name} ({r.tariff.code}). {r.tariff.sourceNote}</Text>
        <Text>• Parámetros técnico-económicos: versión {r.paramsVersion}{r.paramsPlaceholder ? ' (provisional)' : ''}.</Text>
        <Text>• Los excedentes exportados a la red no se valoran económicamente salvo que la regulación aplicable y el régimen del cliente lo permitan y esté configurado.</Text>

        <View style={{ marginTop: 18, padding: 12, backgroundColor: '#f6f5f2' }}>
          <Text style={s.h3}>Importante</Text>
          <Text>{r.disclaimer}</Text>
        </View>

        <View style={{ marginTop: 18, padding: 14, backgroundColor: G, color: '#fff' }}>
          <Text style={[s.h3, { color: Y }]}>Siguiente paso: visita técnica</Text>
          <Text>Agenda una inspección para validar la cubierta, el tablero eléctrico, las sombras y tu curva de consumo real.</Text>
          <Text style={{ marginTop: 6 }}>WhatsApp {SITE.whatsappDisplay} · {SITE.email} · {SITE.domain}</Text>
        </View>
        <Footer code={study.code} />
      </Page>
    </Document>
  );
}

export async function renderStudyPdf(study: Study, contact: ReportContact): Promise<Buffer> {
  return renderToBuffer(<StudyDoc study={study} contact={contact} />);
}
