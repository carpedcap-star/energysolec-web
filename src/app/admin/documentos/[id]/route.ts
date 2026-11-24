import { NextResponse } from 'next/server';
import { getStaff, can } from '@/lib/auth';
import { getStore } from '@/lib/data/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Documentos del bucket privado (respaldos de relaciones con marcas). Solo personal con permiso.
 * Supabase: redirige a una URL firmada de 60 s. Desarrollo: entrega el archivo de .data/private.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staff) return new NextResponse('No autorizado', { status: 401 });
  if (!can(staff, 'brand_docs')) return new NextResponse('Sin permiso', { status: 403 });
  const doc = await getStore().getPrivateDocument((await params).id);
  if (!doc) return new NextResponse('No encontrado', { status: 404 });
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
  if ('signedUrl' in doc) return NextResponse.redirect(doc.signedUrl, { status: 302, headers });
  return new NextResponse(new Uint8Array(doc.bytes), { headers: { ...headers, 'Content-Type': doc.mime, 'Content-Disposition': `inline; filename="${doc.filename}"` } });
}
