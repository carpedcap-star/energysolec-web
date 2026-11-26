'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { BILL_CONSENT_TEXT } from '@/lib/services/bill-consent';
import type { BillCalcInput } from '@/lib/services/bill';
import { track } from '../consent';
import { TURNSTILE_ERROR, useTurnstile } from '@/components/turnstile';
import { TURNSTILE_ACTIONS } from '@/lib/turnstile';

export type BillRead = {
  distributor: string | null; tariffCategory: string | null; billingPeriod: string | null; energyKwh: number | null;
  electricityUsd: number | null; totalUsd: number | null; demandKw: number | null; months: number;
};
export type BillResult = { uploadId: string; proposal: BillCalcInput; read: BillRead };

const MAX_BYTES = 4 * 1024 * 1024;

/** Reduce fotos grandes en el navegador (máx. 2000 px, JPEG): las fotos de celular superan con facilidad el límite. */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || (file.size <= 1.5 * 1024 * 1024 && file.type !== 'image/heic')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return out ?? file;
  } catch { return file; }
}

const num = (n: number | null, unit: string) => (n == null ? '—' : `${n.toLocaleString('es-EC')} ${unit}`);

export function BillUpload({ mode, result, onRead, onDiscard }: { mode: string; result: BillResult | null; onRead: (r: BillResult) => void; onDiscard: () => void }) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const human = useTurnstile(TURNSTILE_ACTIONS.bill);

  async function read() {
    if (!file) return setErr('Selecciona el archivo de tu planilla.');
    if (!consent) return setErr('Para leer tu planilla necesitamos tu autorización.');
    setBusy(true); setErr('');
    const blob = await shrinkImage(file);
    if (blob.size > MAX_BYTES) { setBusy(false); return setErr('El archivo supera el máximo de 4 MB. Si es un PDF escaneado, súbelo como foto.'); }
    const turnstileToken = await human.getToken().catch(() => null);
    if (turnstileToken === null) { setBusy(false); return setErr(TURNSTILE_ERROR); }
    const fd = new FormData();
    if (turnstileToken) fd.set('turnstileToken', turnstileToken);
    fd.set('file', blob, file.name); fd.set('consent', 'on'); fd.set('mode', mode); fd.set('website', '');
    track('bill_upload', { mode });
    const r = await fetch('/api/bill', { method: 'POST', body: fd }).catch(() => null);
    setBusy(false);
    const j = await r?.json().catch(() => null);
    if (!r?.ok || !j?.uploadId) return setErr(j?.error ?? 'No pudimos leer tu planilla. Ingresa tus datos manualmente.');
    setFile(null);
    onRead(j as BillResult);
  }

  if (result) {
    const r = result.read;
    return (
      <div className="rounded-2xl border border-brand-accent/40 bg-sky-50 p-5 text-sm" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">Leímos tu planilla{r.billingPeriod ? ` de ${r.billingPeriod}` : ''}</p>
            <p className="mt-1 text-muted">Completamos los campos de abajo con estos datos. <b className="text-ink">Revísalos y corrígelos</b> antes de continuar: la lectura automática puede equivocarse.</p>
          </div>
          <button type="button" onClick={onDiscard} className="btn-ghost !px-3 !py-1.5 text-xs">Descartar planilla</button>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {([
            ['Distribuidora', r.distributor ?? '—'], ['Tarifa', r.tariffCategory ?? '—'], ['Consumo del mes', num(r.energyKwh, 'kWh')],
            ['Servicio eléctrico', r.electricityUsd == null ? '—' : `$${r.electricityUsd.toLocaleString('es-EC')}`],
            ['Total a pagar', r.totalUsd == null ? '—' : `$${r.totalUsd.toLocaleString('es-EC')}`],
            ['Demanda', num(r.demandKw, 'kW')], ['Meses de historial', String(r.months)],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex min-w-0 justify-between gap-3 border-b border-line/70 pb-1"><dt className="text-muted">{k}</dt><dd className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{v}</dd></div>
          ))}
        </dl>
        {result.proposal.warnings.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-amber-900">{result.proposal.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-line p-5 text-sm">
      <p className="font-semibold">¿Tienes tu planilla eléctrica a mano?</p>
      <p className="mt-1 text-muted">Súbela en PDF o como foto y la leemos por ti. Después podrás revisar y corregir cada dato.</p>
      <div className="mt-4">
        <label className="label" htmlFor={`${id}-f`}>Planilla (PDF, JPG, PNG o WebP; máx. 4 MB)</label>
        <input id={`${id}-f`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(''); }}
          className="block w-full max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-dark file:px-3 file:py-2 file:text-white" />
      </div>
      <label className="mt-4 flex items-start gap-2 text-muted">
        <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErr(''); }} className="mt-1" />
        <span>{BILL_CONSENT_TEXT} Ver la <Link href="/privacidad" target="_blank" className="underline">política de privacidad</Link>.</span>
      </label>
      {human.slot && <div className="mt-3">{human.slot}</div>}
      {err && <p className="mt-3 text-red-600" role="alert">{err}</p>}
      <button type="button" onClick={read} disabled={busy} className="btn-dark mt-4 !py-2">{busy ? 'Leyendo tu planilla… puede tardar hasta un minuto' : 'Leer mi planilla'}</button>
      <p className="mt-3 text-xs text-muted">Si prefieres, ingresa los datos manualmente abajo.</p>
    </div>
  );
}
