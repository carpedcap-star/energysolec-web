import type { Order } from '../data/types';
import { fmtUsd2 } from '../format';

/** Mensaje estructurado del pedido para WhatsApp. Función pura (probada en whatsapp.test.ts). */
export function orderMessage(o: Pick<Order, 'number' | 'customer_name' | 'items' | 'subtotal' | 'tax' | 'total' | 'city' | 'needs_installation' | 'customer_type'> & { price_tier?: string; company?: string | null }) {
  const trade = o.price_tier && o.price_tier !== 'final';
  const lines = [
    `*Pedido ${o.number}* — Energy Solutions Ecuador`,
    `Cliente: ${o.customer_name} (${o.customer_type})`,
    ...(trade ? [`Cuenta comercial: ${o.company ?? '—'} · precios de ${o.price_tier}`] : []),
    // Quien se declara instalador o distribuidor sin cuenta aprobada paga precio de cliente final.
    ...(!trade && (o.customer_type === 'instalador' || o.customer_type === 'distribuidor') ? ['Sin cuenta comercial aprobada: precios de cliente final.'] : []),
    '',
    '*Productos:*',
    ...o.items.map((i) => i.unit_price > 0
      ? `• ${i.qty} × ${i.name} [${i.sku}] — ${fmtUsd2(i.unit_price)} c/u = ${fmtUsd2(i.line_subtotal)}`
      : `• ${i.qty} × ${i.name} [${i.sku}] — precio a cotizar`),
    '',
    `Subtotal: ${fmtUsd2(o.subtotal)}`,
    `Impuestos: ${fmtUsd2(o.tax)}`,
    `*Total estimado: ${fmtUsd2(o.total)}*${o.items.some((i) => i.unit_price <= 0) ? ' (+ productos por cotizar)' : ''}`,
    '',
    `Ciudad de entrega: ${o.city}`,
    `Requiere instalación: ${o.needs_installation ? 'Sí' : 'No'}`,
    '',
    'Precios y disponibilidad sujetos a confirmación del asesor comercial.',
  ];
  return lines.join('\n');
}

/** Envío por WhatsApp Business Cloud API (solo si hay integración autorizada). */
export async function sendCloudText(to: string, body: string) {
  const token = process.env.WHATSAPP_CLOUD_TOKEN, phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return false;
  const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  return !!r?.ok;
}
