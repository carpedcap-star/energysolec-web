'use client';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { saveIdentityAction } from '../../actions';
import { checkPalette, cssVars, DEFAULT_COLORS, DEFAULT_LOGOS, normalizeHex, type BrandColors } from '@/lib/services/identity';
import { UPLOAD_LIMITS } from '@/lib/services/catalog';
import { FILE_INPUT, mb, Section } from '../form-ui';

type Slot = { id: string | null; url: string; custom: boolean };
type LogoKey = 'logo' | 'logoDark' | 'favicon';
const COLOR_FIELDS: [keyof BrandColors, string, string][] = [
  ['brand', 'Color de acción', 'Botones principales, énfasis y títulos sobre fondo oscuro.'],
  ['dark', 'Color base oscuro', 'Cabecera del panel, pie de página, secciones oscuras y botones secundarios.'],
  ['accent', 'Color de datos y enlaces', 'Enlaces, antetítulos, gráficos y cifras.'],
];
const LOGO_FIELDS: [LogoKey, string, string, string][] = [
  ['logo', 'Logo para fondos claros', 'Cabecera del sitio al hacer scroll, inicio de sesión y redes sociales.', 'bg-white'],
  ['logoDark', 'Logo para fondos oscuros', 'Portada, pie de página y panel.', 'bg-brand-dark'],
  ['favicon', 'Ícono del sitio (favicon)', 'Pestaña del navegador. PNG cuadrado, idealmente 512 × 512 px.', 'bg-surface'],
];
const HEX = /^#[0-9A-F]{6}$/;

export function IdentityForm({ colors: initial, logos }: { colors: BrandColors; logos: Record<LogoKey, Slot> }) {
  const [state, action, pending] = useActionState(saveIdentityAction, null);
  const [colors, setColors] = useState(initial);
  const [text, setText] = useState(initial);
  const [kept, setKept] = useState<Record<LogoKey, Slot>>(logos);
  const [files, setFiles] = useState<Record<LogoKey, { file: File; url: string } | null>>({ logo: null, logoDark: null, favicon: null });
  const [clientError, setClientError] = useState('');
  const errRef = useRef<HTMLParagraphElement>(null);
  const error = clientError || (pending ? '' : state?.error);
  useEffect(() => { if (error) errRef.current?.focus(); }, [error, state]);

  const checks = useMemo(() => checkPalette(colors), [colors]);
  const blocked = checks.some((c) => c.level === 'error');
  const setColor = (k: keyof BrandColors, v: string) => {
    setText((t) => ({ ...t, [k]: v }));
    const n = normalizeHex(v);
    if (HEX.test(n)) setColors((c) => ({ ...c, [k]: n }));
  };
  const reset = () => { setColors(DEFAULT_COLORS); setText(DEFAULT_COLORS); };

  function submit(fd: FormData) {
    setClientError('');
    for (const k of Object.keys(files) as LogoKey[]) if (files[k]) fd.append(`${k}_file`, files[k]!.file);
    return action(fd);
  }

  return (
    <form action={submit} className="mt-6 space-y-6" noValidate>
      <Section title="Colores" intro="El sitio verifica el contraste de cada combinación que usa. No se puede guardar una paleta ilegible.">
        <div className="grid gap-5 sm:grid-cols-3">
          {COLOR_FIELDS.map(([k, label, hint]) => (
            <div key={k} className="min-w-0">
              <label htmlFor={`c-${k}`} className="label">{label}</label>
              <div className="flex items-center gap-2">
                <input type="color" aria-label={`${label}: selector`} value={colors[k]} onChange={(e) => setColor(k, e.target.value)} className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-white p-1" />
                <input id={`c-${k}`} name={k} value={text[k]} onChange={(e) => setColor(k, e.target.value)} maxLength={7} spellCheck={false} aria-describedby={`c-${k}-h`}
                  className={`input font-mono uppercase ${HEX.test(normalizeHex(text[k])) ? '' : '!border-red-400'}`} />
              </div>
              <p id={`c-${k}-h`} className="mt-1 text-xs text-muted">{hint}</p>
            </div>
          ))}
        </div>
        <button type="button" onClick={reset} className="btn-ghost mt-4 !py-2">Restaurar colores originales</button>

        <div className="mt-6 overflow-hidden rounded-2xl border border-line" style={cssVars(colors) as React.CSSProperties} aria-label="Vista previa de la paleta">
          <div className="bg-brand-dark p-6 text-white">
            <p className="eyebrow !text-brand">Vista previa · fondo oscuro</p>
            <p className="font-display mt-2 text-2xl font-extrabold">Transformamos la energía en <span className="text-brand">oportunidades.</span></p>
            <div className="mt-4 flex flex-wrap gap-2"><span className="btn-primary pointer-events-none">Calcular mi ahorro</span><span className="btn-ghost-dark pointer-events-none">Ver soluciones</span></div>
          </div>
          <div className="bg-white p-6">
            <p className="eyebrow">Vista previa · fondo claro</p>
            <p className="mt-2 text-sm">Texto con un <span className="text-brand-accent underline underline-offset-2">enlace de ejemplo</span> y una cifra destacada: <b className="text-brand-accent">250 kWp</b>.</p>
            <span className="btn-dark pointer-events-none mt-4">Solicitar propuesta</span>
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <caption className="sr-only">Contraste de la paleta</caption>
          <thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th scope="col" className="py-2">Combinación</th><th scope="col" className="py-2 text-right">Contraste</th><th scope="col" className="py-2 text-right">Estado</th></tr></thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.label} className="border-t border-line">
                <td className="py-2 pr-2"><span className="mr-2 inline-flex h-5 w-8 items-center justify-center rounded text-[10px] font-bold" style={{ background: c.bg, color: c.fg, outline: '1px solid #e4e1dc' }}>Aa</span>{c.label}</td>
                <td className="py-2 text-right tabular-nums">{c.ratio.toFixed(2)}:1</td>
                <td className="py-2 text-right">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.level === 'ok' ? 'bg-green-100 text-green-900' : c.level === 'aviso' ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-900'}`}>
                    {c.level === 'ok' ? 'Correcto' : c.level === 'aviso' ? `Aviso: se recomienda ${c.recommended}:1` : `No permitido (mín. ${c.min}:1)`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Logos" intro={`PNG o WebP de hasta ${mb(UPLOAD_LIMITS.image)}, con fondo transparente. SVG no se acepta por seguridad.`}>
        <div className="grid gap-5 sm:grid-cols-3">
          {LOGO_FIELDS.map(([k, label, hint, bg]) => {
            const shown = files[k]?.url ?? kept[k].url;
            const custom = !!files[k] || kept[k].custom;
            return (
              <div key={k} className="min-w-0">
                <p className="label">{label}</p>
                <input type="hidden" name={`${k}_id`} value={kept[k].custom && kept[k].id ? kept[k].id! : ''} />
                <div className={`grid h-24 place-items-center rounded-xl border border-line p-3 ${bg} ${files[k] ? 'outline-dashed outline-2 outline-brand-accent' : ''}`} style={cssVars(colors) as React.CSSProperties}>
                  <img src={shown} alt={`${label}: vista previa`} className={k === 'favicon' ? 'h-12 w-12 object-contain' : 'max-h-16 max-w-full object-contain'} />
                </div>
                <p className="mt-1 text-xs text-muted">{files[k] ? `Nuevo · ${mb(files[k]!.file.size)}` : custom ? 'Cargado en el panel' : 'Original'} · {hint}</p>
                <label htmlFor={`f-${k}`} className="mt-2 block text-xs font-medium">Cargar otro</label>
                <input id={`f-${k}`} type="file" accept="image/png,image/webp" className={FILE_INPUT} onChange={(e) => {
                  const x = e.target.files?.[0]; e.target.value = '';
                  if (!x) return;
                  if (!/^image\/(png|webp)$/.test(x.type) || x.size > UPLOAD_LIMITS.image) return setClientError(`"${x.name}": usa PNG o WebP de hasta ${mb(UPLOAD_LIMITS.image)}.`);
                  setClientError(''); if (files[k]) URL.revokeObjectURL(files[k]!.url);
                  setFiles((f) => ({ ...f, [k]: { file: x, url: URL.createObjectURL(x) } }));
                }} />
                {custom && <button type="button" className="mt-2 text-xs underline" onClick={() => {
                  if (files[k]) URL.revokeObjectURL(files[k]!.url);
                  setFiles((f) => ({ ...f, [k]: null }));
                  setKept((s) => ({ ...s, [k]: { id: null, url: DEFAULT_LOGOS[k], custom: false } }));
                }}>Usar el original</button>}
              </div>
            );
          })}
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur lg:-mx-10 lg:px-10">
        {error && <p ref={errRef} tabIndex={-1} role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 outline-none">{error}</p>}
        {blocked && <p className="mb-3 text-sm text-red-700">Corrige los colores marcados como «No permitido» para poder guardar.</p>}
        <button className="btn-dark w-full sm:w-auto" disabled={pending || blocked}>{pending ? 'Guardando…' : 'Guardar y aplicar al sitio'}</button>
      </div>
    </form>
  );
}
