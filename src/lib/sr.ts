/**
 * Cálculo de Soporte / Resistencia desde un array de precios históricos.
 *
 * Reemplaza el `SEED_SR` (niveles inventados del diseño) con cálculo real
 * basado en datos del proveedor (CoinGecko market_chart, etc.).
 *
 * Algoritmo: percentile 10 / percentile 90 sobre los últimos N puntos.
 *  - Robusto contra outliers (mejor que rolling min/max puro).
 *  - Suficiente para el caso de uso "¿estoy cerca del piso o del techo?".
 *  - Si no hay suficientes puntos (mínimo 20), devolvemos null y la UI
 *    no muestra bandas ni clasifica el activo.
 *
 * Mejora futura (Phase 3): pivot points clásicos (`P = (H+L+C)/3`,
 * `S1 = 2P - H`, etc.). Más sofisticado, pero requiere OHLC y no
 * `[timestamp, price][]` que es lo que tenemos hoy.
 */

export interface SRLevels {
  /** Soporte aproximado: precio histórico bajo. */
  low: number;
  /** Resistencia aproximada: precio histórico alto. */
  high: number;
  /** Cantidad de puntos usados para el cálculo (transparencia). */
  sampleSize: number;
}

const MIN_SAMPLES = 20;
const LOW_PERCENTILE = 0.1;
const HIGH_PERCENTILE = 0.9;

/**
 * Computa S/R desde una serie de precios. Devuelve null si:
 *  - menos de MIN_SAMPLES puntos
 *  - todos los precios son iguales (range = 0)
 */
export function computeSRFromPrices(prices: number[]): SRLevels | null {
  if (!prices || prices.length < MIN_SAMPLES) return null;

  const sorted = [...prices].filter((n) => isFinite(n) && n > 0).sort((a, b) => a - b);
  if (sorted.length < MIN_SAMPLES) return null;

  const lowIdx = Math.floor(sorted.length * LOW_PERCENTILE);
  const highIdx = Math.floor(sorted.length * HIGH_PERCENTILE);

  const low = sorted[lowIdx];
  const high = sorted[highIdx];
  if (high - low <= 0) return null;

  return { low, high, sampleSize: sorted.length };
}

/**
 * Posición del precio actual en la banda S/R. 0 = en soporte, 1 = en resistencia.
 * Devuelve null si el SR no es computable.
 */
export function srPosition(currentPrice: number, sr: SRLevels): number {
  return (currentPrice - sr.low) / (sr.high - sr.low);
}

/**
 * Clasificación de la posición en banda S/R según los thresholds del SPEC §6.
 *  - pos < 0.25 → buy   (en zona de compra)
 *  - pos < 0.45 → watch (cerca de soporte)
 *  - pos > 0.85 → sell  (en zona de venta)
 *  - resto → null (no genera signal)
 */
export type SRSignal = 'buy' | 'watch' | 'sell';

export function classifySRPosition(pos: number): SRSignal | null {
  if (pos < 0.25) return 'buy';
  if (pos < 0.45) return 'watch';
  if (pos > 0.85) return 'sell';
  return null;
}
