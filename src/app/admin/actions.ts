'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff, signIn, signOut, can } from '@/lib/auth';
import { getStore } from '@/lib/data/store';
import { CalcParams } from '@/lib/engine/params';
import { LEAD_STAGES, ORDER_STATUSES, PAID_STATES, type AppRole } from '@/lib/data/types';

export async function loginAction(_: unknown, fd: FormData) {
  const err = await signIn(String(fd.get('email') ?? ''), String(fd.get('password') ?? ''), (fd.get('role') as AppRole) || 'superadmin');
  if (err) return { error: err };
  redirect('/admin');
}
export async function logoutAction() { await signOut(); redirect('/admin/login'); }

export async function updateLeadAction(id: string, fd: FormData) {
  const staff = await requireStaff('leads_edit');
  const store = getStore();
  const lead = await store.getLead(id);
  if (!lead) throw new Error('Lead no encontrado');
  if (staff.role === 'ventas' && lead.advisor_id && lead.advisor_id !== staff.id) throw new Error('Este lead está asignado a otro asesor');
  const stage = fd.get('stage') as string;
  const patch: Record<string, unknown> = {};
  if (stage && LEAD_STAGES.some((s) => s.id === stage)) patch.stage = stage;
  const next = fd.get('next_activity_at') as string;
  if (next) patch.next_activity_at = new Date(next).toISOString();
  const nextNote = (fd.get('next_activity_note') as string)?.trim();
  if (nextNote) patch.next_activity_note = nextNote.slice(0, 300);
  if (!lead.advisor_id && staff.role === 'ventas') patch.advisor_id = staff.id;
  await store.updateLead(id, patch as any, staff.id);
  const note = (fd.get('note') as string)?.trim();
  if (note) await store.addActivity(id, (fd.get('kind') as string) || 'nota', note.slice(0, 3000), staff.id);
  revalidatePath(`/admin/leads/${id}`); revalidatePath('/admin/leads');
}

export async function updateOrderAction(id: string, _: unknown, fd: FormData) {
  const staff = await requireStaff('orders');
  const status = fd.get('status') as string;
  if (!ORDER_STATUSES.some((s) => s.id === status)) return { error: 'Estado no válido' };
  const ref = (fd.get('payment_reference') as string)?.trim();
  if (PAID_STATES.includes(status as any)) {
    const order = await getStore().getOrder(id);
    const alreadyVerified = !!order?.payment_verified_by;
    if (!alreadyVerified) {
      if (!can(staff, 'verify_payment')) return { error: 'Solo Gerencia puede registrar la verificación del pago.' };
      if (!ref || ref.length < 4) return { error: 'Ingresa la referencia verificable del pago (comprobante, transferencia, voucher).' };
    }
  }
  try {
    await getStore().updateOrderStatus(id, status as any, staff.id, ref && can(staff, 'verify_payment') ? { reference: ref } : undefined);
  } catch (e) { return { error: (e as Error).message }; }
  revalidatePath(`/admin/pedidos/${id}`); revalidatePath('/admin/pedidos');
  return { ok: true };
}

export async function saveParamsAction(_: unknown, fd: FormData) {
  const staff = await requireStaff('params');
  let raw: unknown;
  try { raw = JSON.parse(String(fd.get('json'))); } catch { return { error: 'JSON no válido' }; }
  const parsed = CalcParams.omit({ version: true }).safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 5).join(' · ') };
  const v = await getStore().saveParams(parsed.data, staff.id);
  revalidatePath('/admin/parametros');
  return { ok: true, version: v.version };
}

const Block = z.object({ from_kwh: z.number().min(0), to_kwh: z.number().positive().nullable(), usd_per_kwh: z.number().min(0).max(2) });
const TariffForm = z.object({
  id: z.string().optional(), code: z.string().min(2).max(40), name: z.string().min(3), segment: z.enum(['residencial', 'comercial', 'industrial']),
  voltage_level: z.enum(['BT', 'MT', 'AT']), has_demand_charge: z.boolean(), demand_usd_per_kw: z.number().min(0).nullable(),
  commercialization_usd: z.number().min(0), other_charges_pct: z.number().min(0).max(0.5), energy_blocks: z.array(Block).min(1),
  source_note: z.string().min(10, 'Indica la fuente: resolución ARCONEL, fecha y distribuidora'), is_placeholder: z.boolean(),
});
export async function saveTariffAction(_: unknown, fd: FormData) {
  await requireStaff('tariffs');
  let raw: unknown; try { raw = JSON.parse(String(fd.get('json'))); } catch { return { error: 'JSON no válido' }; }
  const p = TariffForm.safeParse(raw);
  if (!p.success) return { error: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 4).join(' · ') };
  await getStore().saveTariff(p.data as any);
  revalidatePath('/admin/tarifas');
  return { ok: true };
}

export async function saveStatAction(fd: FormData) {
  await requireStaff('stats');
  const s = z.object({ id: z.string(), label: z.string().min(2), value: z.coerce.number().min(0), unit: z.string().max(12).optional(), source_note: z.string().min(5), verified: z.boolean(), sort: z.coerce.number() })
    .parse({ id: fd.get('id'), label: fd.get('label'), value: fd.get('value'), unit: fd.get('unit') || undefined, source_note: fd.get('source_note'), verified: fd.get('verified') === 'on', sort: fd.get('sort') });
  await getStore().saveStat({ ...s, unit: s.unit ?? null });
  revalidatePath('/admin/indicadores'); revalidatePath('/');
}
