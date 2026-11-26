import { SCHEME_PERIODS, type BillLine, type BillResult, type Block, type CrossSubsidy, type EnergyCharge, type MonthUsage, type PeriodKey, type TariffStructure, type ThirdPartyCharge } from './types';

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Costo incremental de `kwh` con bloques (cada kWh paga el precio de su bloque) y su desglose. */
export function incrementalCost(blocks: Block[], kwh: number) {
  let cost = 0;
  const parts: string[] = [];
  for (const b of [...blocks].sort((a, z) => a.fromKwh - z.fromKwh)) {
    const top = b.toKwh ?? Infinity;
    const q = Math.max(0, Math.min(kwh, top) - b.fromKwh);
    if (q > 0) { cost += q * b.usdPerKwh; parts.push(`${r4(q)} kWh × ${b.usdPerKwh}`); }
    if (kwh <= top) break;
  }
  return { cost, parts };
}

/** Cargo de energía aplicable a una franja y un mes (las estacionales se eligen por mes). */
export function energyChargeFor(s: TariffStructure, period: PeriodKey, month: number): EnergyCharge | undefined {
  const cands = s.energy.filter((e) => e.period === period);
  return cands.find((e) => e.months?.includes(month)) ?? cands.find((e) => !e.months?.length);
}

/** Factores de gestión de la demanda (pliego 4.6.5). r = DP/DM. */
export function fgd(r: number) { return r < 0.6 ? 0.6 : Math.min(1, r); }
export function fgdi(r: number) {
  if (r < 0.6) return 0.5;
  if (r <= 0.9) return 0.5833 * r + 0.4167 * r * r;
  return 1;
}
export function fgdve(dmInPeak: boolean) { return dmInPeak ? 1 : 0.6; }

/** Demanda facturable (4.6.4.1): la máxima del mes, con mínimo del 60 % de la máxima de 12 meses. */
export function billableDemand(dmKw: number, dmMax12Kw: number | undefined, minShare: number | null) {
  if (minShare == null || dmMax12Kw == null) return dmKw;
  return Math.max(dmKw, minShare * dmMax12Kw);
}

/** Factor de penalización por bajo factor de potencia (4.6.6): BFp = 0,94 / FPr − 1 si FPr < 0,94. */
export function powerFactorPenaltyFactor(pf: number, threshold = 0.94) {
  if (!(pf > 0) || pf >= threshold) return 0;
  return threshold / pf - 1;
}

export type BillOptions = {
  /** Con generación distribuida (Regulación 005/24): la demanda facturable es la máxima tomada de la red, sin mínimo del 60 %. */
  withSgda?: boolean;
  crossSubsidy?: CrossSubsidy;
  thirdParty?: ThirdPartyCharge[];
};

/**
 * Factura de un mes, por rubros (pliego 6: FSPEE = E + P + PIT + C + PBFP), más el aporte al subsidio cruzado y los
 * cargos de terceros, que se informan aparte. Nunca menor que el cargo de comercialización (4.6.1 d).
 */
export function computeBill(s: TariffStructure, u: MonthUsage, opt: BillOptions = {}): BillResult {
  const lines: BillLine[] = [];
  const warnings: string[] = [];
  const periods = SCHEME_PERIODS[s.scheme];

  // Energía por franja
  let E = 0;
  const unknown = Object.keys(u.kwhByPeriod).filter((k) => !periods.includes(k as PeriodKey));
  if (unknown.length) throw new Error(`franjas no válidas para ${s.scheme}: ${unknown.join(', ')}`);
  for (const p of periods) {
    const kwh = u.kwhByPeriod[p] ?? 0;
    if (kwh < 0) throw new Error(`consumo negativo en ${p}`);
    if (kwh === 0) continue;
    const ch = energyChargeFor(s, p, u.month);
    if (!ch) throw new Error(`la tarifa no tiene cargo de energía para ${p} en el mes ${u.month}`);
    const { cost, parts } = incrementalCost(ch.blocks, kwh);
    E += cost;
    lines.push({ code: 'energia', label: `Energía (${p === 'unico' ? 'mes' : p})`, amount: r2(cost), detail: parts.join(' + '), reducibleByPv: 'si' });
  }
  if (s.scheme !== 'UNICO' && periods.some((p) => u.kwhByPeriod[p] == null))
    warnings.push('Faltan kWh de alguna franja horaria: esa franja se facturó en cero. La planilla o una curva de carga dan el dato.');

  // Demanda
  let P = 0, df = 0;
  if (s.demand) {
    if (u.demandKw == null) warnings.push('Tarifa con demanda sin dato de demanda máxima: el cargo por demanda quedó en cero.');
    else {
      df = billableDemand(u.demandKw, opt.withSgda ? undefined : u.dmMax12Kw, opt.withSgda ? null : s.demand.minShareOfMax12);
      let f = 1, fLabel = '';
      if (s.demand.factor === 'FGD' || s.demand.factor === 'FGDI') {
        if (u.peakDemandKw == null || !(u.demandKw > 0)) {
          warnings.push(`Sin demanda en punta (18:00–22:00) no se puede calcular el ${s.demand.factor}: se usó 1,0 (lo más conservador).`);
        } else {
          const r = Math.min(1, u.peakDemandKw / u.demandKw);
          f = s.demand.factor === 'FGD' ? fgd(r) : fgdi(r);
          fLabel = ` × ${s.demand.factor} ${r4(f)} (DP/DM ${r4(r)})`;
        }
      } else if (s.demand.factor === 'FGDVE') {
        if (u.dmInPeak == null) warnings.push('Sin saber si la demanda máxima ocurrió en punta, el FGDVE se tomó como 1,0.');
        f = fgdve(u.dmInPeak ?? true);
        fLabel = ` × FGDVE ${f}`;
      }
      P = df * s.demand.usdPerKwMonth * f;
      lines.push({ code: 'demanda', label: 'Demanda facturable', amount: r2(P), detail: `${r4(df)} kW × ${s.demand.usdPerKwMonth} USD/kW${fLabel}`, reducibleByPv: 'condicional' });
    }
  }

  // Pérdidas en transformador (4.4): 2 % de los montos de potencia y energía si un MV se mide en BV.
  let PIT = 0;
  if (u.measuredInLowVoltage) {
    PIT = 0.02 * (E + P);
    lines.push({ code: 'perdidas_transformador', label: 'Pérdidas en transformador (2 %)', amount: r2(PIT), detail: '2 % de energía y potencia', reducibleByPv: 'condicional' });
  }

  const C = s.commercialization.usdPerMonth;
  lines.push({ code: 'comercializacion', label: 'Comercialización', amount: r2(C), detail: 'cargo fijo por consumidor', reducibleByPv: 'no' });

  // Penalización por bajo factor de potencia (4.6.6): PBFP = BFp × FSPEE inicial.
  let PBFP = 0;
  if (s.powerFactor && u.powerFactor != null) {
    const bfp = powerFactorPenaltyFactor(u.powerFactor, s.powerFactor.threshold);
    if (bfp > 0) {
      PBFP = bfp * (E + P + PIT + C);
      lines.push({ code: 'penalizacion_fp', label: 'Penalización por bajo factor de potencia', amount: r2(PBFP), detail: `FP ${u.powerFactor} → BFp ${r4(bfp)}`, reducibleByPv: 'condicional' });
      if (u.powerFactor < 0.6) warnings.push('Factor de potencia menor a 0,60: la distribuidora puede suspender el servicio hasta que se corrija.');
    }
  }

  let spee = E + P + PIT + C + PBFP;

  // Subsidio cruzado residencial: aporta quien supera el umbral (Anexo 2). Lo que reciben los de bajo consumo depende
  // de la recaudación mensual de cada distribuidora y no se puede estimar: no se descuenta.
  const cs = opt.crossSubsidy;
  if (cs) {
    const kwh = Object.values(u.kwhByPeriod).reduce((a, b) => a + (b ?? 0), 0);
    if (kwh > cs.contributesAboveKwh) {
      const amt = cs.contributionShare * spee;
      spee += amt;
      lines.push({ code: 'subsidio_cruzado', label: 'Aporte al subsidio cruzado', amount: r2(amt), detail: `${cs.contributionShare * 100} % (consumo > ${cs.contributesAboveKwh} kWh)`, reducibleByPv: 'condicional', provisional: cs.status !== 'validada' });
    }
  }

  spee = Math.max(spee, C);

  let thirdParty = 0;
  for (const t of opt.thirdParty ?? []) {
    const kwh = Object.values(u.kwhByPeriod).reduce((a, b) => a + (b ?? 0), 0);
    const amt = t.method === 'fijo' ? t.value : t.method === 'por_kwh' ? t.value * kwh : t.value * spee;
    thirdParty += amt;
    lines.push({ code: 'tercero', label: t.name, amount: r2(amt), detail: `${t.method} ${t.value}`, reducibleByPv: t.reducibleByPv ? 'condicional' : 'no', provisional: t.status !== 'validada' });
  }
  if ((opt.thirdParty ?? []).some((t) => t.status !== 'validada')) warnings.push('Incluye cargos de terceros provisionales (alumbrado, bomberos, basura): dependen del municipio.');

  return { lines, spee: r2(spee), thirdParty: r2(thirdParty), total: r2(spee + thirdParty), billableDemandKw: r4(df), warnings };
}

/** Mayor de los cargos de energía horarios del mes (T_m de la Regulación 005/24, Anexo E). */
export function maxEnergyCharge(s: TariffStructure, month: number) {
  return Math.max(...SCHEME_PERIODS[s.scheme].map((p) => energyChargeFor(s, p, month)?.blocks[0]?.usdPerKwh ?? 0));
}
