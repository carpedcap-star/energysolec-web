import Link from 'next/link';
export default function NotFound() {
  return <section className="grid min-h-[70vh] place-items-center pt-24 text-center"><div><p className="eyebrow">Error 404</p><h1 className="font-display mt-3 text-4xl font-extrabold">Página no encontrada</h1><Link href="/" className="btn-primary mt-8">Volver al inicio</Link></div></section>;
}
