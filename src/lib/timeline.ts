/**
 * Capital Timeline — evolución mensual de:
 *  - **invested**: open cost basis FIFO al cierre de cada mes, consistente
 *    con `computePortfolioMetrics.totalInvestedUSD` (incluye el efecto de
 *    ventas — se reduce cuando se venden posiciones).
 *  - **value**: valuación del portfolio en ese momento
 *  - **pnl**: value − invested
 *
 * Limitación honesta del PROMPT: la valuación histórica del portfolio
 * requiere precios históricos por asset por mes. No los tenemos en Phase 1
 * — se irían a llamar al endpoint `market_chart` de CoinGecko / Twelve Data
 * por cada mes, lo que es costoso y sale del scope.
 *
 * Estrategia de fallback (documentada en SPEC_V2 §11):
 *  - **invested** usa FIFO open cost basis, consistente con computePortfolioMetrics.
 *  - **value** se proyecta desde el invested usando el precio ACTUAL como
 *    si las posiciones se hubieran sostenido. Eso significa que el valor
 *    pasado se ve "ondulado" si los precios cambiaron, pero el valor actual
 *    coincide con el portfolio real.
 *
 * El UI explica esto. Cuando llegue el endpoint histórico, esta función
 * cambia internamente sin romper el contrato.
 */

import type { Asset, Transaction } from '@/lib/types';
import {
  priceInUSD,
  type FxView,
  type PriceLookup,
} from '@/lib/holdings';
import { computeFIFO } from '@/lib/fifo';

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface CapitalTimelinePoint {
  /** ISO date del primer día del mes (`2026-04-01`). */
  date: string;
  /** Capital invertido acumulado al cierre de ese mes. */
  investedUSD: number;
  /** Valor estimado del portfolio al cierre de ese mes (ver fallback strategy). */
  valueUSD: number;
  /** PnL = value - invested. */
  pnlUSD: number;
}

export type TimelineRange = '6M' | '1Y' | 'All';

// ─── Cálculo ───────────────────────────────────────────────────────────────

/**
 * Reconstruye la timeline desde las txs. Crea un punto por mes desde la
 * primera tx hasta hoy.
 */
export function computeCapitalTimeline({
  transactions,
  assets,
  prices,
  fx,
  range,
}: {
  transactions: Transaction[];
  assets: Asset[];
  prices: Map<string, PriceLookup>;
  fx: FxView;
  range: TimelineRange;
}): CapitalTimelinePoint[] {
  if (transactions.length === 0) return [];

  // 1. Determinar primer y último mes a graficar.
  const sorted = [...transactions].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const firstDate = new Date(sorted[0].date);
  const today = new Date();

  let startDate: Date;
  if (range === '6M') {
    startDate = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  } else if (range === '1Y') {
    startDate = new Date(today.getFullYear() - 1, today.getMonth(), 1);
  } else {
    // All: primer mes de actividad real
    startDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  }
  // Si firstDate es posterior al startDate, recortamos.
  if (firstDate > startDate) {
    startDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  }

  // 2. Generar lista de meses entre start y hoy.
  const months: Date[] = [];
  const cursor = new Date(startDate);
  while (cursor <= today) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (months.length === 0) return [];

  // 3. Precio actual por asset en USD (para projection del valor).
  const currentUSDByAsset = new Map<string, number>();
  for (const a of assets) {
    const p = prices.get(a.id);
    if (!p) continue;
    currentUSDByAsset.set(a.id, priceInUSD(p, fx));
  }

  // 4. Reconstruir invested (FIFO open cost basis) + qty por activo a fin de cada mes.
  const points: CapitalTimelinePoint[] = [];
  for (const month of months) {
    const cutoff = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59); // último día del mes

    const txsUpToCutoff = sorted.filter(tx => new Date(tx.date) <= cutoff);
    const { openLots } = computeFIFO(txsUpToCutoff, fx);
    const invested = openLots.reduce((s, l) => s + l.remainingQty * l.costUSDPerUnit, 0);
    const qtyByAsset = new Map<string, number>();
    for (const lot of openLots) {
      qtyByAsset.set(lot.assetId, (qtyByAsset.get(lot.assetId) ?? 0) + lot.remainingQty);
    }

    // Value = sum(qty × precio_actual). Es la limitación honesta — no es
    // el valor que tenía en ese mes, es el valor de "esa cantidad si la
    // mantuvieras hoy". Cuando tengamos histórico real, cambiamos esto.
    let value = 0;
    for (const [assetId, qty] of qtyByAsset) {
      const px = currentUSDByAsset.get(assetId);
      if (px == null) continue;
      value += qty * px;
    }

    points.push({
      date: month.toISOString().slice(0, 10),
      investedUSD: invested,
      valueUSD: value,
      pnlUSD: value - invested,
    });
  }

  return points;
}
