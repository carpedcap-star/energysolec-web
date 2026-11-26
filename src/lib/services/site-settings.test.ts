import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTACT, formatWhatsapp, normalizeContact, normalizeIntegrations, normalizeNotifications, normalizeWhatsapp, parseSettingsForm } from './site-settings';

const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
const valid = { whatsapp: '+593 97 965 5095', email: 'Info@EnergySolEc.com', city: 'Guayaquil, Ecuador' };

describe('WhatsApp', () => {
  it('acepta formatos nacional, internacional y con espacios', () => {
    expect(normalizeWhatsapp('0979655095')).toBe('593979655095');
    expect(normalizeWhatsapp('+593 97 965 5095')).toBe('593979655095');
    expect(normalizeWhatsapp('(593) 97-965-5095')).toBe('593979655095');
    expect(normalizeWhatsapp('+1 305 555 0100')).toBe('13055550100');
  });
  it('rechaza números incompletos o con letras', () => {
    expect(normalizeWhatsapp('59397965509')).toBeNull();
    expect(normalizeWhatsapp('097965509x')).toBeNull();
    expect(normalizeWhatsapp('123')).toBeNull();
  });
  it('formato para mostrar', () => {
    expect(formatWhatsapp('593979655095')).toBe('+593 97 965 5095');
    expect(formatWhatsapp('13055550100')).toBe('+13055550100');
  });
});

describe('formulario', () => {
  it('normaliza y guarda solo las redes indicadas', () => {
    const r = parseSettingsForm(form({ ...valid, social_instagram: 'https://www.instagram.com/energysolec', salesEmail: 'Ventas@EnergySolEc.com' }));
    if ('error' in r) throw new Error(r.error);
    expect(r.data.contact).toMatchObject({ whatsapp: '593979655095', email: 'info@energysolec.com', phone: null, socials: { instagram: 'https://www.instagram.com/energysolec' } });
    expect(r.data.notifications.salesEmail).toBe('ventas@energysolec.com');
    expect(r.data.integrations).toEqual({ gtm: null, ga4: null, metaPixel: null });
  });
  it('las redes deben ser https y del dominio correcto', () => {
    expect(parseSettingsForm(form({ ...valid, social_facebook: 'http://facebook.com/x' }))).toEqual({ error: 'El enlace de Facebook debe ser https://facebook.com/…' });
    expect(parseSettingsForm(form({ ...valid, social_facebook: 'https://facebook.com.evil.example/x' }))).toHaveProperty('error');
    expect(parseSettingsForm(form({ ...valid, social_linkedin: 'javascript:alert(1)' }))).toHaveProperty('error');
    expect(parseSettingsForm(form({ ...valid, mapsUrl: 'https://maps.app.goo.gl/abc' }))).not.toHaveProperty('error');
  });
  it('IDs de analítica: formato estricto (van dentro de scripts)', () => {
    const ok = parseSettingsForm(form({ ...valid, gtm: 'gtm-abc1234', ga4: 'G-ABCDE12345', metaPixel: '123456789012345' }));
    if ('error' in ok) throw new Error(ok.error);
    expect(ok.data.integrations).toEqual({ gtm: 'GTM-ABC1234', ga4: 'G-ABCDE12345', metaPixel: '123456789012345' });
    expect(parseSettingsForm(form({ ...valid, gtm: "GTM-X');alert(1);//" }))).toEqual({ error: 'Google Tag Manager: formato esperado GTM-ABC1234' });
    expect(parseSettingsForm(form({ ...valid, metaPixel: '12ab' }))).toHaveProperty('error');
  });
  it('exige WhatsApp, correo y ciudad válidos', () => {
    expect(parseSettingsForm(form({ ...valid, whatsapp: '12' }))).toHaveProperty('error');
    expect(parseSettingsForm(form({ ...valid, email: 'no-es-correo' }))).toEqual({ error: 'Correo de contacto no válido' });
    expect(parseSettingsForm(form({ ...valid, city: '' }))).toEqual({ error: 'Ingresa la ciudad' });
  });
});

describe('lectura tolerante', () => {
  it('sin valor guardado o con valor dañado usa los valores por defecto', () => {
    expect(normalizeContact(null)).toEqual(DEFAULT_CONTACT);
    expect(normalizeContact({ whatsapp: 'xx', email: 'yy' })).toEqual(DEFAULT_CONTACT);
    expect(normalizeContact({ whatsapp: '593991112222', city: 'Quito', socials: { tiktok: 'https://www.tiktok.com/@ese' } })).toMatchObject({ whatsapp: '593991112222', city: 'Quito', socials: { tiktok: 'https://www.tiktok.com/@ese' } });
  });
  it('IDs: lo guardado manda; si no hay, la variable de entorno; un ID inválido se ignora', () => {
    expect(normalizeIntegrations({ ga4: 'G-SAVED1234' }, { ga4: 'G-ENV12345', gtm: 'GTM-ENV1234' })).toEqual({ ga4: 'G-SAVED1234', gtm: 'GTM-ENV1234', metaPixel: null });
    expect(normalizeIntegrations({ gtm: '<script>' })).toEqual({ gtm: null, ga4: null, metaPixel: null });
    expect(normalizeIntegrations({ gtm: '' }, { gtm: 'GTM-ENV1234' }).gtm).toBeNull();
  });
  it('correo de avisos: guardado o variable de entorno', () => {
    expect(normalizeNotifications(null, 'ventas@x.ec').salesEmail).toBe('ventas@x.ec');
    expect(normalizeNotifications({ salesEmail: 'otro@x.ec' }, 'ventas@x.ec').salesEmail).toBe('otro@x.ec');
    expect(normalizeNotifications({ salesEmail: '' }, 'ventas@x.ec').salesEmail).toBeNull();
  });
});
