/**
 * Análisis específico de CEDEARs: descompone el return total en
 *  - rendimiento del subyacente (acción USA)
 *  - impacto del FX (CCL)
 *
 * Es la pregunta más frecuente del inversor argentino: "¿gané porque AAPL
 * subió o porque el dólar subió?". Ambos efectos componen multiplicativamente:
 *
 *     P_cedear_ARS = P_underlying_USD × CCL / ratio
 *
 *     P_cedear_ARS_now / P_cedear_ARS_buy
 *       = (P_underlying_now / P_underlying_buy) × (CCL_now / CCL_buy)
 *
 * Por eso el `totalReturnPct` no es la suma sino el producto compuesto.
 *
 * Inputs y outputs viven en este archivo solo (no acoplo a metrics.ts) porque
 * solo se usa cuando el asset es un CEDEAR — separación clara.
 */

import type { Asset, Transaction } from '@/lib/types';

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface CedearBreakdownInput {
  asset: Asset;
  /** Compras del usuario (kind='buy' o 'transfer_in') del CEDEAR. */
  buyTxs: Transaction[];
  /** Precio actual del CEDEAR en su moneda nativa (ARS). */
  currentPriceARS: number;
  /** Precio actual del subyacente en USD (Twelve Data). */
  currentUnderlyingUSD?: number;
  /** CCL actual. */
  currentCCL: number;
}

export interface CedearBreakdown {
  /** Rendimiento del subyacente: (precio USA hoy) / (precio USA al comprar) - 1. */
  underlyingReturnPct: number;
  /** Impacto del FX: (CCL hoy) / (CCL al comprar) - 1. */
  fxImpactPct: number;
  /** Return total compuesto del CEDEAR en ARS. */
  totalReturnPct: number;
  /** Precio implícito al comprar (USD) del subyacente. */
  purchaseEffectiveUnderlyingUSD: number;
  /** Precio actual del subyacente (USD). */
  currentUnderlyingUSD: number;
  /** CCL promedio al momento de las compras, ponderado por monto invertido. */
  purchaseCCL: number;
  /** Cuál efecto pesó más: 'underlying' (acción) | 'fx' (dólar) | 'mixed'. */
  dominantDriver: 'underlying' | 'fx' | 'mixed';
}

// ─── Cálculo ───────────────────────────────────────────────────────────────

/**
 * Computa el breakdown. Returna `null` si:
 *  - el asset no es CEDEAR o no tiene `cedearRatio`
 *  - no hay compras
 *  - no hay precio del subyacente disponible (necesitaríamos el endpoint de
 *    Twelve Data; sin él el cálculo no es honesto)
 */
export function computeCedearBreakdown(
  input: CedearBreakdownInput,
): CedearBreakdown | null {
  const { asset, buyTxs, currentPriceARS, currentUnderlyingUSD, currentCCL } = input;
  if (asset.type !== 'cedear' || !asset.cedearRatio || asset.cedearRatio <= 0) {
    return null;
  }
  if (buyTxs.length === 0) return null;

  // 1. Calcular CCL promedio al momento de las compras, ponderado por monto
  //    invertido en ARS. Si una tx no tiene fxSnapshot, no podemos imputarla
  //    al promedio — la salteamos pero seguimos contando las que sí tienen.
  let totalARS = 0;
  let totalUSDinvested = 0;
  let totalQty = 0;
  for (const tx of buyTxs) {
    if (tx.priceCurrency !== 'ARS') continue; // CEDEAR siempre se compra en ARS
    const cclAtBuy = tx.fxSnapshot?.ccl;
    if (!cclAtBuy) continue;
    const arsTotal = tx.qty * tx.unitPrice;
    const usdAtBuy = arsTotal / cclAtBuy;
    totalARS += arsTotal;
    totalUSDinvested += usdAtBuy;
    totalQty += tx.qty;
  }

  if (totalQty === 0 || totalUSDinvested === 0) return null;

  const purchaseCCL = totalARS / totalUSDinvested;

  // 2. Precio implícito del subyacente al comprar:
  //    P_underlying_buy_USD = avg_USD_per_CEDEAR × ratio
  const avgCostUSDperCedear = totalUSDinvested / totalQty;
  const purchaseEffectiveUnderlyingUSD = avgCostUSDperCedear * asset.cedearRatio;

  // 3. Precio actual del subyacente. Si no vino del polling, lo derivamos del
  //    precio del CEDEAR ARS (asumiendo eficiencia BYMA = sin prima/descuento).
  //    Marcamos el caller con el campo currentUnderlyingUSD del input para que
  //    sepa que es real vs derivado, pero el output siempre lo expone.
  const underlyingNowUSD =
    currentUnderlyingUSD ?? (currentPriceARS * asset.cedearRatio) / currentCCL;

  if (underlyingNowUSD <= 0 || purchaseEffectiveUnderlyingUSD <= 0) return null;

  // 4. Returns componentes
  const underlyingReturnPct =
    (underlyingNowUSD / purchaseEffectiveUnderlyingUSD - 1) * 100;
  const fxImpactPct = (currentCCL / purchaseCCL - 1) * 100;

  // 5. Return total: composición multiplicativa (ARS).
  const totalReturnPct =
    ((1 + underlyingReturnPct / 100) * (1 + fxImpactPct / 100) - 1) * 100;

  // 6. Driver dominante: el que aporta más en valor absoluto. Si difieren
  //    en menos de 30% relativo, llamamos "mixed".
  const absUnderlying = Math.abs(underlyingReturnPct);
  const absFx = Math.abs(fxImpactPct);
  let dominantDriver: CedearBreakdown['dominantDriver'];
  if (absUnderlying < 0.5 && absFx < 0.5) {
    dominantDriver = 'mixed'; // ambos casi nulos
  } else if (absUnderlying > absFx * 1.4) {
    dominantDriver = 'underlying';
  } else if (absFx > absUnderlying * 1.4) {
    dominantDriver = 'fx';
  } else {
    dominantDriver = 'mixed';
  }

  return {
    underlyingReturnPct,
    fxImpactPct,
    totalReturnPct,
    purchaseEffectiveUnderlyingUSD,
    currentUnderlyingUSD: underlyingNowUSD,
    purchaseCCL,
    dominantDriver,
  };
}

// ─── Texto explicativo ─────────────────────────────────────────────────────

/**
 * Frase corta para el UI. Le explica al usuario "de dónde vino la guita"
 * sin obligarlo a interpretar números.
 */
export function describeCedearDriver(b: CedearBreakdown): string {
  const sign = (n: number) => (n >= 0 ? 'subió' : 'bajó');
  if (b.dominantDriver === 'underlying') {
    return `Tu resultado vino principalmente por la acción (${sign(b.underlyingReturnPct)} ${Math.abs(b.underlyingReturnPct).toFixed(1)}%).`;
  }
  if (b.dominantDriver === 'fx') {
    return `Tu resultado vino principalmente por el dólar (CCL ${sign(b.fxImpactPct)} ${Math.abs(b.fxImpactPct).toFixed(1)}% desde tu compra).`;
  }
  return 'Tu resultado vino tanto por la acción como por el dólar, en proporciones similares.';
}
