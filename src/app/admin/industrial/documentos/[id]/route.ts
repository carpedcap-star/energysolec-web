import { NextResponse } from 'next/server';
import { getStaff, can } from '@/lib/auth';
import { getStore } from '@/lib/data/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INLINE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

/**
 * Documento de una cotización industrial (bucket privado project-docs). Solo personal con permiso `industrial`;
 * Ventas, solo de sus leads o de leads sin asesor. PDF e imágenes se abren en el navegador; Excel, CSV y DWG se
 * descargan (nunca se interpretan en el sitio).
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staff) return new NextResponse('No autorizado', { status: 401 });
  if (!can(staff, 'industrial')) return new NextResponse('Sin permiso', { status: 403 });
  const store = getStore();
  const id = (await params).id;
  const meta = await store.getIndustrialDocMeta(id);
  if (!meta?.request_id) return new NextResponse('No encontrado', { status: 404 });
  if (staff.role === 'ventas') {
    const r = await store.getIndustrialRequest(meta.request_id);
    if (!r || (r.advisor_id && r.advisor_id !== staff.id)) return new NextResponse('No encontrado', { status: 404 });
  }
  const file = await store.getIndustrialDocFile(id);
  if (!file) return new NextResponse('No encontrado', { status: 404 });
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff' };
  if ('signedUrl' in file) return NextResponse.redirect(file.signedUrl, { status: 302, headers });
  const disposition = INLINE.has(file.mime) ? 'inline' : 'attachment';
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: { ...headers, 'Content-Type': file.mime, 'Content-Disposition': `${disposition}; filename="${file.filename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`, 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" },
  });
}
