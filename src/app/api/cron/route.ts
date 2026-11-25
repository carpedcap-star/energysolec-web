import { timingSafeEqual } from 'node:crypto';
import { JOBS, runJobs, type Job } from '@/lib/services/cron-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Tareas programadas. Vercel Cron llama con GET y la cabecera `Authorization: Bearer <CRON_SECRET>`; cualquier otro
 * programador (p. ej. Supabase pg_cron + pg_net) puede usar la misma cabecera. Sin CRON_SECRET la ruta no corre.
 * `?tareas=mensajes,recordatorios` limita las tareas (p. ej. reintentar correos cada 15 min y recordar una vez al día).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return Response.json({ error: 'CRON_SECRET no configurado' }, { status: 503 });
  const a = Buffer.from(req.headers.get('authorization') ?? ''), b = Buffer.from(`Bearer ${secret}`);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const asked = new URL(req.url).searchParams.get('tareas');
  const jobs = asked ? asked.split(',').filter((j): j is Job => (JOBS as readonly string[]).includes(j)) : [...JOBS];
  if (!jobs.length) return Response.json({ error: 'Tareas no válidas' }, { status: 400 });
  const r = await runJobs('cron', null, jobs);
  return Response.json(r, { status: r.ok ? 200 : 500, headers: { 'Cache-Control': 'no-store' } });
}
