import { z } from 'zod';

/**
 * Datos de contacto, avisos e integraciones que se editan en /admin/configuracion. Lógica pura y probada.
 * Claves de site_settings:
 *  - 'contact' (lectura pública por RLS): lo que ve el visitante.
 *  - 'notifications' (privada): a dónde llegan los avisos internos.
 *  - 'integrations_public' (lectura pública): IDs PÚBLICOS de analítica. Las claves secretas (Resend, WhatsApp Cloud,
 *    Turnstile, Anthropic, cron) NUNCA se guardan aquí: viven en variables de entorno del servidor.
 */

// ---------------------------------------------------------------- Contacto
export const SOCIALS = [
  { id: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.com'] },
  { id: 'instagram', label: 'Instagram', hosts: ['instagram.com'] },
  { id: 'linkedin', label: 'LinkedIn', hosts: ['linkedin.com'] },
  { id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
  { id: 'tiktok', label: 'TikTok', hosts: ['tiktok.com'] },
] as const;
export type SocialId = (typeof SOCIALS)[number]['id'];

export type Contact = {
  whatsapp: string;          // solo dígitos, con código de país (593…)
  email: string;
  phone: string | null;      // teléfono fijo, tal como se muestra
  address: string | null;
  city: string;
  hours: string | null;      // horario de atención
  mapsUrl: string | null;
  socials: Partial<Record<SocialId, string>>;
};
export type Notifications = { salesEmail: string | null };
export type Integrations = { gtm: string | null; ga4: string | null; metaPixel: string | null };

export const DEFAULT_CONTACT: Contact = {
  whatsapp: '593979655095', email: 'info@energysolec.com', phone: null, address: null, city: 'Guayaquil, Ecuador', hours: null, mapsUrl: null, socials: {},
};

/** «593979655095» → «+593 97 965 5095». Ecuador: 9 dígitos tras el 593 (móvil 9X XXX XXXX, fijo X XXX XXXX). */
export function formatWhatsapp(digits: string): string {
  const d = digits.replace(/\D/g, '');
  const m = d.match(/^593(\d{2})(\d{3})(\d{4})$/);
  return m ? `+593 ${m[1]} ${m[2]} ${m[3]}` : `+${d}`;
}

/** Acepta «0979655095», «+593 97 965 5095», «593979655095»: devuelve dígitos con 593, o null si no es válido. */
export function normalizeWhatsapp(input: string): string | null {
  let d = input.replace(/[\s()+.-]/g, '');
  if (!/^\d+$/.test(d)) return null;
  if (/^0\d{9}$/.test(d)) d = `593${d.slice(1)}`;           // formato nacional: 09X XXX XXXX
  if (d.startsWith('593')) return /^593\d{9}$/.test(d) ? d : null;
  return d.length >= 8 && d.length <= 15 ? d : null;            // otro país (E.164)
}

const str = (max: number) => z.string().trim().max(max);
const optional = (max: number) => str(max).transform((s) => s || null);
const httpsUrl = (s: string) => { try { const u = new URL(s); return u.protocol === 'https:' ? u : null; } catch { return null; } };
const hostIs = (u: URL, hosts: readonly string[]) => hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));

export const ContactSchema = z.object({
  whatsapp: z.string().transform((s, ctx) => {
    const n = normalizeWhatsapp(s);
    if (!n) ctx.addIssue({ code: 'custom', message: 'WhatsApp no válido: usa el número con código de país, p. ej. +593 97 965 5095.' });
    return n ?? '';
  }),
  email: str(160).toLowerCase().pipe(z.email('Correo de contacto no válido')),
  phone: optional(40).refine((s) => s == null || /^\+?[0-9 ()-]{7,20}$/.test(s), 'Teléfono fijo no válido'),
  address: optional(200),
  city: str(80).min(2, 'Ingresa la ciudad'),
  hours: optional(120),
  mapsUrl: optional(500).refine((s) => s == null || (httpsUrl(s) && hostIs(httpsUrl(s)!, ['google.com', 'goo.gl', 'maps.app.goo.gl'])), 'El enlace del mapa debe ser de Google Maps (https).'),
  socials: z.object(Object.fromEntries(SOCIALS.map((s) => [s.id, optional(300).refine(
    (v) => v == null || (httpsUrl(v) && hostIs(httpsUrl(v)!, s.hosts)), `El enlace de ${s.label} debe ser https://${s.hosts[0]}/…`)])) as unknown as Record<SocialId, z.ZodType<string | null>>),
});

// ---------------------------------------------------------------- Avisos
export const NotificationsSchema = z.object({
  salesEmail: optional(160).refine((s) => s == null || z.email().safeParse(s).success, 'Correo de avisos no válido').transform((s) => s?.toLowerCase() ?? null),
});

// ---------------------------------------------------------------- Integraciones (IDs públicos)
/**
 * Formatos estrictos: estos IDs se insertan en scripts del navegador (GTM, GA4, Meta Pixel), así que cualquier otro
 * carácter se rechaza (evita inyección de código desde el panel).
 */
export const ID_FORMATS = {
  gtm: { re: /^GTM-[A-Z0-9]{4,12}$/, example: 'GTM-ABC1234', label: 'Google Tag Manager' },
  ga4: { re: /^G-[A-Z0-9]{4,15}$/, example: 'G-ABCDE12345', label: 'Google Analytics 4' },
  metaPixel: { re: /^\d{8,20}$/, example: '123456789012345', label: 'Meta Pixel' },
} as const;
const idField = (k: keyof typeof ID_FORMATS) => optional(40).transform((s) => s?.toUpperCase() ?? null)
  .refine((s) => s == null || ID_FORMATS[k].re.test(s), `${ID_FORMATS[k].label}: formato esperado ${ID_FORMATS[k].example}`);
export const IntegrationsSchema = z.object({ gtm: idField('gtm'), ga4: idField('ga4'), metaPixel: idField('metaPixel') });

// ---------------------------------------------------------------- Lectura tolerante (lo guardado + valores por defecto)
export function normalizeContact(v: unknown): Contact {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const p = ContactSchema.safeParse({
    whatsapp: o.whatsapp ?? DEFAULT_CONTACT.whatsapp, email: o.email ?? DEFAULT_CONTACT.email, phone: o.phone ?? '', address: o.address ?? '',
    city: o.city ?? DEFAULT_CONTACT.city, hours: o.hours ?? '', mapsUrl: o.mapsUrl ?? '',
    socials: Object.fromEntries(SOCIALS.map((x) => [x.id, ((o.socials ?? {}) as Record<string, unknown>)[x.id] ?? ''])),
  });
  // Un valor guardado dañado nunca deja al sitio sin contacto: se vuelve a los valores por defecto.
  if (!p.success) return DEFAULT_CONTACT;
  return { ...p.data, socials: Object.fromEntries(Object.entries(p.data.socials).filter(([, v]) => v)) as Contact['socials'] };
}
export function normalizeIntegrations(v: unknown, env: Partial<Record<keyof Integrations, string | undefined>> = {}): Integrations {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const pick = (k: keyof Integrations) => {
    const r = IntegrationsSchema.shape[k].safeParse(typeof o[k] === 'string' ? o[k] : env[k] ?? '');
    return r.success ? r.data : null;
  };
  return { gtm: pick('gtm'), ga4: pick('ga4'), metaPixel: pick('metaPixel') };
}
export function normalizeNotifications(v: unknown, envSales?: string): Notifications {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const r = NotificationsSchema.safeParse({ salesEmail: typeof o.salesEmail === 'string' ? o.salesEmail : envSales ?? '' });
  return r.success ? r.data : { salesEmail: null };
}

// ---------------------------------------------------------------- Formulario
const s = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === 'string' ? v : ''; };
export function parseSettingsForm(fd: FormData): { data: { contact: Contact; notifications: Notifications; integrations: Integrations } } | { error: string } {
  const c = ContactSchema.safeParse({
    whatsapp: s(fd, 'whatsapp'), email: s(fd, 'email'), phone: s(fd, 'phone'), address: s(fd, 'address'), city: s(fd, 'city'),
    hours: s(fd, 'hours'), mapsUrl: s(fd, 'mapsUrl'), socials: Object.fromEntries(SOCIALS.map((x) => [x.id, s(fd, `social_${x.id}`)])),
  });
  if (!c.success) return { error: c.error.issues[0]?.message ?? 'Datos de contacto no válidos' };
  const n = NotificationsSchema.safeParse({ salesEmail: s(fd, 'salesEmail') });
  if (!n.success) return { error: n.error.issues[0]?.message ?? 'Correo de avisos no válido' };
  const i = IntegrationsSchema.safeParse({ gtm: s(fd, 'gtm'), ga4: s(fd, 'ga4'), metaPixel: s(fd, 'metaPixel') });
  if (!i.success) return { error: i.error.issues[0]?.message ?? 'Identificador no válido' };
  const contact = { ...c.data, socials: Object.fromEntries(Object.entries(c.data.socials).filter(([, v]) => v)) as Contact['socials'] };
  return { data: { contact, notifications: n.data, integrations: i.data } };
}
