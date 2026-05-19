/**
 * Cálculo de performance de staking.
 *
 * Para cada `StakingRule` activa, calculamos:
 *  - **expectedUSD**: cuánto debería haber rendido desde `startDate` hasta hoy
 *    en USD, usando el precio actual del activo stakeado.
 *  - **actualUSD**: cuánto rindió realmente (txs kind='yield' atribuidas a esta
 *    regla mediante el tag `[rule:ID]` en notes), en USD usando el precio del
 *    activo de recompensa.
 *  - **performancePct**: actualUSD / expectedUSD × 100. >= 100 → cumplió.
 *
 * Medición desde startDate (no lastAccrualDate):
 *  `lastAccrualDate` lo usa el motor de accrual para saber DESDE cuándo acumular.
 *  Para medir performance, siempre comparamos el total acumulado desde `startDate`
 *  vs el total esperado en ese mismo período — así el porcentaje es estable y no
 *  colapsa a 0 inmediatamente después de que el accrual actualiza la fecha.
 *
 * Cross-asset:
 *  `expectedUSD` usa precio del activo stakeado (USDC ≈ $1, BTC ≈ $X).
 *  `actualUSD` usa precio del activo de recompensa (NEXO ≈ $Y).
 *  Esto permite comparar manzanas con manzanas aunque los tokens sean distintos.
 *
 * Trazabilidad de yields:
 *  Las txs creadas por el auto-accrual incluyen `[rule:ID]` en notes.
 *  Solo esas txs se atribuyen a la regla. Txs sin tag no se cuentan (evita
 *  doble conteo cuando varias reglas producen el mismo activo de recompensa).
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
  /** Asset en el que se reciben las recompensas (puede diferir del asset stakeado). */
  rewardAsset?: Asset;
  /** Yield esperado en unidades del activo STAKEADO. */
  expectedQty: number;
  /** Yield real cobrado en unidades del activo de RECOMPENSA. */
  actualQty: number;
  /** Performance USD: actualUSD / expectedUSD × 100. 0 si expected=0. */
  performancePct: number;
  /** Días desde el último accrual (o startDate si nunca corrió). */
  daysSinceLastAccrual: number;
  /** Yield esperado en USD (usa precio del activo STAKEADO). */
  expectedUSD: number;
  /** Yield real en USD (usa precio del activo de RECOMPENSA). */
  actualUSD: number;
}

export interface StakingSummary {
  totalExpectedUSD: number;
  totalActualUSD: number;
  /** Performance global = totalActualUSD / totalExpectedUSD × 100. */
  performancePct: number;
  /** Reglas con performance ≥ 90% → "rinde como esperado". */
  rulesAboveThreshold: number;
  /** Reglas activas con expected > 0 y performance < 90%. */
  rulesBelowThreshold: number;
  rules: RulePerformance[];
}

// ─── Cálculo ───────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/**
 * Calcula el yield esperado en qty del activo STAKEADO entre `from` y `to`.
 * Fórmula: qtyHeld × (APY/100) × (días/365)
 */
function expectedYieldQty(
  rule: StakingRule,
  qtyHeld: number,
  fromDate: Date,
  toDate: Date,
): number {
  const days = Math.max(0, (toDate.getTime() - fromDate.getTime()) / MS_PER_DAY);
  return qtyHeld * (rule.apyPct / 100) * (days / 365);
}

/**
 * Suma yields de una regla específica en `[from, to]`.
 *
 * Solo cuenta txs que incluyan `[rule:${ruleId}]` en notes — así distinguimos
 * yields generados por esta regla de los de otras reglas que producen el mismo
 * token de recompensa (ej. USDC→NEXO vs BTC→NEXO en la misma cuenta).
 *
 * Txs sin tag (importadas manualmente o de versiones anteriores) no se atribuyen
 * a ninguna regla específica, evitando doble conteo.
 */
function actualYieldQty(
  rule: StakingRule,
  txs: Transaction[],
  from: Date,
  to: Date,
): number {
  const ruleTag = `[rule:${rule.id}]`;
  return txs
    .filter(
      (t) =>
        t.kind === 'yield' &&
        t.accountId === rule.accountId &&
        t.portfolioId === rule.portfolioId &&
        t.notes?.includes(ruleTag),
    )
    .filter((t) => {
      const d = new Date(t.date);
      return d >= from && d <= to;
    })
    .reduce((s, t) => s + t.qty, 0);
}

/**
 * Qty corriente de un activo en un scope (asset, account, portfolio).
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
    const rewardAsset = rule.rewardAssetId
      ? assets.find((a) => a.id === rule.rewardAssetId)
      : undefined;

    // ── Ventana de medición ──────────────────────────────────────────────
    // Siempre desde startDate (no lastAccrualDate) para que la performance
    // sea estable. lastAccrualDate se usa solo para daysSinceLastAccrual.
    const measureFrom = new Date(rule.startDate.slice(0, 10));
    const endDate = rule.endDate ? new Date(rule.endDate) : now;
    const effectiveTo = endDate < now ? endDate : now;

    // Días sin acreditar — refleja cuánto tiempo pasó desde el último accrual.
    const lastAccrualOrStart = new Date(rule.lastAccrualDate ?? rule.startDate);
    const daysSinceLastAccrual = Math.max(
      0,
      (now.getTime() - lastAccrualOrStart.getTime()) / MS_PER_DAY,
    );

    // ── Expected ─────────────────────────────────────────────────────────
    const qtyHeld = qtyHeldForScope(txs, rule.assetId, rule.accountId, rule.portfolioId);
    const expectedQty = rule.active
      ? expectedYieldQty(rule, qtyHeld, measureFrom, effectiveTo)
      : 0;

    // expectedUSD: usa precio del activo STAKEADO (es el que genera el yield).
    const stakedPrice = asset?.id && prices.get(asset.id)
      ? priceInUSD(prices.get(asset.id)!, fx)
      : 0;
    const expectedUSD = expectedQty * stakedPrice;

    // ── Actual ───────────────────────────────────────────────────────────
    // Filtrado por [rule:ID] en notes → atribución exacta por regla.
    const actualQty = actualYieldQty(rule, txs, measureFrom, effectiveTo);

    // actualUSD: usa precio del activo de RECOMPENSA (lo que realmente se recibió).
    const rewardPriceAssetId = rewardAsset?.id ?? asset?.id;
    const rewardPrice = rewardPriceAssetId && prices.get(rewardPriceAssetId)
      ? priceInUSD(prices.get(rewardPriceAssetId)!, fx)
      : 0;
    const actualUSD = actualQty * rewardPrice;

    // ── Performance en USD ────────────────────────────────────────────────
    // Comparamos USD para que cross-asset (BTC → NEXO) sea significativo.
    const performancePct = expectedUSD > 0 ? (actualUSD / expectedUSD) * 100 : 0;

    return {
      rule,
      asset,
      rewardAsset,
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
    (p) => p.rule.active && p.expectedUSD > 0 && p.performancePct < 90,
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
