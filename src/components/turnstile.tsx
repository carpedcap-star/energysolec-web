'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TurnstileAction } from '@/lib/turnstile';

/**
 * Widget de Cloudflare Turnstile en modo «solo si hace falta interacción»: normalmente es invisible y solo
 * aparece un desafío cuando Cloudflare duda. Cada envío pide un token NUEVO con `getToken()` (son de un solo uso),
 * así un reintento o varios archivos subidos en el mismo formulario funcionan. Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * no carga nada y `getToken()` devuelve undefined.
 */

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
export const TURNSTILE_ERROR = 'No pudimos comprobar que el envío lo hace una persona. Recarga la página e inténtalo de nuevo.';
let loader: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loader ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC; s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile no disponible')));
    s.onerror = () => { loader = null; s.remove(); reject(new Error('no cargó el script de Turnstile')); };
    document.head.appendChild(s);
  });
  return loader;
}

type Pending = { resolve: (t: string) => void; reject: (e: Error) => void };

export function useTurnstile(action: TurnstileAction, opts: { theme?: 'light' | 'dark' } = {}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  // Ref por estado: el widget se crea cuando su contenedor aparece (p. ej. un paso posterior del formulario).
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  const pending = useRef<Pending | null>(null);
  const theme = opts.theme ?? 'light';

  useEffect(() => {
    if (!siteKey || !box) return;
    let alive = true;
    const settle = (fn: (p: Pending) => void) => { const p = pending.current; pending.current = null; if (p) fn(p); };
    loadTurnstile().then((ts) => {
      if (!alive) return;
      widget.current = ts.render(box, {
        sitekey: siteKey, action, theme, language: 'es', size: 'flexible',
        execution: 'execute', appearance: 'interaction-only', 'refresh-expired': 'manual', 'response-field': false,
        callback: (token: string) => settle((p) => p.resolve(token)),
        // Devolver true marca el error como atendido (Turnstile no lo repite en la consola).
        'error-callback': (code: string) => { settle((p) => p.reject(new Error(`turnstile ${code}`))); return true; },
        'timeout-callback': () => settle((p) => p.reject(new Error('turnstile: desafío sin resolver'))),
      });
    }).catch(() => { /* getToken() lo informa al enviar */ });
    return () => {
      alive = false;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
      pending.current?.reject(new Error('formulario cerrado')); pending.current = null;
    };
  }, [siteKey, action, theme, box]);

  /** Token nuevo para un envío. Rechaza si Turnstile no carga o el desafío falla. */
  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!siteKey) return undefined;
    const ts = await loadTurnstile();
    for (let i = 0; !widget.current && i < 50; i++) await new Promise((r) => setTimeout(r, 100));
    const id = widget.current;
    if (!id) throw new Error('turnstile: el widget no se inició');
    return new Promise<string>((resolve, reject) => {
      pending.current?.reject(new Error('reemplazado por un envío nuevo'));
      const timer = setTimeout(() => { if (pending.current?.resolve === done) { pending.current = null; reject(new Error('turnstile: sin respuesta')); } }, 120_000);
      function done(t: string) { clearTimeout(timer); resolve(t); }
      pending.current = { resolve: done, reject: (e) => { clearTimeout(timer); reject(e); } };
      ts.reset(id);
      ts.execute(id);
    });
  }, [siteKey]);

  const slot = siteKey ? <div ref={setBox} className="min-w-0 empty:hidden" data-turnstile={action} /> : null;
  return { getToken, slot };
}
