import Link from 'next/link';
import { BrandLogo } from './brand-logo';
import { NAV } from '@/lib/nav';
import { SITE } from '@/lib/site';

export function Footer({ logoDark }: { logoDark: string }) {
  return (
    <footer className="bg-brand-dark text-white/75">
      <div className="container-site grid gap-10 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <BrandLogo src={logoDark} width={190} height={63} className="h-14 w-auto" />
          <p className="mt-5 max-w-xs text-sm leading-relaxed">Ingeniería, tecnología y soluciones energéticas para un futuro más eficiente, rentable y sostenible.</p>
        </div>
        <div>
          <p className="mb-4 text-sm font-semibold text-white">Soluciones</p>
          <ul className="space-y-2 text-sm">{NAV[1].children!.map((c) => <li key={c.href}><Link className="hover:text-brand" href={c.href}>{c.label}</Link></li>)}
            <li><Link className="hover:text-brand" href="/calculadora">Calculadora solar</Link></li><li><Link className="hover:text-brand" href="/tienda">Tienda solar</Link></li></ul>
        </div>
        <div>
          <p className="mb-4 text-sm font-semibold text-white">Empresa</p>
          <ul className="space-y-2 text-sm">{['/proyectos', '/servicios', '/marcas', '/financiamiento', '/nosotros', '/blog'].map((h) => { const n = NAV.find((x) => x.href === h)!; return <li key={h}><Link className="hover:text-brand" href={h}>{n.label}</Link></li>; })}</ul>
        </div>
        <div>
          <p className="mb-4 text-sm font-semibold text-white">Contacto</p>
          <ul className="space-y-2 text-sm">
            <li><a className="hover:text-brand" href={`https://wa.me/${SITE.whatsapp}`}>WhatsApp {SITE.whatsappDisplay}</a></li>
            <li><a className="hover:text-brand" href={`mailto:${SITE.email}`}>{SITE.email}</a></li>
            <li>{SITE.city}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-site flex flex-col gap-2 py-6 text-xs sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} {SITE.legalName}. Todos los derechos reservados.</p>
          <p className="flex gap-4"><Link href="/privacidad" className="hover:text-brand">Política de privacidad</Link><Link href="/privacidad#cookies" className="hover:text-brand">Cookies</Link></p>
        </div>
      </div>
    </footer>
  );
}
