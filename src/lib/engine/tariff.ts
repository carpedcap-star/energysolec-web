export type EnergyBlock = { from_kwh: number; to_kwh: number | null; usd_per_kwh: number };

export type Tariff = {
  id?: string;
  code: string;
  name: string;
  segment: 'residencial' | 'comercial' | 'industrial';
  voltage_level: 'BT' | 'MT' | 'AT';
  has_demand_charge: boolean;
  energy_blocks: EnergyBlock[];
  demand_usd_per_kw: number | null;
  commercialization_usd: number;
  other_charges_pct: number;
  source_note: string;
  is_placeholder: boolean;
};

export type BillBreakdown = { energy: number; demand: number; fixed: number; other: number; total: number };

/** Factura mensual para un consumo dado, con bloques crecientes. */
export function monthlyBill(t: Tariff, kwh: number, demandKw = 0): BillBreakdown {
  let energy = 0;
  for (const b of [...t.energy_blocks].sort((a, z) => a.from_kwh - z.from_kwh)) {
    const top = b.to_kwh ?? Infinity;
    const inBlock = Math.max(0, Math.min(kwh, top) - b.from_kwh);
    energy += inBlock * b.usd_per_kwh;
    if (kwh <= top) break;
  }
  const demand = t.has_demand_charge ? demandKw * (t.demand_usd_per_kw ?? 0) : 0;
  const fixed = t.commercialization_usd;
  const other = (energy + demand) * t.other_charges_pct;
  return { energy, demand, fixed, other, total: energy + demand + fixed + other };
}

/** Invierte la tarifa: kWh mensuales que producen una factura dada (calculadora rápida). */
export function kwhFromBill(t: Tariff, billUsd: number, demandKw = 0): number {
  let lo = 0, hi = 5_000_000;
  if (monthlyBill(t, 0, demandKw).total >= billUsd) return 0;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (monthlyBill(t, mid, demandKw).total < billUsd) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
