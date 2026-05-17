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
import { computeFIFO } from '@/lib/fifo';

// ─── Portfolio Metrics ─────────────────────────────────────────────────────

/**
 * Métricas globales de capital. Todas en USD para tener una sola unidad
 * comparable; el caller puede convertir a la moneda de display si quiere.
 */
export interface PortfolioMetrics {
  /**
   * Open cost basis: suma del costo base de los lots REMANENTES (lo que pagaste
   * por lo que todavía tenés). Baja cuando vendés (a diferencia del enfoque
   * "total dinero depositado"). Con FIFO, es el costo correcto de la posición actual.
   */
  totalInvestedUSD: number;
  /** Valor de mercado actual de los holdings, convertido a USD. */
  totalValueUSD: number;
  /** PnL total = unrealized + realized. La métrica que importa para saber cómo
   *  le fue al portfolio en toda su historia. */
  totalPnLUSD: number;
  /**
   * Ganancia/pérdida NO realizada: lo que "está en papel" en las posiciones
   * abiertas. = totalValueUSD − totalInvestedUSD.
   */
  unrealizedPnLUSD: number;
  /**
   * Ganancia/pérdida YA REALIZADA: suma de (proceeds − costBasis) de todas
   * las ventas ejecutadas. Acumulativo desde el inicio del portfolio.
   */
  realizedPnLUSD: number;
  /** Suma de tx kind='yield' valuadas a precio actual.
   *  Informativo — el yield ya está implícito en totalValueUSD / unrealizedPnL. */
  totalYieldUSD: number;
  /**
   * totalPnLUSD / totalInvestedUSD × 100. 0 cuando no hay posición abierta.
   * Mide el retorno sobre el capital actualmente desplegado.
   */
  performancePct: number;
  /** Si false, alguna tx no se pudo valuar en USD (sin snapshot ni FX). */
  hasCompleteData: boolean;
}

/**
 * Calcula PortfolioMetrics desde txs + valuación actual usando FIFO.
 *
 * Con FIFO el cálculo es más simple y correcto:
 *  - `totalInvestedUSD` = suma del costo base de los lots abiertos.
 *    Baja cuando vendés (el costo de los lots consumidos sale del invested).
 *  - `realizedPnLUSD` = ganancias/pérdidas ya cristalizadas (acumuladas).
 *  - `unrealizedPnLUSD` = ganancia en papel en las posiciones actuales.
 *  - `totalPnLUSD` = unrealized + realized (verdadero PnL histórico).
 */
export function computePortfolioMetrics(
  txs: Transaction[],
  holdings: HoldingAggregate[],
  prices: Map<string, PriceLookup>,
  fx: FxView,
): PortfolioMetrics {
  // Precio actual por asset (O(1) lookups dentro de los loops).
  const assetCurrentUSD = new Map<string, number>();
  for (const [assetId, p] of prices) {
    assetCurrentUSD.set(assetId, priceInUSD(p, fx));
  }

  // ── FIFO ──────────────────────────────────────────────────────────────────
  const { openLots, realized } = computeFIFO(txs, fx);

  // totalInvested = open cost basis (sum of remaining lot costs).
  let totalInvestedUSD = 0;
  for (const lot of openLots) {
    totalInvestedUSD += lot.remainingQty * lot.costUSDPerUnit;
  }

  // realizedPnL = acumulado de todas las ventas.
  const realizedPnLUSD = realized.reduce((s, r) => s + r.realizedPnLUSD, 0);

  // ── Yield (informativo) ───────────────────────────────────────────────────
  // Yield se valúa a PRECIO ACTUAL (no al unitPrice=0 de la tx de staking).
  // Es lo que las unidades recibidas valen HOY — la métrica que el usuario quiere.
  let totalYieldUSD = 0;
  let hasCompleteData = true;
  for (const tx of txs) {
    if (tx.kind !== 'yield') continue;
    const px = assetCurrentUSD.get(tx.assetId);
    if (px === undefined) { hasCompleteData = false; continue; }
    totalYieldUSD += tx.qty * px;
  }

  // ── Valor actual ──────────────────────────────────────────────────────────
  // sum(qty × current_price_USD) sobre holdings (que ya son los lots abiertos).
  let totalValueUSD = 0;
  for (const h of holdings) {
    const px = assetCurrentUSD.get(h.assetId);
    if (px === undefined) { hasCompleteData = false; continue; }
    totalValueUSD += h.qty * px;
  }

  // ── PnL ───────────────────────────────────────────────────────────────────
  const unrealizedPnLUSD = totalValueUSD - totalInvestedUSD;
  const totalPnLUSD = unrealizedPnLUSD + realizedPnLUSD;
  const performancePct =
    totalInvestedUSD > 0 ? (totalPnLUSD / totalInvestedUSD) * 100 : 0;

  return {
    totalInvestedUSD,
    totalValueUSD,
    totalPnLUSD,
    unrealizedPnLUSD,
    realizedPnLUSD,
    totalYieldUSD,
    performancePct,
    hasCompleteData,
  };
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
