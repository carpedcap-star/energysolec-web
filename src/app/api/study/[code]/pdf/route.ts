import { getStore } from '@/lib/data/store';
import { checkStudyToken } from '@/lib/token';
import { renderStudyPdf } from '@/lib/pdf/report';

export const runtime = 'nodejs';

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const t = new URL(req.url).searchParams.get('t');
  if (!checkStudyToken(code, t)) return new Response('No autorizado', { status: 403 });
  const store = getStore();
  const study = await store.getStudyByCode(code);
  if (!study?.unlocked || !study.lead_id) return new Response('Estudio no disponible', { status: 404 });
  const lead = await store.getLead(study.lead_id);
  const pdf = await renderStudyPdf(study, { name: lead?.full_name ?? '', email: lead?.email ?? '', company: lead?.company ?? null, phone: lead?.phone ?? null });
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Estudio-${code}.pdf"`, 'Cache-Control': 'private, no-store' } });
}
