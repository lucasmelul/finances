/**
 * Cálculo de performance de staking.
 *
 * Para cada `StakingRule` activa, calculamos:
 *  - **expected**: cuánto debería haber rendido entre `startDate` (o
 *    `lastAccrualDate`) y hoy según `apyPct` + `payoutFrequency`.
 *  - **actual**: suma de tx `kind='yield'` del mismo `(asset, account, portfolio)`
 *    en el período.
 *  - **performancePct**: actual / expected × 100. >= 100 → cumplió.
 *
 * Diseño:
 *  - Funciones puras + hook reactivo.
 *  - NO ejecuta accruals automáticos (eso es Phase 2 — necesita un scheduler
 *    cliente que respete tab-visibility). Por ahora solo MIDE el rendimiento.
 *  - Si `lastAccrualDate` está vacío, usamos `startDate` como base.
 *  - Si la regla está inactiva, mostramos 0/0 (último período).
 */

import type {
  Asset,
  PriceCache,
  StakingRule,
  Transaction,
} from '@/lib/types';
import {
  priceInUSD,
  type FxView,
  type PriceLookup,
} from '@/lib/holdings';

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface RulePerformance {
  rule: StakingRule;
  asset?: Asset;
  /** Yield esperado en moneda nativa del asset. */
  expectedQty: number;
  /** Yield real cobrado (qty acumulada de tx kind='yield'). */
  actualQty: number;
  /** Performance: actual/expected * 100. 0 si expected=0. */
  performancePct: number;
  /** Días transcurridos desde el último accrual (o startDate). */
  daysSinceLastAccrual: number;
  /** Yield esperado convertido a USD usando precio actual del asset. */
  expectedUSD: number;
  actualUSD: number;
}

export interface StakingSummary {
  totalExpectedUSD: number;
  totalActualUSD: number;
  /** Performance global = actual/expected × 100. */
  performancePct: number;
  /** Reglas con performance > 90% → "rinde como esperado". */
  rulesAboveThreshold: number;
  /** Reglas con performance < 90% → "rinde menos de lo esperado". */
  rulesBelowThreshold: number;
  rules: RulePerformance[];
}

// ─── Cálculo ───────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/**
 * Calcula el yield esperado de UNA regla entre `from` y `to`.
 *
 * Modelo simple: APY anual continuo. Para frequencies daily/weekly/monthly
 * el APY se prorratea linealmente — es la aproximación que usan la mayoría
 * de plataformas (Binance, Lemon).
 *
 * Yield esperado en QTY = qtyHeld × (APY/100) × (días/365)
 *
 * `qtyHeld` se asume constante (la qty actual del scope). Phase 2 mejora:
 * promediar qtyHeld a lo largo del período usando snapshots de tx.
 */
function expectedYieldQty(
  rule: StakingRule,
  qtyHeld: number,
  fromDate: Date,
  toDate: Date,
): number {
  const days = Math.max(0, (toDate.getTime() - fromDate.getTime()) / MS_PER_DAY);
  const apyDecimal = rule.apyPct / 100;
  return qtyHeld * apyDecimal * (days / 365);
}

/**
 * Suma actual yields para una regla en el rango `[from, to]`.
 */
function actualYieldQty(
  rule: StakingRule,
  txs: Transaction[],
  from: Date,
  to: Date,
): number {
  return txs
    .filter(
      (t) =>
        t.kind === 'yield' &&
        t.assetId === rule.assetId &&
        t.accountId === rule.accountId &&
        t.portfolioId === rule.portfolioId,
    )
    .filter((t) => {
      const d = new Date(t.date);
      return d >= from && d <= to;
    })
    .reduce((s, t) => s + t.qty, 0);
}

/**
 * Helper: qty de un asset en un (asset, account, portfolio) scope sumando
 * todas las txs históricas. No es el FIFO real — es para staking que
 * necesita saber sobre qué cantidad calcula el APY.
 */
function qtyHeldForScope(
  txs: Transaction[],
  assetId: string,
  accountId: string,
  portfolioId: string,
): number {
  let qty = 0;
  for (const t of txs) {
    if (t.assetId !== assetId) continue;
    if (t.accountId !== accountId) continue;
    if (t.portfolioId !== portfolioId) continue;
    if (t.kind === 'buy' || t.kind === 'transfer_in' || t.kind === 'yield') {
      qty += t.qty;
    } else if (t.kind === 'sell' || t.kind === 'transfer_out' || t.kind === 'fee') {
      qty -= t.qty;
    }
  }
  return Math.max(0, qty);
}

// ─── Resumen completo ──────────────────────────────────────────────────────

export function computeStakingSummary({
  rules,
  txs,
  assets,
  prices,
  fx,
  now = new Date(),
}: {
  rules: StakingRule[];
  txs: Transaction[];
  assets: Asset[];
  prices: Map<string, PriceLookup>;
  fx: FxView;
  now?: Date;
}): StakingSummary {
  const perfs: RulePerformance[] = rules.map((rule) => {
    const asset = assets.find((a) => a.id === rule.assetId);
    const lastAccrualOrStart = new Date(rule.lastAccrualDate ?? rule.startDate);
    const endDate = rule.endDate ? new Date(rule.endDate) : now;
    const effectiveTo = endDate < now ? endDate : now;
    const daysSinceLastAccrual = Math.max(
      0,
      (now.getTime() - lastAccrualOrStart.getTime()) / MS_PER_DAY,
    );

    const qtyHeld = qtyHeldForScope(txs, rule.assetId, rule.accountId, rule.portfolioId);
    const expectedQty = rule.active
      ? expectedYieldQty(rule, qtyHeld, lastAccrualOrStart, effectiveTo)
      : 0;
    const actualQty = actualYieldQty(rule, txs, lastAccrualOrStart, effectiveTo);

    const usdPrice = asset && prices.get(asset.id)
      ? priceInUSD(prices.get(asset.id)!, fx)
      : 0;
    const expectedUSD = expectedQty * usdPrice;
    const actualUSD = actualQty * usdPrice;
    const performancePct =
      expectedQty > 0 ? (actualQty / expectedQty) * 100 : 0;

    return {
      rule,
      asset,
      expectedQty,
      actualQty,
      performancePct,
      daysSinceLastAccrual,
      expectedUSD,
      actualUSD,
    };
  });

  const totalExpectedUSD = perfs.reduce((s, p) => s + p.expectedUSD, 0);
  const totalActualUSD = perfs.reduce((s, p) => s + p.actualUSD, 0);
  const performancePct =
    totalExpectedUSD > 0 ? (totalActualUSD / totalExpectedUSD) * 100 : 0;
  const rulesAboveThreshold = perfs.filter(
    (p) => p.rule.active && p.performancePct >= 90,
  ).length;
  const rulesBelowThreshold = perfs.filter(
    (p) => p.rule.active && p.expectedQty > 0 && p.performancePct < 90,
  ).length;

  return {
    totalExpectedUSD,
    totalActualUSD,
    performancePct,
    rulesAboveThreshold,
    rulesBelowThreshold,
    rules: perfs,
  };
}

// Re-export utilitarios usados por `Pollers`/etc, evita "value not used".
export type { PriceCache };
