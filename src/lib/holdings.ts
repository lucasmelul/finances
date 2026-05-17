/**
 * Cálculo de holdings (posición agregada) desde transactions.
 *
 * SPEC §3.4: la posición de cada `(asset, account, portfolio)` se deriva
 * desde las transacciones usando FIFO — no se persiste como tabla.
 *
 * Phase 2: reemplazamos el promedio corriente por el motor FIFO de `fifo.ts`.
 * El DCA (avgCostUSD) ahora refleja el costo promedio de los lots REMANENTES,
 * no de todos los lots históricos. Esto da el costo base correcto cuando el
 * usuario vendió parte de su posición.
 */

import type { Asset, Currency, Transaction } from '@/lib/types';
import { computeFIFO } from '@/lib/fifo';

// ─── DCA (Dollar-Cost Average) ─────────────────────────────────────────────

/**
 * Resumen del DCA de un activo, derivado de los lots REMANENTES (FIFO).
 *
 * Cuando todas las compras fueron en la misma moneda nativa, devolvemos
 * también el DCA en esa moneda (más legible para el caso típico CEDEAR=ARS).
 */
export interface DCAResult {
  /** Cantidad total en los lots remanentes (posición actual). */
  qtyBought: number;
  /** Costo total de los lots remanentes en USD (open cost basis). */
  totalCostUSD: number;
  /** DCA = totalCostUSD / qtyBought, en USD. 0 si no hay posición. */
  dcaUSD: number;
  /** DCA en moneda nativa, si todos los lots remanentes de tipo buy/transfer_in comparten moneda. */
  dcaNative?: { value: number; currency: Currency };
  /** Cantidad de transacciones buy+transfer_in+yield históricas (solo informativo). */
  txCount: number;
}

/**
 * Calcula el DCA de UN asset usando los lots REMANENTES de `computeFIFO`.
 * Después de una venta parcial, refleja el costo promedio de lo que el usuario
 * AÚN tiene, no de todo lo que compró históricamente.
 *
 * - Los lots de yield tienen costUSDPerUnit = 0, así que no suman al costo
 *   pero sí diluyen el DCA (qty sin costo — intencional).
 * - `txCount` cuenta buy+transfer_in+yield históricos (para display).
 *
 * Si llamás con todas las txs del usuario, filtrá por `assetId` antes —
 * no quiero acoplar este helper a la búsqueda.
 */
export function computeDCA(
  txsForAsset: Transaction[],
  fx: FxView,
): DCAResult {
  const { openLots } = computeFIFO(txsForAsset, fx);

  // Mapa txId → Transaction para lookup del precio nativo original.
  const txById = new Map<string, Transaction>();
  for (const tx of txsForAsset) txById.set(tx.id, tx);

  let qtyBought = 0;
  let totalCostUSD = 0;
  let nativeCurrency: Currency | 'mixed' | undefined;
  let nativeCostSum = 0;
  let nativeQtySum = 0;

  for (const lot of openLots) {
    qtyBought += lot.remainingQty;
    totalCostUSD += lot.remainingQty * lot.costUSDPerUnit;

    // DCA nativo: solo los lots de buy/transfer_in tienen precio nativo
    // significativo; los de yield tienen costo 0 y no hay moneda nativa útil.
    const origTx = txById.get(lot.txId);
    if (origTx && (origTx.kind === 'buy' || origTx.kind === 'transfer_in')) {
      if (nativeCurrency === undefined) {
        nativeCurrency = origTx.priceCurrency;
        nativeCostSum = origTx.unitPrice * lot.remainingQty;
        nativeQtySum = lot.remainingQty;
      } else if (nativeCurrency === origTx.priceCurrency) {
        nativeCostSum += origTx.unitPrice * lot.remainingQty;
        nativeQtySum += lot.remainingQty;
      } else {
        nativeCurrency = 'mixed';
      }
    }
  }

  // txCount: solo informativo — cuántas txs de compra/yield existieron históricamente.
  const txCount = txsForAsset.filter(
    (tx) => tx.kind === 'buy' || tx.kind === 'transfer_in' || tx.kind === 'yield',
  ).length;

  const dcaUSD = qtyBought > 0 ? totalCostUSD / qtyBought : 0;
  const dcaNative =
    nativeCurrency && nativeCurrency !== 'mixed' && nativeQtySum > 0
      ? { value: nativeCostSum / nativeQtySum, currency: nativeCurrency }
      : undefined;

  return { qtyBought, totalCostUSD, dcaUSD, dcaNative, txCount };
}

// ─── Aggregates ────────────────────────────────────────────────────────────

export interface HoldingAggregate {
  assetId: string;
  accountId: string;
  portfolioId: string;
  qty: number;
  /** Costo promedio en USD. */
  avgCostUSD: number;
  /** Costo total invertido en USD (qty * avgCostUSD, salvo redondeo). */
  totalCostUSD: number;
}

/** Snapshot mínimo del FX que necesitamos para convertir ARS→USD. */
export interface FxView {
  ccl: number;
  mep?: number;
  blue?: number;
  oficial?: number;
}


/**
 * Reduce una lista de transactions a holdings agregados por scope usando FIFO.
 *
 * Cada holding refleja el costo base de los LOTS REMANENTES (los que no
 * fueron consumidos por ventas o transfers_out). Esto significa que:
 *  - `avgCostUSD` es el DCA de lo que realmente tenés hoy (no de todo lo
 *    que compraste históricamente).
 *  - `totalCostUSD` = open cost basis = cuánto pagaste por la posición actual.
 *
 * Yield entra a costo 0: su lot no contribuye al costo base pero sí a la qty,
 * lo que dilata el DCA hacia abajo (refleja la "ganancia limpia" del staking).
 */
export function computeHoldings(
  transactions: Transaction[],
  fx: FxView,
): HoldingAggregate[] {
  const { openLots } = computeFIFO(transactions, fx);

  // Agregar lots por scope → HoldingAggregate.
  const map = new Map<string, HoldingAggregate>();
  for (const lot of openLots) {
    const key = `${lot.assetId}|${lot.accountId}|${lot.portfolioId}`;
    const h = map.get(key);
    if (!h) {
      map.set(key, {
        assetId: lot.assetId,
        accountId: lot.accountId,
        portfolioId: lot.portfolioId,
        qty: lot.remainingQty,
        totalCostUSD: lot.remainingQty * lot.costUSDPerUnit,
        avgCostUSD: lot.costUSDPerUnit,
      });
    } else {
      h.qty += lot.remainingQty;
      h.totalCostUSD += lot.remainingQty * lot.costUSDPerUnit;
      h.avgCostUSD = h.qty > 0 ? h.totalCostUSD / h.qty : 0;
    }
  }

  return [...map.values()].filter((h) => h.qty > 0);
}

// ─── Valuation ─────────────────────────────────────────────────────────────

export interface PriceLookup {
  /** Precio en moneda nativa del activo. */
  price: number;
  currency: Currency;
}

/**
 * Convierte el precio nativo del activo a USD usando FX si hace falta. Solo
 * conversión simple ARS→USD (CCL) por ahora; cripto y EUR pasan directo.
 */
export function priceInUSD(price: PriceLookup, fx: FxView): number {
  switch (price.currency) {
    case 'USD':
    case 'USDT':
      return price.price;
    case 'ARS':
      return price.price / fx.ccl;
    case 'BTC':
      // BTC como moneda de cotización — el FX.btc del seed sirve si hace
      // falta, pero no tenemos ese campo en FxView. Devolver el precio raw.
      return price.price;
    case 'EUR':
      // Sin tasa EUR→USD a mano, devolver raw — el caller debería pasar EUR
      // en un FxView extendido cuando agreguemos forex.
      return price.price;
    default:
      return price.price;
  }
}

/** Convierte USD a la moneda de display usando FX. */
export function convertUSD(usd: number, target: Currency, fx: FxView): number {
  if (target === 'USD' || target === 'USDT') return usd;
  if (target === 'ARS') return usd * fx.ccl;
  // EUR / BTC sin tasa → devolver USD para no romper UI.
  return usd;
}

// ─── View-model builders (helpers para los screens) ────────────────────────

/**
 * Junta holdings + assets + price cache para producir las filas del top de
 * Inicio / Holdings de Carteras. Retorna lista ordenada por valor descendente.
 */
export function buildAssetRowVMs(
  holdings: HoldingAggregate[],
  assets: Asset[],
  prices: Map<string, PriceLookup & { ch24Pct?: number; spark?: number[] }>,
  fx: FxView,
  displayCurrency: Currency,
): Array<{
  assetId: string;
  qty: number;
  valueDisplay: number;
  valueUSD: number;
  costUSD: number;
  /** DCA en USD (avgCost ponderado entre holdings de este asset). */
  dcaUSD: number;
  /** Δ% del precio actual vs DCA. null si no hay costo. */
  dcaDeltaPct: number | null;
  ch24Pct: number | null;
  spark: number[];
  asset: Asset;
}> {
  // Agrupar por assetId (sumamos cross-account/portfolio para Inicio).
  const byAsset = new Map<string, { qty: number; costUSD: number }>();
  for (const h of holdings) {
    const cur = byAsset.get(h.assetId) ?? { qty: 0, costUSD: 0 };
    cur.qty += h.qty;
    cur.costUSD += h.totalCostUSD;
    byAsset.set(h.assetId, cur);
  }

  const rows = [];
  for (const [assetId, agg] of byAsset) {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) continue;
    const priceEntry = prices.get(assetId);
    const usdPrice = priceEntry ? priceInUSD(priceEntry, fx) : 0;
    const valueUSD = agg.qty * usdPrice;
    // DCA = costo / cantidad. Por construcción de holdings esto es el avg
    // ponderado de los lotes que quedan vivos (no consumidos por sells).
    const dcaUSD = agg.qty > 0 ? agg.costUSD / agg.qty : 0;
    const dcaDeltaPct =
      dcaUSD > 0 && usdPrice > 0 ? ((usdPrice - dcaUSD) / dcaUSD) * 100 : null;
    rows.push({
      assetId,
      qty: agg.qty,
      valueUSD,
      costUSD: agg.costUSD,
      dcaUSD,
      dcaDeltaPct,
      valueDisplay: convertUSD(valueUSD, displayCurrency, fx),
      ch24Pct: priceEntry?.ch24Pct ?? null,
      spark: priceEntry?.spark ?? [],
      asset,
    });
  }
  return rows.sort((a, b) => b.valueUSD - a.valueUSD);
}
