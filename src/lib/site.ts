// Valores por defecto de la empresa. En producción se sobrescriben desde site_settings (panel → Configuración).
export const SITE = {
  name: 'Energy Solutions Ecuador',
  legalName: 'Energy Solutions Ecuador S.A.S.',
  domain: 'www.energysolec.com',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.energysolec.com',
  whatsapp: '593979655095',
  whatsappDisplay: '+593 97 965 5095',
  email: 'info@energysolec.com',            // PROVISIONAL: confirmar
  city: 'Guayaquil, Ecuador',                // PROVISIONAL: confirmar dirección oficial
  privacyPolicyVersion: '2026-11-v1',
  brand: { yellow: '#FDC913', graphite: '#282626', blue: '#0082AA' },
};
export const waLink = (text: string, phone = SITE.whatsapp) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
