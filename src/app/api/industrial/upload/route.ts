import { getStore } from '@/lib/data/store';
import { guard, json, verifyHuman } from '@/lib/request';
import { TURNSTILE_ACTIONS } from '@/lib/turnstile';
import { checkIndustrialDoc, DOC_MAX_BYTES, safeFilename } from '@/lib/services/industrial';

export const runtime = 'nodejs';

/**
 * Sube UN documento de una cotización industrial (≤ 4 MB) al almacenamiento privado. Queda sin solicitud hasta que el
 * visitante envía el formulario; si no lo envía, la tarea diaria lo borra. Exige la aceptación de privacidad previa.
 */
export async function POST(req: Request) {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > DOC_MAX_BYTES + 256 * 1024) return json({ error: 'El archivo supera 4 MB.' }, 413);
  if (!(await guard('industrial_upload', 20, 3600))) return json({ error: 'Alcanzaste el máximo de archivos por hora.' }, 429);
  const fd = await req.formData().catch(() => null);
  if (!fd) return json({ error: 'Solicitud no válida.' }, 400);
  if (!(await verifyHuman(String(fd.get('turnstileToken') ?? '') || undefined, String(fd.get('website') ?? '') || undefined, TURNSTILE_ACTIONS.industrialDoc)))
    return json({ error: 'No pudimos verificar el envío. Recarga la página.' }, 400);
  if (fd.get('consent') !== 'on') return json({ error: 'Acepta la política de privacidad antes de adjuntar documentos.' }, 400);
  const file = fd.get('file');
  if (!(file instanceof File)) return json({ error: 'Selecciona un archivo.' }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const t = checkIndustrialDoc(bytes, file.name);
  if (typeof t === 'string') return json({ error: t }, 400);
  const filename = safeFilename(file.name, t.ext);
  try {
    const id = await getStore().saveIndustrialDoc({ bytes, mime: t.mime, ext: t.ext, filename });
    return json({ id, filename, size: bytes.length, type: t.label });
  } catch (e) {
    console.error('[industrial] no se pudo guardar el documento', e);
    return json({ error: 'No pudimos guardar el archivo. Inténtalo de nuevo.' }, 500);
  }
}
