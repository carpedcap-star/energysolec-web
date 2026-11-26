import { z } from 'zod';
import type { Stat } from '../data/types';

/**
 * Indicadores de portada (regla de negocio 2: solo se publican verificados y con fuente).
 * Validación pura: devuelve un mensaje en español en lugar de lanzar, para que el panel lo muestre junto a la fila.
 */
const StatSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(2, 'Escribe el nombre del indicador.').max(60, 'El nombre del indicador admite hasta 60 caracteres.'),
  value: z.number({ message: 'El valor debe ser un número.' }).finite('El valor debe ser un número.').min(0, 'El valor no puede ser negativo.'),
  unit: z.string().trim().max(20, 'La unidad admite hasta 20 caracteres.').nullable(),
  source_note: z.string().trim().min(5, 'Indica la fuente del dato (al menos 5 caracteres).').max(300, 'La fuente admite hasta 300 caracteres.'),
  verified: z.boolean(),
  sort: z.number().int(),
});

/** Una fuente que todavía dice «pendiente» no respalda nada: no se puede publicar como verificada. */
const PLACEHOLDER_SOURCE = /pendiente|por definir|provisional|xxx/i;

export function parseStatForm(fd: FormData): { data: Stat } | { error: string } {
  const raw = String(fd.get('value') ?? '').trim().replace(',', '.');
  const p = StatSchema.safeParse({
    id: String(fd.get('id') ?? ''),
    label: String(fd.get('label') ?? ''),
    value: raw === '' ? NaN : Number(raw),
    unit: String(fd.get('unit') ?? '').trim() || null,
    source_note: String(fd.get('source_note') ?? ''),
    verified: fd.get('verified') === 'on',
    sort: Number(fd.get('sort') ?? 0),
  });
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Datos no válidos.' };
  if (p.data.verified && PLACEHOLDER_SOURCE.test(p.data.source_note))
    return { error: 'Para marcarlo como verificado, reemplaza «pendiente» por la fuente real del dato (documento, registro o informe).' };
  if (p.data.verified && p.data.value === 0)
    return { error: 'Un indicador verificado no puede valer 0: ingresa el dato real o desmarca «Verificado».' };
  return { data: p.data };
}
