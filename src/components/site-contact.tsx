'use client';
import { createContext, useContext } from 'react';

/** Contacto público de la empresa (panel → Configuración) para componentes de cliente. Lo provee el layout. */
export type PublicContact = { whatsapp: string; whatsappDisplay: string; email: string };
const Ctx = createContext<PublicContact | null>(null);
export function SiteContactProvider({ value, children }: { value: PublicContact; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useSiteContact(): PublicContact {
  const c = useContext(Ctx);
  if (!c) throw new Error('SiteContactProvider ausente');
  return c;
}
