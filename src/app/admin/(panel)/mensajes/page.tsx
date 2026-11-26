import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { salesNotifyEmail } from '@/lib/site-settings';
import type { OutboundMessage } from '@/lib/data/types';
import { fmtEc, summaryText } from '@/lib/services/followup';
import { requeueMessageAction } from '../../actions';
import { RunJobsButton } from './run-button';

export const metadata: Metadata = { title: 'Mensajes y tareas', description: 'Cola de correos y tareas programadas', robots: { index: false } };

const STATUS: Record<OutboundMessage['status'], [string, string]> = {
  pendiente: ['En cola', 'bg-amber-100 text-amber-900'], enviado: ['Enviado', 'bg-green-100 text-green-900'],
  error: ['Error', 'bg-red-100 text-red-900'], bloqueado_sin_consentimiento: ['Sin consentimiento', 'bg-surface text-muted'],
};
const FILTERS: [string, string][] = [['', 'Todos'], ['pendiente', 'En cola'], ['error', 'Con error'], ['enviado', 'Enviados'], ['bloqueado_sin_consentimiento', 'Sin consentimiento']];

export default async function Page({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  await requireStaff('messages');
  const { estado = '' } = await searchParams;
  const store = getStore();
  const status = FILTERS.some(([v]) => v === estado) && estado ? (estado as OutboundMessage['status']) : undefined;
  const [stats, runs, msgs] = await Promise.all([store.messageStats(), store.listCronRuns(10), store.listMessages({ status, limit: 100 })]);
  const config: [string, boolean, string][] = [
    ['Proveedor de correo (RESEND_API_KEY)', !!process.env.RESEND_API_KEY, 'Sin él, los correos quedan en cola hasta configurarlo (los de seguimiento vencen en 20 h; el resto, en 3 días).'],
    ['Clave de tareas programadas (CRON_SECRET)', (process.env.CRON_SECRET?.length ?? 0) >= 16, 'Sin ella, /api/cron no corre; usa el botón de esta página.'],
    ['Correo de avisos comerciales', !!(await salesNotifyEmail()), 'Configúralo en «Configuración»: recibe avisos de leads nuevos y recordatorios de leads sin asesor.'],
  ];
  return (
    <div>
      <h1 className="text-2xl font-bold">Mensajes y tareas</h1>
      <p className="mt-1 text-sm text-muted">Los correos que fallan se reintentan solos (5 min, 30 min, 2 h y 12 h). Cada mañana se envía a cada asesor su resumen de seguimiento y se borran las planillas sin lead de más de 7 días.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([['En cola', stats.pendiente], ['Con error', stats.error], ['Enviados (7 días)', stats.sent7d], ['Sin consentimiento', stats.bloqueado_sin_consentimiento]] as [string, number][]).map(([k, v]) => (
          <div key={k} className="card p-4"><p className="text-xs uppercase tracking-wider text-muted">{k}</p><p className="font-display mt-1 text-2xl font-bold tabular-nums">{v}</p></div>
        ))}
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="card space-y-4 p-5">
          <h2 className="font-semibold">Configuración</h2>
          <ul className="space-y-3 text-sm">{config.map(([k, ok, hint]) => (
            <li key={k} className="flex gap-3"><span aria-hidden className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ok ? 'bg-green-600' : 'bg-amber-500'}`} /><span><b>{k}</b>: {ok ? 'configurado' : 'falta'}{!ok && <span className="block text-muted">{hint}</span>}</span></li>
          ))}</ul>
          <RunJobsButton />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">Últimas ejecuciones</h2>
          <div className="card relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Ejecuciones de tareas programadas</caption>
              <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted"><tr>{['Inicio', 'Origen', 'Resultado'].map((h) => <th key={h} scope="col" className="px-4 py-2">{h}</th>)}</tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-4 py-2">{fmtEc(r.started_at)}</td>
                    <td className="px-4 py-2">{r.trigger === 'cron' ? 'Programada' : 'Panel'}</td>
                    <td className="px-4 py-2"><span className={r.ok === false ? 'text-red-700' : r.ok == null ? 'text-muted' : ''}>{r.ok == null ? 'En curso o interrumpida' : summaryText(r.summary)}</span>{r.error && <span className="block text-xs text-red-700">{r.error}</span>}</td>
                  </tr>
                ))}
                {!runs.length && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted">Aún no se ha ejecutado ninguna tarea.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <h2 className="mt-10 font-semibold">Correos</h2>
      <nav className="mt-3 flex flex-wrap gap-2" aria-label="Filtrar por estado">
        {FILTERS.map(([v, l]) => <Link key={v} href={v ? `/admin/mensajes?estado=${v}` : '/admin/mensajes'} aria-current={estado === v ? 'page' : undefined} className={`rounded-full border px-3 py-1 text-sm ${estado === v ? 'border-brand-dark bg-brand-dark text-white' : 'border-line bg-white'}`}>{l}</Link>)}
      </nav>
      <div className="card relative mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">Correos de la cola</caption>
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted"><tr>{['Fecha', 'Destinatario', 'Asunto', 'Estado', 'Intentos', ''].map((h, i) => <th key={i} scope="col" className="px-4 py-2">{h}</th>)}</tr></thead>
          <tbody>
            {msgs.map((m) => (
              <tr key={m.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-4 py-2">{fmtEc(m.created_at)}</td>
                <td className="px-4 py-2 [overflow-wrap:anywhere]">{m.to_address}</td>
                <td className="px-4 py-2">{m.payload.subject || m.template}<span className="block text-xs text-muted">{m.template}</span></td>
                <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[m.status][1]}`}>{STATUS[m.status][0]}</span>
                  {m.status === 'pendiente' && (process.env.RESEND_API_KEY
                    ? m.next_attempt_at && <span className="block text-xs text-muted">Próximo intento: {fmtEc(m.next_attempt_at, { timeStyle: 'short', dateStyle: 'short' })}</span>
                    : <span className="block text-xs text-muted">Se enviará cuando se configure el proveedor de correo.</span>)}
                  {m.error && m.status !== 'enviado' && !(m.status === 'pendiente' && !process.env.RESEND_API_KEY) && <span className="block max-w-xs text-xs text-muted [overflow-wrap:anywhere]">{m.error}</span>}</td>
                <td className="px-4 py-2 tabular-nums">{m.attempts}</td>
                <td className="px-4 py-2">{m.status === 'error' && m.payload.has_body && <form action={requeueMessageAction.bind(null, m.id)}><button className="text-sm font-semibold underline">Reintentar</button></form>}</td>
              </tr>
            ))}
            {!msgs.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No hay correos {estado ? 'con ese estado' : 'registrados'}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
