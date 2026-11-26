import { getStore } from '@/lib/data/store';
import { clientMeta, guard, json, verifyHuman } from '@/lib/request';
import { TURNSTILE_ACTIONS } from '@/lib/turnstile';
import { OrderBody, firstError } from '@/lib/schemas';
import { priceCart } from '@/lib/services/cart';
import { orderMessage, sendCloudText } from '@/lib/services/whatsapp';
import { notifySales, sendEmail, esc } from '@/lib/services/messaging';
import { SITE, waLink } from '@/lib/site';
import { fmtUsd2 } from '@/lib/format';
import { getTradeAccount } from '@/lib/trade-auth';
import { getContact } from '@/lib/site-settings';
import { tierLabel } from '@/lib/services/trade';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await guard('order', 10, 3600))) return json({ error: 'Demasiadas solicitudes. Intenta más tarde.' }, 429);
  const p = OrderBody.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: firstError(p.error) }, 400);
  const b = p.data;
  if (!(await verifyHuman(b.turnstileToken, b.website, TURNSTILE_ACTIONS.order))) return json({ error: 'No pudimos verificar el envío.' }, 400);

  const store = getStore();
  // El nivel de precios sale SOLO de la sesión de una cuenta comercial aprobada, nunca de lo que envía el navegador.
  const trade = await getTradeAccount();
  const tier = trade?.tier ?? 'final';
  const customerType = trade ? trade.tier : b.customerType;
  const products = await store.getProductsByIds(b.lines.map((l) => l.productId), tier);
  if (process.env.NODE_ENV === 'production' && products.some((x) => x.is_placeholder))
    return json({ error: 'El carrito contiene productos de ejemplo que no están a la venta.' }, 400);
  const cart = priceCart(b.lines, products);
  if (cart.problems.length || !cart.items.length) return json({ error: 'Algunos productos ya no están disponibles. Revisa tu carrito.' }, 409);

  const meta = await clientMeta();
  const lead = await store.createLead({
    full_name: b.name, email: b.email, phone: b.phone, company: trade?.company ?? null, segment: trade || b.customerType === 'empresa' ? 'comercial' : 'residencial',
    city: b.city, source: 'tienda', utm: b.utm, estimated_investment_usd: cart.total,
  }, [{ purpose: 'privacidad_servicio', granted: true }, { purpose: 'comercial_marketing', granted: b.acceptMarketing }],
  { ipHash: meta.ipHash, ua: meta.ua, policyVersion: SITE.privacyPolicyVersion });

  // 1) Se guarda el pedido completo ANTES de redirigir a WhatsApp
  const order = await store.createOrder({
    lead_id: lead.id, customer_name: b.name, email: b.email, phone: b.phone, city: b.city, address: b.address,
    customer_type: customerType, notes: b.notes || null, needs_installation: b.needsInstallation,
    subtotal: cart.subtotal, tax: cart.tax, total: cart.total, items: cart.items,
    price_tier: tier, trade_account_id: trade?.id ?? null,
  });
  const msg = orderMessage({ ...order, items: cart.items, customer_type: customerType, price_tier: tier, company: trade?.company });
  // 2) WhatsApp Business API si existe integración autorizada; si no, enlace wa.me para que el cliente confirme el envío
  const company = await getContact();
  const viaApi = await sendCloudText(company.whatsapp, msg);
  await store.setOrderWhatsapp(order.id, msg, viaApi ? 'cloud_api' : 'wa_link');
  await store.track('order_created', { total: cart.total, items: cart.items.length, tier });

  await Promise.allSettled([
    sendEmail({ to: b.email, template: 'pedido_recibido', subject: `Pedido ${order.number} recibido — Energy Solutions Ecuador`,
      html: `<div style="font-family:Arial,sans-serif"><p>Hola ${esc(b.name)}, registramos tu pedido <b>${order.number}</b> por un total estimado de <b>${fmtUsd2(cart.total)}</b>.</p><p>Un asesor confirmará disponibilidad, forma de pago, entrega${b.needsInstallation ? ' e instalación' : ''}. No realices pagos hasta recibir la confirmación formal.</p></div>` }),
    notifySales(`Nuevo pedido ${order.number}`, [['Cliente', b.name], ['Tipo', customerType], ['Cuenta comercial', trade ? `${trade.company} (${tierLabel(trade.tier)})` : null], ['Teléfono', b.phone], ['Ciudad', b.city], ['Total estimado', fmtUsd2(cart.total)], ['Instalación', b.needsInstallation ? 'Sí' : 'No']], `${SITE.url}/admin/pedidos/${order.id}`),
  ]);

  return json({ number: order.number, total: cart.total, whatsappUrl: waLink(msg, company.whatsapp), sentViaApi: viaApi });
}
