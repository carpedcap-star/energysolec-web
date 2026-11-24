import 'server-only';
import { cache } from 'react';
import { getStore } from './data/store';
import type { MediaRef } from './data/types';
import { blockMediaIds, findBlock, mergeWithFallback, type BlockData } from '@/content/blocks';

/** Bloque listo para una página pública: siempre completo (texto base campo a campo) y con imágenes resueltas. */
export type Block = {
  text(key: string): string;
  list(key: string): string[];
  items(key: string): Record<string, string>[];
  image(key: string): MediaRef | null;
  /** Provisional: no hay versión publicada o se publicó marcada como provisional. */
  isPlaceholder: boolean;
};

// Una consulta por página y petición, compartida por todos sus bloques.
const publishedFor = cache((page: string) => getStore().getPublishedBlocks(page));

export async function getBlock(page: string, slot: string): Promise<Block> {
  const def = findBlock(page, slot);
  if (!def) throw new Error(`Bloque de contenido no registrado: ${page}.${slot}`);
  let row = null;
  try { row = (await publishedFor(page)).find((r) => r.slot === slot) ?? null; }
  catch (e) { console.error(`content_blocks ${page}.${slot}:`, e); } // si la base falla, la página sigue con el texto base
  const data: BlockData = mergeWithFallback(def, row?.data);
  const ids = blockMediaIds(def, data);
  const media = ids.length ? await getStore().resolveMedia(ids).catch(() => ({} as Record<string, MediaRef>)) : {};
  return {
    text: (k) => (typeof data[k] === 'string' ? (data[k] as string) : ''),
    list: (k) => (Array.isArray(data[k]) ? (data[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []),
    items: (k) => (Array.isArray(data[k]) ? (data[k] as unknown[]).filter((x): x is Record<string, string> => !!x && typeof x === 'object') : []),
    image: (k) => (typeof data[k] === 'string' ? media[data[k] as string] ?? null : null),
    isPlaceholder: row ? row.is_placeholder : true,
  };
}
