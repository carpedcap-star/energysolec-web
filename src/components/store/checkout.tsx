'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCart } from '../cart';
import { getUtm, track } from '../consent';
import { TURNSTILE_ERROR, useTurnstile } from '@/components/turnstile';
import { TURNSTILE_ACTIONS } from '@/lib/turnstile';
import { fmtUsd2 } from '@/lib/format';
import { IconWhatsapp } from '../icons';

export type CheckoutTrade = { company: string; contact_name: string; email: string; phone: string | null; city: string | null; tier: string; tierLabel: string };

export function CartCheckout({ trade }: { trade?: CheckoutTrade | null }) {
  const { lines, setQty, remove, subtotal, tax, clear, reprice } = useCart();
  const ids = lines.map((l) => l.productId).sort().join(',');
  // El carrito guarda el precio del momento en que se agregó: se actualiza al nivel y precio vigentes de la sesión.
  useEffect(() => {
    if (!ids) return;
    let alive = true;
    fetch('/api/cart/prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids.split(',') }) })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j?.prices) reprice(j.prices); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const orderable = lines.filter((l) => !l.unavailable);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const human = useTurnstile(TURNSTILE_ACTIONS.order);
  const [done, setDone] = useState<{ number: string; whatsappUrl: string; total: number; sentViaApi: boolean } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr('');
    const turnstileToken = await human.getToken().catch(() => null);
    if (turnstileToken === null) { setBusy(false); return setErr(TURNSTILE_ERROR); }
    const r = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      lines: orderable.map((l) => ({ productId: l.productId, qty: l.qty })),
      name: f.get('name'), email: f.get('email'), phone: f.get('phone'), city: f.get('city'), address: f.get('address'),
      customerType: trade ? trade.tier : f.get('customerType'), notes: f.get('notes') || '', needsInstallation: f.get('install') === 'on',
      acceptPrivacy: f.get('privacy') === 'on', acceptMarketing: f.get('marketing') === 'on', utm: getUtm(), website: f.get('website') || '', turnstileToken,
    }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr((await r?.json().catch(() => null))?.error ?? 'No se pudo registrar el pedido.');
    const j = await r.json();
    setDone(j); clear();
    track('purchase_intent', { transaction_id: j.number, value: j.total, currency: 'USD' });
  }

  if (done) return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <p className="eyebrow">Pedido registrado</p>
      <p className="font-display mt-2 text-3xl font-extrabold">{done.number}</p>
      <p className="mt-3 text-muted">Total estimado {fmtUsd2(done.total)}. Envía el detalle por WhatsApp para que un asesor confirme disponibilidad, pago y entrega. No realices pagos hasta recibir la confirmación formal.</p>
      <a href={done.whatsappUrl} target="_blank" rel="noopener" className="btn mt-6 bg-[#25D366] text-white" onClick={() => track('whatsapp_click', { from: 'order' })}><IconWhatsapp className="h-5 w-5" /> Enviar pedido por WhatsApp</a>
      <p className="mt-4 text-xs text-muted">Te enviamos una copia a tu correo.</p>
    </div>
  );

  if (!lines.length) return <div className="card p-10 text-center"><p className="text-muted">Tu carrito está vacío.</p><Link href="/tienda" className="btn-primary mt-5">Ir a la tienda</Link></div>;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <div className="card divide-y divide-line">
          {lines.map((l) => (
            <div key={l.productId} className="flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <Link href={`/tienda/${l.slug}`} className="font-medium hover:underline">{l.name}</Link>
                <p className="text-xs text-muted">SKU {l.sku} · {l.unitPrice > 0 ? `${fmtUsd2(l.unitPrice)} c/u` : 'Precio a consultar'}{trade && l.tierApplied && l.tierApplied !== 'final' ? ` · precio ${trade.tierLabel.toLowerCase()}` : ''}{trade && l.tierApplied === 'final' ? ' · precio cliente final' : ''}</p>
                {l.unavailable && <p className="text-xs font-semibold text-red-700">Ya no está disponible: no se incluirá en el pedido.</p>}
                {l.placeholder && <span className="placeholder-badge mt-1">Ejemplo</span>}
              </div>
              <input type="number" min={1} max={9999} value={l.qty} onChange={(e) => setQty(l.productId, +e.target.value)} className="input !w-20" aria-label={`Cantidad de ${l.name}`} />
              <p className="w-24 text-right font-semibold tabular-nums">{fmtUsd2(l.unitPrice * l.qty)}</p>
              <button onClick={() => remove(l.productId)} className="text-sm text-muted underline" aria-label={`Quitar ${l.name}`}>Quitar</button>
            </div>
          ))}
        </div>
        <div className="card space-y-2 p-5 text-sm">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="tabular-nums">{fmtUsd2(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Impuestos (IVA)</span><span className="tabular-nums">{fmtUsd2(tax)}</span></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><span>Total estimado</span><span className="tabular-nums">{fmtUsd2(subtotal + tax)}</span></div>
          <p className="text-xs text-muted">Los precios se recalculan y confirman al registrar el pedido. No incluye envío ni instalación.</p>
        </div>
      </div>
      <form onSubmit={submit} className="card grid gap-4 self-start p-6 sm:grid-cols-2">
        <p className="font-semibold sm:col-span-2">Datos para tu pedido</p>
        {trade && <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm sm:col-span-2" role="status">Pedido de <b>{trade.company}</b> con precios de {trade.tierLabel.toLowerCase()}.</p>}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <div className="sm:col-span-2"><label className="label" htmlFor="o-name">Nombre *</label><input id="o-name" name="name" required minLength={2} className="input" autoComplete="name" defaultValue={trade?.contact_name} /></div>
        <div><label className="label" htmlFor="o-email">Correo *</label><input id="o-email" name="email" type="email" required className="input" autoComplete="email" defaultValue={trade?.email} /></div>
        <div><label className="label" htmlFor="o-phone">Teléfono / WhatsApp *</label><input id="o-phone" name="phone" type="tel" required className="input" autoComplete="tel" defaultValue={trade?.phone ?? undefined} /></div>
        <div><label className="label" htmlFor="o-city">Ciudad *</label><input id="o-city" name="city" required className="input" autoComplete="address-level2" defaultValue={trade?.city ?? undefined} /></div>
        {trade
          ? <div><p className="label">Tipo de cliente</p><p className="input bg-surface">{trade.tierLabel}</p></div>
          : <div><label className="label" htmlFor="o-type">Tipo de cliente *</label><select id="o-type" name="customerType" className="input" required><option value="final">Cliente final</option><option value="empresa">Empresa</option><option value="instalador">Instalador</option><option value="distribuidor">Distribuidor</option></select>
              <p className="mt-1 text-xs text-muted">Precios de instalador o distribuidor solo con <Link href="/cuenta/ingresar?next=/carrito" className="underline">cuenta comercial</Link>.</p></div>}
        <div className="sm:col-span-2"><label className="label" htmlFor="o-address">Dirección de entrega *</label><input id="o-address" name="address" required minLength={5} className="input" autoComplete="street-address" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="o-notes">Observaciones</label><textarea id="o-notes" name="notes" rows={2} className="input" maxLength={1000} /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="install" /> Requiero instalación</label>
        <div className="space-y-2 text-sm text-muted sm:col-span-2">
          <label className="flex items-start gap-2"><input type="checkbox" name="privacy" required className="mt-1" /> <span>Acepto la <Link href="/privacidad" target="_blank" className="underline">política de privacidad</Link>. *</span></label>
          <label className="flex items-start gap-2"><input type="checkbox" name="marketing" className="mt-1" /> <span>Autorizo recibir promociones y novedades (opcional).</span></label>
        </div>
        {human.slot && <div className="sm:col-span-2">{human.slot}</div>}
        {err && <p className="text-sm text-red-600 sm:col-span-2" role="alert">{err}</p>}
        <button className="btn-primary sm:col-span-2" disabled={busy || orderable.length === 0}>{busy ? 'Registrando…' : 'Registrar pedido y continuar por WhatsApp'}</button>
      </form>
    </div>
  );
}
