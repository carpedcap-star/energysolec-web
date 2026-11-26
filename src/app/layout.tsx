import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CartProvider } from '@/components/cart';
import { Header, WhatsAppFab } from '@/components/header';
import { Footer } from '@/components/footer';
import { ConsentAndAnalytics, PageViewBeacon } from '@/components/consent';
import { PublicOnly } from '@/components/public-only';
import { SITE } from '@/lib/site';
import { getIdentity } from '@/lib/identity';
import { getSiteSettings } from '@/lib/site-settings';
import { SiteContactProvider } from '@/components/site-contact';

const abs = (u: string) => (u.startsWith('/') ? `${SITE.url}${u}` : u);

export async function generateMetadata(): Promise<Metadata> {
  const { urls } = await getIdentity();
  return { ...BASE_METADATA, openGraph: { ...BASE_METADATA.openGraph, images: [abs(urls.logo)] }, icons: { icon: urls.favicon } };
}
export async function generateViewport(): Promise<Viewport> {
  const { colors } = await getIdentity();
  return { themeColor: colors.dark, width: 'device-width', initialScale: 1 };
}

const BASE_METADATA: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: 'Energy Solutions Ecuador | Energía solar e ingeniería eléctrica', template: '%s | Energy Solutions Ecuador' },
  description: 'Sistemas solares fotovoltaicos residenciales, comerciales e industriales en Ecuador. Ingeniería EPC, baterías, BESS, calculadora solar y tienda de equipos.',
  openGraph: { type: 'website', locale: 'es_EC', siteName: SITE.name },
  alternates: { canonical: '/' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [identity, settings] = await Promise.all([getIdentity(), getSiteSettings()]);
  const c = settings.contact;
  const sameAs = Object.values(c.socials).filter(Boolean);
  const orgLd = {
    '@context': 'https://schema.org', '@type': 'Organization', name: SITE.legalName, alternateName: SITE.name, url: SITE.url,
    logo: abs(identity.urls.logo), email: c.email, ...(sameAs.length ? { sameAs } : {}),
    contactPoint: [{ '@type': 'ContactPoint', telephone: `+${c.whatsapp}`, contactType: 'sales', areaServed: 'EC', availableLanguage: ['es'] }],
  };
  return (
    // Identidad gráfica del panel: las variables CSS de marca se definen aquí y prevalecen sobre las de globals.css.
    <html lang="es-EC" style={identity.vars as React.CSSProperties}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..800&display=swap" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd).replace(/</g, '\\u003c') }} />
      </head>
      <body className="min-h-screen antialiased">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Saltar al contenido</a>
        <SiteContactProvider value={{ whatsapp: c.whatsapp, whatsappDisplay: c.whatsappDisplay, email: c.email }}>
        <CartProvider>
          <PublicOnly><Header logo={identity.urls.logo} logoDark={identity.urls.logoDark} /></PublicOnly>
          <main id="contenido">{children}</main>
          <PublicOnly><Footer logoDark={identity.urls.logoDark} contact={c} /><WhatsAppFab /></PublicOnly>
        </CartProvider>
        </SiteContactProvider>
        <PublicOnly><ConsentAndAnalytics ids={settings.integrations} /><PageViewBeacon /></PublicOnly>
      </body>
    </html>
  );
}
