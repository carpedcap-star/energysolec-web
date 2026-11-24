import { z } from 'zod';
import { getStore } from '@/lib/data/store';
import { guard } from '@/lib/request';
/** Métrica agregada de primera parte (sin cookies ni identificadores) para el dashboard. */
const Body = z.object({ name: z.enum(['page_view', 'product_view', 'whatsapp_click']), path: z.string().max(200) });
export async function POST(req: Request) {
  if (!(await guard('track', 120, 600))) return new Response(null, { status: 204 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (p.success && !p.data.path.startsWith('/admin')) await getStore().track(p.data.name, { path: p.data.path });
  return new Response(null, { status: 204 });
}
