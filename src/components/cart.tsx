'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type CartLine = { productId: string; slug: string; name: string; sku: string; unitPrice: number; vatRate: number; qty: number; placeholder?: boolean; tierApplied?: string; unavailable?: boolean };
export type Repricing = Record<string, { unitPrice: number; vatRate: number; tierApplied: string }>;
type Ctx = { lines: CartLine[]; add: (l: Omit<CartLine, 'qty'>, qty?: number) => void; setQty: (id: string, q: number) => void; remove: (id: string) => void; clear: () => void; reprice: (p: Repricing) => void; count: number; subtotal: number; tax: number };
const CartCtx = createContext<Ctx | null>(null);
const KEY = 'ese_cart_v1';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  useEffect(() => { try { const v = localStorage.getItem(KEY); if (v) setLines(JSON.parse(v)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch {} }, [lines]);
  const value = useMemo<Ctx>(() => {
    const live = lines.filter((l) => !l.unavailable);
    const subtotal = live.reduce((a, l) => a + l.unitPrice * l.qty, 0);
    return {
      lines, count: lines.reduce((a, l) => a + l.qty, 0), subtotal, tax: live.reduce((a, l) => a + l.unitPrice * l.qty * l.vatRate, 0),
      add: (l, qty = 1) => setLines((ls) => { const e = ls.find((x) => x.productId === l.productId); return e ? ls.map((x) => (x === e ? { ...x, qty: x.qty + qty } : x)) : [...ls, { ...l, qty }]; }),
      setQty: (id, q) => setLines((ls) => ls.map((x) => (x.productId === id ? { ...x, qty: Math.max(1, Math.min(9999, Math.round(q) || 1)) } : x))),
      remove: (id) => setLines((ls) => ls.filter((x) => x.productId !== id)),
      clear: () => setLines([]),
      // Precios vigentes del servidor (nivel de la sesión); las líneas que ya no existen quedan marcadas.
      reprice: (p) => setLines((ls) => ls.map((x) => (p[x.productId] ? { ...x, ...p[x.productId], unavailable: false } : { ...x, unavailable: true }))),
    };
  }, [lines]);
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}
export const useCart = () => { const c = useContext(CartCtx); if (!c) throw new Error('CartProvider ausente'); return c; };
