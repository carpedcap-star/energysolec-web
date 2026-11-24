'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV } from '@/lib/nav';
import { useCart } from './cart';
import { IconCart, IconClose, IconMenu, IconWhatsapp } from './icons';
import { SITE, waLink } from '@/lib/site';

export function Header() {
  const path = usePathname();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const dark = path === '/' && !scrolled && !open;
  useEffect(() => { const f = () => setScrolled(window.scrollY > 24); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  useEffect(() => setOpen(false), [path]);
  const main = NAV.filter((n) => !['/', '/nosotros', '/blog', '/financiamiento'].includes(n.href));

  return (
    <header className={`fixed inset-x-0 top-0 z-40 transition-colors ${dark ? 'bg-transparent' : 'border-b border-line bg-white/95 backdrop-blur'}`}>
      <div className="container-site flex h-[68px] items-center gap-4">
        <Link href="/" className="shrink-0" aria-label="Energy Solutions Ecuador — inicio">
          <Image src={dark ? '/brand/logo-dark.png' : '/brand/logo.png'} alt="Energy Solutions" width={150} height={50} priority className="h-10 w-auto" />
        </Link>
        <nav className="ml-2 hidden flex-1 items-center gap-0.5 xl:flex" aria-label="Principal">
          {main.map((n) => n.children ? (
            <div key={n.href} className="group relative">
              <Link href={n.children[0].href} className={`whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-medium ${dark ? 'text-white/85 hover:text-white' : 'text-ink/80 hover:text-ink'}`}>{n.label}</Link>
              <div className="invisible absolute left-0 top-full w-56 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="card p-2 shadow-xl">{n.children.map((c) => <Link key={c.href} href={c.href} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface">{c.label}</Link>)}</div>
              </div>
            </div>
          ) : (
            <Link key={n.href} href={n.href} className={`whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-medium ${path.startsWith(n.href) ? (dark ? 'text-white' : 'text-ink') : dark ? 'text-white/85 hover:text-white' : 'text-ink/80 hover:text-ink'}`}>{n.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/calculadora" className={`hidden md:inline-flex xl:hidden 2xl:inline-flex ${dark ? 'btn-ghost-dark' : 'btn-ghost'} !py-2`}>Calcular mi ahorro</Link>
          <Link href="/contacto?tema=cotizacion" className="btn-primary hidden !py-2 sm:inline-flex">Cotizar mi proyecto</Link>
          <Link href="/carrito" className={`relative rounded-full p-2.5 ${dark ? 'text-white' : 'text-ink'}`} aria-label={`Carrito de compras, ${count} productos`}>
            <IconCart />
            {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-brand-dark">{count}</span>}
          </Link>
          <button className={`rounded-full p-2.5 xl:hidden ${dark ? 'text-white' : 'text-ink'}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menú">{open ? <IconClose /> : <IconMenu />}</button>
        </div>
      </div>
      {open && (
        <nav className="max-h-[calc(100vh-68px)] overflow-y-auto border-t border-line bg-white xl:hidden" aria-label="Móvil">
          <div className="container-site grid gap-1 py-4">
            {NAV.map((n) => (
              <div key={n.href}>
                <Link href={n.children ? n.children[0].href : n.href} className="block rounded-lg px-3 py-2.5 font-medium hover:bg-surface">{n.label}</Link>
                {n.children && <div className="ml-3 border-l border-line pl-3">{n.children.map((c) => <Link key={c.href} href={c.href} className="block px-3 py-2 text-sm text-muted">{c.label}</Link>)}</div>}
              </div>
            ))}
            <div className="mt-3 grid gap-2 sm:hidden"><Link href="/contacto?tema=cotizacion" className="btn-primary">Cotizar mi proyecto</Link><Link href="/calculadora" className="btn-ghost">Calcular mi ahorro</Link></div>
          </div>
        </nav>
      )}
    </header>
  );
}

/** Botón flotante permanente de WhatsApp */
export function WhatsAppFab() {
  return (
    <a href={waLink('Hola, quisiera información sobre soluciones solares de Energy Solutions Ecuador.')} target="_blank" rel="noopener"
      data-track="whatsapp_click" className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105" aria-label={`Escríbenos por WhatsApp al ${SITE.whatsappDisplay}`}>
      <IconWhatsapp className="h-7 w-7" />
    </a>
  );
}
