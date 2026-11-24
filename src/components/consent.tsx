'use client';
import Script from 'next/script';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Gestión de consentimiento (LOPDP) + Google Consent Mode v2.
 * Analítica y publicidad quedan DENEGADAS por defecto hasta que el usuario acepte.
 * IDs de GA4 / GTM / Meta Pixel vienen de variables públicas (o del panel → Integraciones).
 */
type Choice = { analytics: boolean; ads: boolean; at: string };
const KEY = 'ese_consent_v1';
const GTM = process.env.NEXT_PUBLIC_GTM_ID, GA = process.env.NEXT_PUBLIC_GA4_ID, PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID;

declare global { interface Window { dataLayer: unknown[]; gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void } }

export function getUtm(): Record<string, string> { try { return JSON.parse(localStorage.getItem('ese_utm') ?? '{}'); } catch { return {}; } }

export function track(event: string, params: Record<string, unknown> = {}) {
  try { window.dataLayer?.push({ event, ...params }); window.fbq?.('trackCustom', event, params); } catch {}
}

export function ConsentAndAnalytics() {
  const [choice, setChoice] = useState<Choice | null | undefined>(undefined);
  const [custom, setCustom] = useState(false);
  const [a, setA] = useState(true), [ads, setAds] = useState(false);

  useEffect(() => {
    try { setChoice(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { setChoice(null); }
    // Captura de UTM y click IDs (primer toque gana durante 90 días)
    try {
      const q = new URLSearchParams(location.search); const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
      const found = Object.fromEntries(keys.filter((k) => q.get(k)).map((k) => [k, q.get(k)!.slice(0, 200)]));
      const prev = JSON.parse(localStorage.getItem('ese_utm') ?? '{}');
      if (Object.keys(found).length && (!prev._at || Date.now() - prev._at > 90 * 864e5)) localStorage.setItem('ese_utm', JSON.stringify({ ...found, landing: location.pathname, _at: Date.now() }));
    } catch {}
  }, []);

  useEffect(() => {
    if (!choice) return;
    window.gtag?.('consent', 'update', { analytics_storage: choice.analytics ? 'granted' : 'denied', ad_storage: choice.ads ? 'granted' : 'denied', ad_user_data: choice.ads ? 'granted' : 'denied', ad_personalization: choice.ads ? 'granted' : 'denied' });
  }, [choice]);

  const save = (c: Omit<Choice, 'at'>) => { const v = { ...c, at: new Date().toISOString() }; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} setChoice(v); };

  return (
    <>
      {(GTM || GA) && (
        <Script id="consent-default" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)};window.gtag=gtag;
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});`}</Script>
      )}
      {GTM && <Script id="gtm" strategy="afterInteractive">{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM}');`}</Script>}
      {GA && !GTM && <><Script src={`https://www.googletagmanager.com/gtag/js?id=${GA}`} strategy="afterInteractive" /><Script id="ga4" strategy="afterInteractive">{`gtag('js',new Date());gtag('config','${GA}');`}</Script></>}
      {PIXEL && choice?.ads && <Script id="meta-pixel" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL}');fbq('track','PageView');`}</Script>}

      {choice === null && (
        <div role="dialog" aria-label="Preferencias de cookies" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-line bg-white p-5 shadow-2xl sm:bottom-5">
          <p className="text-sm leading-relaxed text-ink">Usamos cookies necesarias para que el sitio funcione y, solo con tu autorización, cookies de analítica y publicidad para medir y mejorar nuestras campañas. <Link href="/privacidad#cookies" className="underline">Más información</Link>.</p>
          {custom && (
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked disabled /> Necesarias (siempre activas)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={a} onChange={(e) => setA(e.target.checked)} /> Analítica (Google Analytics)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={ads} onChange={(e) => setAds(e.target.checked)} /> Publicidad (Google Ads, Meta)</label>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-dark !py-2" onClick={() => save({ analytics: true, ads: true })}>Aceptar todas</button>
            <button className="btn-ghost !py-2" onClick={() => save({ analytics: false, ads: false })}>Solo necesarias</button>
            {custom ? <button className="btn-ghost !py-2" onClick={() => save({ analytics: a, ads })}>Guardar selección</button>
              : <button className="px-3 text-sm underline" onClick={() => setCustom(true)}>Configurar</button>}
          </div>
        </div>
      )}
    </>
  );
}

/** Conteo agregado de visitas (sin identificadores) para el dashboard gerencial. */
export function PageViewBeacon() {
  const path = usePathname();
  useEffect(() => { try { navigator.sendBeacon?.('/api/track', new Blob([JSON.stringify({ name: 'page_view', path })], { type: 'application/json' })); } catch {} }, [path]);
  return null;
}
