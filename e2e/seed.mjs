// Prepara la base de las pruebas de extremo a extremo: copia .data/dev-db.json a .data/e2e-db.json y agrega datos
// de prueba. Lo ejecuta el webServer de playwright.config.ts antes de levantar `next dev`.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const SRC = '.data/dev-db.json', DST = '.data/e2e-db.json';
rmSync('.data/private/bills', { recursive: true, force: true });
copyFileSync(SRC, DST);
const d = JSON.parse(readFileSync(DST, 'utf8'));
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const H = 3600e3, D = 24 * H;

// Precios por nivel (cuentas comerciales): prod-1 final 200 / instalador 160 / distribuidor 150; prod-2 solo final.
const prod = Object.fromEntries(d.products.map((p) => [p.id, p]));
const tp = (tier, price) => ({ tier, price, promo_price: null, promo_until: null });
Object.assign(prod['prod-1'], { price: 200, promo_price: null, prices: [tp('final', 200), tp('instalador', 160), tp('distribuidor', 150)] });
Object.assign(prod['prod-2'], { price: 1000, promo_price: null, prices: [tp('final', 1000)] });

// Asesora y leads para recordatorios.
export const ADVISOR = '7a000000-0000-4000-8000-000000000001';
d.users = [...(d.users ?? []), { id: ADVISOR, email: 'asesora@energysolec.test', full_name: 'Carla Asesora', phone: null, role: 'ventas', is_advisor: true, active: true, created_at: iso(now) }];
const base = { phone: null, company: null, segment: 'residencial', province: 'Guayas', city: null, source: 'calculadora', utm: {} };
d.leads.push(
  { ...base, id: 'c0000000-0000-4000-8000-000000000001', full_name: 'Lead Vencido', email: 'v@example.com', stage: 'contactado', advisor_id: ADVISOR, next_activity_at: iso(now - 3 * H), next_activity_note: 'Llamar para cotizar', first_contact_at: iso(now - 3 * D), created_at: iso(now - 3 * D) },
  { ...base, id: 'c0000000-0000-4000-8000-000000000002', full_name: 'Lead Sin Contactar', email: 's@example.com', stage: 'nuevo', advisor_id: null, next_activity_at: null, first_contact_at: null, created_at: iso(now - 2 * D) },
  { ...base, id: 'c0000000-0000-4000-8000-000000000003', full_name: 'Lead Futuro', email: 'f@example.com', stage: 'calificado', advisor_id: ADVISOR, next_activity_at: iso(now + 5 * D), first_contact_at: iso(now - 3 * D), created_at: iso(now - 3 * D) },
);

// Planillas: una vinculada al primer lead (confirmada), una reciente sin confirmar y una vieja sin lead (se depura).
mkdirSync('.data/private/bills', { recursive: true });
const pdf = '%PDF-1.4\n% planilla de prueba\n';
const read = { distributor: 'CNEL EP (unidades de negocio)', distributorRaw: 'CNEL EP Unidad de Negocio Guayaquil', tariffCategory: 'Comercial BT con demanda', billingPeriod: '2026-10', energyKwh: 14800, electricityUsd: 1480.5, totalUsd: 1530.2, demandKw: 52, history: [{ month: '2026-09', kwh: 14100 }, { month: '2026-10', kwh: 14800 }], notes: null };
const bills = [
  ['11111111-1111-4111-8111-111111111111', d.studies[0]?.id ?? null, d.leads[0].id, { read, confirmed: { monthlyKwh: 14808, monthlyBillUsd: 1500, demandKw: 52 } }, true, now - D],
  ['22222222-2222-4222-8222-222222222222', null, null, { read: { ...read, energyKwh: 320, electricityUsd: 31.4, totalUsd: 35, demandKw: null, distributorRaw: 'Empresa Eléctrica Quito', tariffCategory: 'Residencial', history: [] } }, false, now],
  ['33333333-3333-4333-8333-333333333333', null, null, { read }, false, now - 10 * D],
];
d.bills = bills.map(([id, study_id, lead_id, extracted, confirmed_by_user, at]) => {
  writeFileSync(`.data/private/bills/${id}.pdf`, pdf);
  return { id, path: `bills/${id}.pdf`, mime: 'application/pdf', study_id, lead_id, extracted, confirmed_by_user, created_at: iso(at) };
});

// Un documento industrial huérfano de hace 2 días (el visitante no envió el formulario): la depuración lo borra.
rmSync('.data/private/project-docs', { recursive: true, force: true });
mkdirSync('.data/private/project-docs', { recursive: true });
writeFileSync('.data/private/project-docs/d0000000-0000-4000-8000-000000000001.pdf', pdf);
d.industrial = [];
d.industrial_docs = [{ id: 'd0000000-0000-4000-8000-000000000001', request_id: null, kind: 'otro', filename: 'huerfano.pdf', mime: 'application/pdf', size_bytes: pdf.length, created_at: iso(now - 2 * D), path: 'd0000000-0000-4000-8000-000000000001.pdf' }];

// Un correo en error con cuerpo (se puede reintentar a mano).
d.messages = [{ id: 'e0000000-0000-4000-8000-000000000001', channel: 'email', to_address: 'cliente@example.com', template: 'pedido_recibido', payload: { subject: 'Pedido de prueba', html: '<p>hola</p>' }, is_marketing: false, status: 'error', error: 'Resend 500', attempts: 5, created_at: iso(now - 2 * H), sent_at: null, next_attempt_at: null, last_attempt_at: iso(now) }];

writeFileSync(DST, JSON.stringify(d, null, 1));
console.log('[e2e] base de prueba lista:', DST);
