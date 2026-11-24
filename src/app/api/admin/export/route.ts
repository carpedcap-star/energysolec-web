import { getStaff, can } from '@/lib/auth';
import { getStore } from '@/lib/data/store';
import { LEAD_STAGES } from '@/lib/data/types';

export const runtime = 'nodejs';
const cell = (v: unknown) => { const s = v == null ? '' : String(v); const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; return `"${safe.replace(/"/g, '""')}"`; }; // evita inyección de fórmulas

export async function GET(req: Request) {
  const staff = await getStaff();
  if (!can(staff, 'export')) return new Response('No autorizado', { status: 403 });
  const stage = new URL(req.url).searchParams.get('stage');
  const leads = await getStore().listLeads(LEAD_STAGES.some((s) => s.id === stage) ? { stage: stage as any } : undefined);
  const cols = ['created_at', 'full_name', 'email', 'phone', 'company', 'segment', 'province', 'city', 'monthly_kwh', 'monthly_bill_usd', 'recommended_kwp', 'estimated_investment_usd', 'source', 'stage', 'advisor_id', 'next_activity_at', 'utm_source', 'utm_medium', 'utm_campaign'];
  const rows = leads.map((l) => cols.map((c) => cell(c.startsWith('utm_') ? l.utm?.[c] : (l as any)[c])).join(','));
  const csv = '﻿' + [cols.join(','), ...rows].join('\r\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
}
