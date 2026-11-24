import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CartProvider } from '@/components/cart';
import { Header, WhatsAppFab } from '@/components/header';
import { Footer } from '@/components/footer';
import { ConsentAndAnalytics, PageViewBeacon } from '@/components/consent';
import { PublicOnly } from '@/components/public-only';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: 'Energy Solutions Ecuador | Energía solar e ingeniería eléctrica', template: '%s | Energy Solutions Ecuador' },
  description: 'Sistemas solares fotovoltaicos residenciales, comerciales e industriales en Ecuador. Ingeniería EPC, baterías, BESS, calculadora solar y tienda de equipos.',
  openGraph: { type: 'website', locale: 'es_EC', siteName: SITE.name, images: ['/brand/logo.png'] },
  alternates: { canonical: '/' },
  icons: { icon: '/brand/favicon.png' },
};
export const viewport: Viewport = { themeColor: '#282626', width: 'device-width', initialScale: 1 };

const orgLd = {
  '@context': 'https://schema.org', '@type': 'Organization', name: SITE.legalName, alternateName: SITE.name, url: SITE.url,
  logo: `${SITE.url}/brand/logo.png`, contactPoint: [{ '@type': 'ContactPoint', telephone: '+593979655095', contactType: 'sales', areaServed: 'EC', availableLanguage: ['es'] }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-EC">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..800&display=swap" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
      </head>
      <body className="min-h-screen antialiased">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Saltar al contenido</a>
        <CartProvider>
          <PublicOnly><Header /></PublicOnly>
          <main id="contenido">{children}</main>
          <PublicOnly><Footer /><WhatsAppFab /></PublicOnly>
        </CartProvider>
        <PublicOnly><ConsentAndAnalytics /><PageViewBeacon /></PublicOnly>
      </body>
    </html>
  );
}
