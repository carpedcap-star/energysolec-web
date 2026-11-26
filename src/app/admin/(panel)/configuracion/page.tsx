import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { getSiteSettings } from '@/lib/site-settings';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Contacto e integraciones', description: 'Datos de contacto, avisos e integraciones', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Integraciones con claves secretas: solo variables de entorno del servidor; aquí se informa si están configuradas. */
const SERVER_INTEGRATIONS: [string, string[], string][] = [
  ['Base de datos (Supabase)', ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'], 'Sin ella, el sitio usa el archivo local de desarrollo.'],
  ['Correo transaccional (Resend)', ['RESEND_API_KEY'], 'Sin él, los correos quedan en cola.'],
  ['WhatsApp Business Cloud API', ['WHATSAPP_CLOUD_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'], 'Sin ella, los pedidos usan el enlace wa.me.'],
  ['Protección anti-spam (Turnstile)', ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'], 'Sin ella, los formularios solo tienen el campo trampa y el límite por IP. Necesita las dos claves.'],
  ['Lectura de planillas con IA (Anthropic)', ['ANTHROPIC_API_KEY'], 'Sin ella, la calculadora no ofrece subir planilla.'],
  ['Tareas programadas', ['CRON_SECRET'], 'Sin ella, las tareas diarias no corren solas.'],
];

export default async function Page({ searchParams }: { searchParams: Promise<{ guardado?: string }> }) {
  await requireStaff('settings');
  const { contact, notifications, integrations } = await getSiteSettings();
  const saved = (await searchParams).guardado === '1';
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold">Contacto e integraciones</h1>
      <p className="mt-1 text-sm text-muted">Los cambios se aplican en todo el sitio al guardar.</p>
      {saved && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Cambios guardados y publicados.</p>}
      <SettingsForm contact={contact} notifications={notifications} integrations={integrations} whatsappDisplay={contact.whatsappDisplay} />
      <section className="card mt-6 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Integraciones del servidor</h2>
        <p className="mt-1 text-sm text-muted">Usan claves secretas: se configuran en las variables de entorno del alojamiento (Vercel), nunca en el panel. Aquí solo se ve si están activas.</p>
        <ul className="mt-4 divide-y divide-line text-sm">
          {SERVER_INTEGRATIONS.map(([name, vars, hint]) => {
            const ok = vars.every((v) => !!process.env[v]?.trim());
            const partial = !ok && vars.some((v) => !!process.env[v]?.trim());
            return (
              <li key={name} className="flex gap-3 py-3">
                <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ok ? 'bg-green-600' : partial ? 'bg-red-600' : 'bg-amber-500'}`} />
                <span className="min-w-0"><b>{name}</b>: {ok ? 'activa' : partial ? 'INCOMPLETA (falta una variable; se ignora hasta completarla)' : 'no configurada'}
                  <span className="block text-xs text-muted [overflow-wrap:anywhere]">{ok ? vars.join(', ') : `${hint} Variables: ${vars.join(', ')}.`}</span></span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
