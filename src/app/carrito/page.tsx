import { CartCheckout } from '@/components/store/checkout';
import { getTradeAccount } from '@/lib/trade-auth';
import { tierLabel } from '@/lib/services/trade';

export const metadata = { title: 'Carrito de compras', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTradeAccount();
  const trade = t ? { company: t.company, contact_name: t.contact_name, email: t.email, phone: t.phone, city: t.city, tier: t.tier, tierLabel: tierLabel(t.tier) } : null;
  return <section className="pb-24 pt-32"><div className="container-site"><h1 className="font-display text-4xl font-extrabold">Carrito de compras</h1><div className="mt-8"><CartCheckout trade={trade} /></div></div></section>;
}
