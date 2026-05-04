/**
 * Capa de métricas globales DERIVADAS del estado del portfolio.
 *
 * Diseño:
 *  - Funciones puras que reciben transactions + holdings + prices + fx.
 *  - Nada se persiste — todo se recomputa con `useMemo` aguas arriba.
 *  - No tocan ni un campo del modelo core (Transaction/Asset/Account/Portfolio).
 *
 * Las métricas que vivien acá:
 *  - PortfolioMetrics (capital invertido / valor / PnL / yield)  ← este archivo
 *  - LiquidityMetrics (capital ocioso)                            ← este archivo
 *  - RiskMetrics (exposición / concentración)                     ← este archivo
 *
 * Razón de tenerlas juntas: comparten dependencias (txs/holdings/prices/fx) y
 * la mayoría de pantallas las consume juntas. Si crecen demasiado las parto.
 */

import type {
  Asset,
  Currency,
  StakingRule,
  Transaction,
  TxKind,
} from '@/lib/types';
import {
  convertUSD,
  priceInUSD,
  type FxView,
  type HoldingAggregate,
  type PriceLookup,
} from '@/lib/holdings';

// ─── Portfolio Metrics ─────────────────────────────────────────────────────

/**
 * Métricas globales de capital. Todas en USD para tener una sola unidad
 * comparable; el caller puede convertir a la moneda de display si quiere.
 */
export interface PortfolioMetrics {
  /** Capital neto aportado: compras + transfers in - transfers out. NO incluye yields. */
  totalInvestedUSD: number;
  /** Valor de mercado actual de los holdings, ya convertido a USD. */
  totalValueUSD: number;
  /** PnL = valor actual - capital invertido. Incluye yields como ganancia "implícita"
   *  porque elevan `totalValueUSD` sin elevar el `totalInvestedUSD`. */
  totalPnLUSD: number;
  /** Suma de tx kind='yield' valuadas a precio actual. Métrica de información,
   *  no se resta del PnL — es PnL "limpio" del staking/dividendos. */
  totalYieldUSD: number;
  /** PnL / invested. 0 cuando no hay capital invertido (evita NaN). */
  performancePct: number;
  /** Si false, hay tx que no se pudieron valuar (sin fxSnapshot ni FX actual disponible).
   *  Útil para mostrar un disclaimer de "estimación parcial". */
  hasCompleteData: boolean;
}

/**
 * Calcula PortfolioMetrics desde txs + valuación actual.
 *
 * Estrategia para el costo en USD por tx (orden de prioridad):
 *  1. Si la tx ya está en USD/USDT, usar `unitPrice` directo.
 *  2. Si está en ARS y tiene `fxSnapshot.ccl`, usar el snapshot (preserva
 *     historia — clave para que el costo no "respire" cuando el CCL cambie).
 *  3. Si está en ARS sin snapshot, usar el FX actual como fallback. Marcar
 *     `hasCompleteData = false` para que la UI lo señalice.
 *  4. Otras monedas (EUR/BTC) → 0 + flag false. No queremos inventar datos.
 */
export function computePortfolioMetrics(
  txs: Transaction[],
  holdings: HoldingAggregate[],
  prices: Map<string, PriceLookup>,
  fx: FxView,
): PortfolioMetrics {
  let totalInvestedUSD = 0;
  let totalYieldUSD = 0;
  let hasCompleteData = true;

  // Pricing snapshot por asset para no buscar dentro del loop de yield.
  const assetCurrentUSD = new Map<string, number>();
  for (const [assetId, p] of prices) {
    assetCurrentUSD.set(assetId, priceInUSD(p, fx));
  }

  for (const tx of txs) {
    const usd = txAmountUSD(tx, fx);
    if (usd === null) {
      hasCompleteData = false;
      continue;
    }

    if (tx.kind === 'buy' || tx.kind === 'transfer_in') {
      totalInvestedUSD += usd;
    } else if (tx.kind === 'transfer_out') {
      // Una transfer-out reduce el capital "afuera" (movimos plata fuera del
      // sistema). Si la modelamos restando del invested, da el "capital neto".
      totalInvestedUSD -= usd;
    } else if (tx.kind === 'yield') {
      // Yield se valúa a PRECIO ACTUAL, no al unitPrice de la tx (que suele
      // ser 0 en yields de staking). Es lo que la posición vale HOY gracias
      // al rendimiento — la métrica que el usuario quiere ver.
      const currentPriceUSD = assetCurrentUSD.get(tx.assetId);
      if (currentPriceUSD === undefined) {
        hasCompleteData = false;
        continue;
      }
      totalYieldUSD += tx.qty * currentPriceUSD;
    }
    // sell, fee, fx, adjustment no afectan invested ni yield
    // (sell solo libera el capital invertido — sigue siendo `invested`).
  }

  // Valor actual del portfolio: sum(qty × current_price_USD).
  let totalValueUSD = 0;
  for (const h of holdings) {
    const px = assetCurrentUSD.get(h.assetId);
    if (px === undefined) {
      hasCompleteData = false;
      continue;
    }
    totalValueUSD += h.qty * px;
  }

  const totalPnLUSD = totalValueUSD - totalInvestedUSD;
  const performancePct =
    totalInvestedUSD > 0 ? (totalPnLUSD / totalInvestedUSD) * 100 : 0;

  return {
    totalInvestedUSD,
    totalValueUSD,
    totalPnLUSD,
    totalYieldUSD,
    performancePct,
    hasCompleteData,
  };
}

/**
 * Convierte el monto absoluto de UNA tx a USD (qty × unitPrice). Usa el
 * `fxSnapshot` de la tx si existe (preserva el FX histórico), o el FX
 * actual como fallback. Devuelve `null` si no se puede valuar.
 */
function txAmountUSD(tx: Transaction, fallbackFx: FxView): number | null {
  if (tx.kind === 'yield') {
    // Yield se valúa con `unitPrice = 0` y la qty solo añade unidades —
    // su monto en USD lo calcula el caller con el precio actual.
    return 0;
  }
  if (tx.priceCurrency === 'USD' || tx.priceCurrency === 'USDT') {
    return tx.qty * tx.unitPrice;
  }
  if (tx.priceCurrency === 'ARS') {
    const ccl = tx.fxSnapshot?.ccl ?? fallbackFx.ccl;
    if (!ccl) return null;
    return (tx.qty * tx.unitPrice) / ccl;
  }
  // EUR/BTC sin tasa de conversión confiable → no inventamos.
  return null;
}

// ─── Liquidity Metrics ─────────────────────────────────────────────────────

export interface LiquidityMetrics {
  /** Valor en USD de los holdings considerados "ociosos" (cash + stables sin staking). */
  idleCashUSD: number;
  /** % del portfolio que es idle. 0 si totalValueUSD es 0. */
  idlePct: number;
  /** Inverso de idle — "puesto a producir". */
  deployedPct: number;
  /** Detalle: tickers idle con su valor (para listar en UI). */
  breakdown: Array<{ assetId: string; ticker: string; valueUSD: number; reason: 'cash' | 'stable-no-stake' }>;
}

/** Tickers que consideramos stablecoins por default. Configurable en el futuro. */
const STABLECOIN_TICKERS = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD']);

export function computeLiquidityMetrics(
  holdings: HoldingAggregate[],
  assets: Asset[],
  prices: Map<string, PriceLookup>,
  fx: FxView,
  totalValueUSD: number,
  stakingRules: StakingRule[] = [],
): LiquidityMetrics {
  // Set de assetIds con staking activo — un activo se considera "puesto a producir"
  // si tiene al menos UNA regla activa, sin importar la cuenta/portfolio.
  const stakedAssetIds = new Set(
    stakingRules.filter((r) => r.active).map((r) => r.assetId),
  );

  let idleCashUSD = 0;
  const breakdown: LiquidityMetrics['breakdown'] = [];

  // Agregar holdings por asset para no contar el mismo asset múltiples veces.
  const byAsset = new Map<string, number>();
  for (const h of holdings) {
    byAsset.set(h.assetId, (byAsset.get(h.assetId) ?? 0) + h.qty);
  }

  for (const [assetId, qty] of byAsset) {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) continue;
    const priceEntry = prices.get(assetId);
    if (!priceEntry) continue;
    const usdPrice = priceInUSD(priceEntry, fx);
    const valueUSD = qty * usdPrice;
    if (valueUSD <= 0) continue;

    const isCash = asset.type === 'cash';
    const isStable =
      asset.type === 'crypto' && STABLECOIN_TICKERS.has(asset.ticker.toUpperCase());

    if (isCash) {
      idleCashUSD += valueUSD;
      breakdown.push({ assetId, ticker: asset.ticker, valueUSD, reason: 'cash' });
    } else if (isStable && !stakedAssetIds.has(assetId)) {
      idleCashUSD += valueUSD;
      breakdown.push({ assetId, ticker: asset.ticker, valueUSD, reason: 'stable-no-stake' });
    }
  }

  const idlePct = totalValueUSD > 0 ? (idleCashUSD / totalValueUSD) * 100 : 0;
  const deployedPct = 100 - idlePct;
  // Ordenar breakdown por valor descendente — los más relevantes primero.
  breakdown.sort((a, b) => b.valueUSD - a.valueUSD);

  return { idleCashUSD, idlePct, deployedPct, breakdown };
}

// ─── Risk Metrics ──────────────────────────────────────────────────────────

export interface RiskMetrics {
  /** % del portfolio en cripto NO stable (BTC, ETH, SOL, etc.). */
  cryptoExposurePct: number;
  /** % en stablecoins (USDT, USDC, DAI...). */
  stableExposurePct: number;
  /** % en acciones / ETF / CEDEAR. */
  equityExposurePct: number;
  /** % en bonos. */
  bondExposurePct: number;
  /** % en cash + fondos ARS. */
  cashExposurePct: number;
  /** Concentración top-1 (el activo más grande). */
  concentrationTop1Pct: number;
  /** Concentración top-3. */
  concentrationTop3Pct: number;
  /** Ticker del activo más grande. Útil para titulares en UI. */
  largestAssetTicker?: string;
  largestAssetPct: number;
  /** Lista ordenada (descendente) por valor en USD. Para drilling. */
  ranking: Array<{ assetId: string; ticker: string; valueUSD: number; pct: number }>;
}

export function computeRiskMetrics(
  holdings: HoldingAggregate[],
  assets: Asset[],
  prices: Map<string, PriceLookup>,
  fx: FxView,
): RiskMetrics {
  // 1. Sum por asset para que un mismo activo en varios buckets/cuentas
  //    cuente UNA sola vez en exposure / ranking.
  const byAsset = new Map<string, { qty: number; type: Asset['type']; ticker: string }>();
  for (const h of holdings) {
    const existing = byAsset.get(h.assetId);
    if (existing) {
      existing.qty += h.qty;
    } else {
      const a = assets.find((x) => x.id === h.assetId);
      if (!a) continue;
      byAsset.set(h.assetId, { qty: h.qty, type: a.type, ticker: a.ticker });
    }
  }

  // 2. Convertir a USD.
  type Row = { assetId: string; ticker: string; type: Asset['type']; valueUSD: number };
  const rows: Row[] = [];
  for (const [assetId, info] of byAsset) {
    const p = prices.get(assetId);
    if (!p) continue;
    const valueUSD = info.qty * priceInUSD(p, fx);
    if (valueUSD > 0) {
      rows.push({ assetId, ticker: info.ticker, type: info.type, valueUSD });
    }
  }
  rows.sort((a, b) => b.valueUSD - a.valueUSD);

  const total = rows.reduce((s, r) => s + r.valueUSD, 0);

  // 3. Buckets de exposición por tipo (con regla especial para stablecoins).
  let crypto = 0;
  let stable = 0;
  let equity = 0;
  let bond = 0;
  let cash = 0;
  for (const r of rows) {
    const isStable =
      r.type === 'crypto' && STABLECOIN_TICKERS.has(r.ticker.toUpperCase());
    if (isStable) stable += r.valueUSD;
    else if (r.type === 'crypto') crypto += r.valueUSD;
    else if (r.type === 'stock' || r.type === 'etf' || r.type === 'cedear')
      equity += r.valueUSD;
    else if (r.type === 'bono') bond += r.valueUSD;
    else if (r.type === 'cash' || r.type === 'fondo') cash += r.valueUSD;
  }
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  // 4. Concentración: top1 y top3 sobre el total.
  const ranking = rows.map((r) => ({ ...r, pct: pct(r.valueUSD) }));
  const top1 = rows[0];
  const top3Sum = rows.slice(0, 3).reduce((s, r) => s + r.valueUSD, 0);

  return {
    cryptoExposurePct: pct(crypto),
    stableExposurePct: pct(stable),
    equityExposurePct: pct(equity),
    bondExposurePct: pct(bond),
    cashExposurePct: pct(cash),
    concentrationTop1Pct: top1 ? pct(top1.valueUSD) : 0,
    concentrationTop3Pct: pct(top3Sum),
    largestAssetTicker: top1?.ticker,
    largestAssetPct: top1 ? pct(top1.valueUSD) : 0,
    ranking: ranking.map((r) => ({
      assetId: r.assetId,
      ticker: r.ticker,
      valueUSD: r.valueUSD,
      pct: r.pct,
    })),
  };
}

// ─── Helpers de display ────────────────────────────────────────────────────

/** Convierte una métrica USD a la moneda de display elegida por el usuario. */
export function metricToDisplay(usd: number, displayCurrency: Currency, fx: FxView): number {
  return convertUSD(usd, displayCurrency, fx);
}

/** Convierte una `TxKind` a un signo informativo para impacto en `invested`. */
export function txInvestedImpact(kind: TxKind): -1 | 0 | 1 {
  if (kind === 'buy' || kind === 'transfer_in') return 1;
  if (kind === 'transfer_out') return -1;
  return 0;
}
