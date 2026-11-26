import 'server-only';
import { cache } from 'react';
import { getStore } from './data/store';
import { formatWhatsapp, normalizeContact, normalizeIntegrations, normalizeNotifications, type Contact, type Integrations, type Notifications } from './services/site-settings';

export type SiteSettings = { contact: Contact & { whatsappDisplay: string }; notifications: Notifications; integrations: Integrations };

/** Contacto, avisos e integraciones vigentes (una lectura por petición). Ante cualquier fallo, los valores por defecto. */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const store = getStore();
  const read = async (k: string) => { try { return await store.getSetting<unknown>(k, null); } catch (e) { console.error(`ajustes ${k}:`, e); return null; } };
  const [c, n, i] = await Promise.all([read('contact'), read('notifications'), read('integrations_public')]);
  const contact = normalizeContact(c);
  return {
    contact: { ...contact, whatsappDisplay: formatWhatsapp(contact.whatsapp) },
    notifications: normalizeNotifications(n, process.env.SALES_NOTIFY_EMAIL),
    integrations: normalizeIntegrations(i, { gtm: process.env.NEXT_PUBLIC_GTM_ID, ga4: process.env.NEXT_PUBLIC_GA4_ID, metaPixel: process.env.NEXT_PUBLIC_META_PIXEL_ID }),
  };
});
export const getContact = async () => (await getSiteSettings()).contact;
/** Correo que recibe los avisos comerciales (panel → Configuración; si no, SALES_NOTIFY_EMAIL). */
export const salesNotifyEmail = async () => (await getSiteSettings()).notifications.salesEmail;
