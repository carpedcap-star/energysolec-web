import { z } from 'zod';
import type { PriceTier, TierPrice } from '../data/types';
import { effectivePrice } from './catalog';

/**
 * Cuentas comerciales (instaladores y distribuidores autorizados). Lógica pura: validación de la solicitud,
 * estados y precio que corresponde a cada nivel. Sin acceso a datos para poder probarla.
 */

export type TradeTier = Exclude<PriceTier, 'final'>;
export const TRADE_TIERS: { id: TradeTier; label: string; description: string }[] = [
  { id: 'instalador', label: 'Instalador', description: 'Empresas o profesionales que instalan sistemas fotovoltaicos para sus clientes.' },
  { id: 'distribuidor', label: 'Distribuidor', description: 'Empresas que revenden equipos a instaladores o a clientes finales.' },
];
export const tierLabel = (t: PriceTier) => (t === 'final' ? 'Cliente final' : TRADE_TIERS.find((x) => x.id === t)?.label ?? t);

export type TradeStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'suspendida';
export const TRADE_STATUS: Record<TradeStatus, string> = {
  pendiente: 'Pendiente de revisión', aprobada: 'Aprobada', rechazada: 'Rechazada', suspendida: 'Suspendida',
};

export const TRADE_STATUS_STYLE: Record<TradeStatus, string> = {
  pendiente: 'bg-amber-100 text-amber-900', aprobada: 'bg-green-100 text-green-900', rechazada: 'bg-surface text-muted', suspendida: 'bg-red-100 text-red-900',
};

// ---------------------------------------------------------------- RUC
/**
 * RUC ecuatoriano: 13 dígitos, código de provincia 01–24 (o 30, emitidos en el exterior) y establecimiento 001 o
 * superior. No se verifica el dígito de control: su algoritmo cambia según el tipo de contribuyente y un falso
 * rechazo impediría solicitar la cuenta; el RUC se revisa al aprobar.
 */
export function rucProblem(ruc: string): string | null {
  if (!/^\d{13}$/.test(ruc)) return 'El RUC debe tener 13 dígitos.';
  const prov = Number(ruc.slice(0, 2));
  if (!((prov >= 1 && prov <= 24) || prov === 30)) return 'El RUC no corresponde a una provincia del Ecuador.';
  if (Number(ruc.slice(10)) < 1) return 'Los tres últimos dígitos del RUC no pueden ser 000.';
  return null;
}

// ---------------------------------------------------------------- Solicitud
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Teléfono no válido');
export const TradeApplication = z.object({
  company: z.string().trim().min(2, 'Ingresa la razón social o nombre comercial').max(160),
  ruc: z.string().trim().transform((s) => s.replace(/[\s.-]/g, '')).superRefine((s, ctx) => { const p = rucProblem(s); if (p) ctx.addIssue({ code: 'custom', message: p }); }),
  tier: z.enum(['instalador', 'distribuidor'], { message: 'Elige el tipo de cuenta' }),
  contact_name: z.string().trim().min(3, 'Ingresa el nombre de contacto').max(120),
  email: z.string().trim().toLowerCase().email('Correo no válido').max(160),
  phone,
  city: z.string().trim().min(2, 'Ingresa la ciudad').max(80),
  notes: z.string().trim().max(1500).optional().default(''),
  acceptPrivacy: z.literal(true, { message: 'Debes aceptar la política de privacidad.' }),
  acceptMarketing: z.boolean().default(false),
  website: z.string().max(0).optional(),
  turnstileToken: z.string().optional(),
});
export type TradeApplication = z.infer<typeof TradeApplication>;

// ---------------------------------------------------------------- Estados
/** Transiciones permitidas. Una solicitud rechazada no se reabre: la empresa puede enviar una nueva. */
const NEXT: Record<TradeStatus, TradeStatus[]> = {
  pendiente: ['aprobada', 'rechazada'],
  aprobada: ['suspendida'],
  suspendida: ['aprobada'],
  rechazada: [],
};
export const canTransition = (from: TradeStatus, to: TradeStatus) => NEXT[from].includes(to);
export const nextStatuses = (from: TradeStatus) => NEXT[from];
/** Aprobar y suspender dan o quitan acceso a precios: solo Gerencia o superadministración (la base lo impone, 0006). */
export const requiresApprover = (to: TradeStatus) => to === 'aprobada' || to === 'suspendida';

export const ReviewSchema = z.object({
  status: z.enum(['aprobada', 'rechazada', 'suspendida']),
  tier: z.enum(['instalador', 'distribuidor']),
  review_note: z.string().trim().max(1000).optional().default(''),
}).superRefine((v, ctx) => {
  if (v.status !== 'aprobada' && !v.review_note) ctx.addIssue({ code: 'custom', path: ['review_note'], message: 'Indica el motivo: queda en el historial de la cuenta.' });
});

// ---------------------------------------------------------------- Precio por nivel
export type UnitPrice = { price: number; promo_price: number | null; tierApplied: PriceTier };
/**
 * Precio unitario para un nivel. Si el producto no tiene precio para ese nivel (o es 0, «a consultar»), se usa el de
 * cliente final. Un cliente comercial nunca paga más que el cliente final, aunque el precio de nivel esté mal cargado.
 */
export function unitPriceFor(prices: TierPrice[], tier: PriceTier, now = Date.now()): UnitPrice | null {
  const final = effectivePrice(prices, 'final', now);
  if (!final) return null;
  const finalUnit = final.promo_price ?? final.price;
  if (tier === 'final') return { ...final, tierApplied: 'final' };
  const t = effectivePrice(prices, tier, now);
  const tUnit = t ? t.promo_price ?? t.price : 0;
  if (!t || tUnit <= 0 || (finalUnit > 0 && tUnit >= finalUnit)) return { ...final, tierApplied: 'final' };
  return { ...t, tierApplied: tier };
}

/** Campos de precio de un producto público para un nivel (lo que ve la tienda y usa el carrito). */
export function productPricing(prices: TierPrice[], tier: PriceTier = 'final', now = Date.now()) {
  const u = unitPriceFor(prices, tier, now);
  if (!u) return { price: 0, promo_price: null, tier_applied: 'final' as PriceTier, final_unit: 0 };
  const f = effectivePrice(prices, 'final', now)!;
  return { price: u.price, promo_price: u.promo_price, tier_applied: u.tierApplied, final_unit: f.promo_price ?? f.price };
}
