import { LeadForm } from '@/components/lead-form';
import { waLink } from '@/lib/site';
import { getContact } from '@/lib/site-settings';
import { SocialLinks } from '@/components/social-links';
export const metadata = { title: 'Contacto', description: 'Cotiza tu proyecto solar o solicita una asesoría con Energy Solutions Ecuador.', alternates: { canonical: '/contacto' } };
export default async function Page({ searchParams }: { searchParams: Promise<{ tema?: string }> }) {
  const { tema } = await searchParams;
  const quote = tema === 'cotizacion';
  const c = await getContact();
  return (
    <section className="pb-24 pt-32"><div className="container-site grid gap-12 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <p className="eyebrow">Contacto</p>
        <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">{quote ? 'Cotiza tu proyecto' : tema === 'asesoria' ? 'Solicita una asesoría' : 'Hablemos de tu proyecto'}</h1>
        <p className="mt-4 text-muted">Respondemos por correo y WhatsApp. Si tienes tu planilla eléctrica a mano, el análisis es más rápido.</p>
        <div className="mt-8 space-y-3 text-sm">
          <a href={waLink('Hola, quisiera una asesoría.', c.whatsapp)} className="btn bg-[#25D366] text-white" target="_blank" rel="noopener">WhatsApp {c.whatsappDisplay}</a>
          <p><a href={`mailto:${c.email}`} className="underline">{c.email}</a></p>
          {c.phone && <p>Teléfono: <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="underline">{c.phone}</a></p>}
          <p className="text-muted">{[c.address, c.city].filter(Boolean).join(' · ')}</p>
          {c.hours && <p className="text-muted">Horario: {c.hours}</p>}
          {c.mapsUrl && <p><a href={c.mapsUrl} target="_blank" rel="noopener" className="underline">Ver ubicación en el mapa</a></p>}
          <SocialLinks socials={c.socials} className="pt-2 text-ink" />
        </div>
      </div>
      <div className="card p-6 sm:p-8"><LeadForm source={quote ? 'cotizacion' : 'contacto'} topic={quote ? 'Cotización de proyecto' : tema === 'asesoria' ? 'Asesoría' : undefined} /></div>
    </div></section>
  );
}
