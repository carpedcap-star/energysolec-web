import 'server-only';
import { cache } from 'react';
import { getStore } from './data/store';
import { cssVars, DEFAULT_IDENTITY, DEFAULT_LOGOS, normalizeIdentity, type Identity } from './services/identity';

export type ResolvedIdentity = Identity & {
  vars: Record<string, string>;
  urls: { logo: string; logoDark: string; favicon: string };
  /** true si el logo es uno cargado en el panel (no el de public/brand). */
  custom: { logo: boolean; logoDark: boolean; favicon: boolean };
};

/** Identidad vigente (una lectura por petición). Ante cualquier fallo, la identidad por defecto: el sitio nunca queda sin marca. */
export const getIdentity = cache(async (): Promise<ResolvedIdentity> => {
  let id: Identity = DEFAULT_IDENTITY;
  let media: Record<string, { url: string }> = {};
  try {
    id = normalizeIdentity(await getStore().getSetting<unknown>('brand', null));
    const ids = [id.logo, id.logoDark, id.favicon].filter((x): x is string => !!x);
    if (ids.length) media = await getStore().resolveMedia(ids);
  } catch (e) { console.error('identidad gráfica:', e); }
  const url = (k: 'logo' | 'logoDark' | 'favicon') => (id[k] && media[id[k]!]?.url) || DEFAULT_LOGOS[k];
  return {
    ...id, vars: cssVars(id.colors),
    urls: { logo: url('logo'), logoDark: url('logoDark'), favicon: url('favicon') },
    custom: { logo: url('logo') !== DEFAULT_LOGOS.logo, logoDark: url('logoDark') !== DEFAULT_LOGOS.logoDark, favicon: url('favicon') !== DEFAULT_LOGOS.favicon },
  };
});
