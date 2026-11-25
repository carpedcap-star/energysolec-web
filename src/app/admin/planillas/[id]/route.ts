import { NextResponse } from 'next/server';
import { getStaff, can } from '@/lib/auth';
import { getStore } from '@/lib/data/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Archivo de una planilla subida por un cliente (bucket privado 'bills'). Solo personal con permiso `bills`; Ventas
 * solo ve las planillas de sus propios leads o de leads sin asesor, como en la ficha del lead.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staff) return new NextResponse('No autorizado', { status: 401 });
  if (!can(staff, 'bills')) return new NextResponse('Sin permiso', { status: 403 });
  const store = getStore();
  const id = (await params).id;
  const up = await store.getBillUpload(id);
  if (!up) return new NextResponse('No encontrado', { status: 404 });
  if (staff.role === 'ventas') {
    const lead = up.lead_id ? await store.getLead(up.lead_id) : null;
    if (!lead || (lead.advisor_id && lead.advisor_id !== staff.id)) return new NextResponse('No encontrado', { status: 404 });
  }
  const file = await store.getBillFile(id);
  if (!file) return new NextResponse('No encontrado', { status: 404 });
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff' };
  if ('signedUrl' in file) return NextResponse.redirect(file.signedUrl, { status: 302, headers });
  return new NextResponse(new Uint8Array(file.bytes), { headers: { ...headers, 'Content-Type': file.mime, 'Content-Disposition': `inline; filename="${file.filename}"` } });
}
