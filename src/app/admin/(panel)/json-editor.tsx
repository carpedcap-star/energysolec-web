'use client';
import { useActionState, useState } from 'react';
type Action = (prev: unknown, fd: FormData) => Promise<{ error?: string; ok?: boolean; version?: number }>;
/** Editor estructurado con validación en servidor (Zod). Fase 2: formularios guiados por campo. */
export function JsonEditor({ initial, action }: { initial: unknown; action: Action }) {
  const [text, setText] = useState(JSON.stringify(initial, null, 2));
  const [state, run, pending] = useActionState(action, null);
  let valid = true; try { JSON.parse(text); } catch { valid = false; }
  return (
    <form action={run} className="mt-4">
      <textarea name="json" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={Math.min(40, text.split('\n').length + 1)} className={`input font-mono text-xs ${valid ? '' : '!border-red-400'}`} />
      {state?.error && <p className="mt-2 text-sm text-red-600" role="alert">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm text-green-700" role="status">Guardado{state.version ? ` como versión ${state.version}` : ''}.</p>}
      <button className="btn-dark mt-3" disabled={pending || !valid}>{pending ? 'Guardando…' : 'Validar y guardar'}</button>
    </form>
  );
}
