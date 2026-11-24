import { CartCheckout } from '@/components/store/checkout';
export const metadata = { title: 'Carrito de compras', robots: { index: false } };
export default function Page() {
  return <section className="pb-24 pt-32"><div className="container-site"><h1 className="font-display text-4xl font-extrabold">Carrito de compras</h1><div className="mt-8"><CartCheckout /></div></div></section>;
}
