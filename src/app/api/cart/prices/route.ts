import { z } from 'zod';
import { getStore } from '@/lib/data/store';
import { guard, json } from '@/lib/request';
import { getTradeAccount } from '@/lib/trade-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(100) });

/**
 * Precios vigentes para las líneas del carrito según la sesión (cliente final o cuenta comercial aprobada).
 * Solo informativo: el pedido los vuelve a calcular en el servidor.
 */
export async function POST(req: Request) {
  if (!(await guard('cart_prices', 60, 60))) return json({ error: 'Demasiadas solicitudes.' }, 429);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: 'Solicitud no válida' }, 400);
  const trade = await getTradeAccount();
  const products = await getStore().getProductsByIds(p.data.ids, trade?.tier);
  return Response.json({
    tier: trade?.tier ?? 'final',
    prices: Object.fromEntries(products.map((x) => [x.id, { unitPrice: x.promo_price ?? x.price, vatRate: x.vat_rate, tierApplied: x.tier_applied ?? 'final' }])),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
