// Datos fijos de la empresa. El contacto (WhatsApp, correo, ciudad, redes) se edita en el panel → Configuración:
// léelo con getContact() (servidor) o useSiteContact() (cliente), nunca de aquí.
export const SITE = {
  name: 'Energy Solutions Ecuador',
  legalName: 'Energy Solutions Ecuador S.A.S.',
  domain: 'www.energysolec.com',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.energysolec.com',
  privacyPolicyVersion: '2026-11-v3',
  brand: { yellow: '#FDC913', graphite: '#282626', blue: '#0082AA' },
};
/** Enlace de WhatsApp con mensaje. `phone`: dígitos con código de país (el de la empresa sale de getContact()). */
export const waLink = (text: string, phone: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
