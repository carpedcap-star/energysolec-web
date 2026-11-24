import { promises as fs } from 'node:fs';
import { getStore, devMediaFile } from '@/lib/data/store';

export const runtime = 'nodejs';
const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

/** Sirve los archivos subidos en desarrollo (.data/media). En producción los sirve Supabase Storage y esta ruta responde 404. */
export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (process.env.NODE_ENV === 'production' || getStore().kind !== 'dev') return new Response('No encontrado', { status: 404 });
  const segs = (await params).path;
  if (segs.length !== 2 || !/^[a-z0-9-]+$/.test(segs[0]) || !/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(segs[1])) return new Response('No encontrado', { status: 404 });
  const ext = segs[1].split('.').pop()!;
  try {
    const body = await fs.readFile(devMediaFile(segs.join('/')));
    return new Response(new Uint8Array(body), { headers: { 'Content-Type': TYPES[ext], 'Cache-Control': 'private, max-age=60', 'Content-Disposition': 'inline' } });
  } catch { return new Response('No encontrado', { status: 404 }); }
}
