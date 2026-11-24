import { z } from 'zod';
import { getStore } from '@/lib/data/store';
import { checkStudyToken } from '@/lib/token';
import { json } from '@/lib/request';
import { notifySales } from '@/lib/services/messaging';
import { SITE } from '@/lib/site';

export const runtime = 'nodejs';
const Body = z.object({ code: z.string(), token: z.string(), preferred: z.string().max(200).optional() });

export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success || !checkStudyToken(p.data.code, p.data.token)) return json({ error: 'Solicitud no válida' }, 400);
  const store = getStore();
  const study = await store.getStudyByCode(p.data.code);
  if (!study?.lead_id) return json({ error: 'Estudio no encontrado' }, 404);
  await store.requestVisit(p.data.code);
  await store.updateLead(study.lead_id, { next_activity_note: `Visita técnica solicitada${p.data.preferred ? `: ${p.data.preferred}` : ''}`, next_activity_at: new Date().toISOString() }, 'sistema');
  await store.addActivity(study.lead_id, 'visita', `Cliente solicitó visita técnica desde el estudio ${p.data.code}. ${p.data.preferred ?? ''}`, null);
  const lead = await store.getLead(study.lead_id);
  await notifySales(`Visita técnica solicitada — ${lead?.full_name}`, [['Estudio', p.data.code], ['Preferencia', p.data.preferred], ['WhatsApp', lead?.phone]], `${SITE.url}/admin/leads/${study.lead_id}`);
  return json({ ok: true });
}
