'use client';
import { useId, useState, useTransition } from 'react';
import type { Stat } from '@/lib/data/types';
import { saveStatAction } from '../../actions';

/** Una fila editable. Envío manual: si hay un error, lo escrito se conserva y el mensaje aparece en la fila. */
export function StatRow({ stat }: { stat: Stat }) {
  const id = useId();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    start(async () => {
      const r = await saveStatAction(fd);
      setMsg('error' in r ? { ok: false, text: r.error } : { ok: true, text: r.published ? 'Guardado y publicado en la portada.' : 'Guardado (no se publica hasta marcarlo como verificado).' });
    });
  }
  return (
    <form onSubmit={onSubmit} className="card grid items-end gap-3 p-4 sm:grid-cols-[1.4fr_.8fr_.6fr_1.6fr_auto_auto]" aria-label={`Indicador ${stat.label}`}>
      <input type="hidden" name="id" value={stat.id} /><input type="hidden" name="sort" value={stat.sort} />
      <div className="min-w-0"><label htmlFor={`${id}-l`} className="text-xs text-muted">Indicador</label><input id={`${id}-l`} name="label" defaultValue={stat.label} className="input mt-1" /></div>
      <div className="min-w-0"><label htmlFor={`${id}-v`} className="text-xs text-muted">Valor</label><input id={`${id}-v`} name="value" inputMode="decimal" defaultValue={String(stat.value)} className="input mt-1" /></div>
      <div className="min-w-0"><label htmlFor={`${id}-u`} className="text-xs text-muted">Unidad</label><input id={`${id}-u`} name="unit" defaultValue={stat.unit ?? ''} className="input mt-1" /></div>
      <div className="min-w-0"><label htmlFor={`${id}-s`} className="text-xs text-muted">Fuente del dato</label><input id={`${id}-s`} name="source_note" defaultValue={stat.source_note} className="input mt-1" /></div>
      <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="verified" defaultChecked={stat.verified} /> Verificado</label>
      <button className="btn-dark !py-2" disabled={pending}>{pending ? 'Guardando…' : 'Guardar'}</button>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm sm:col-span-6 ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
    </form>
  );
}
