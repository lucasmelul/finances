/**
 * Reconciliación de saldos — el "cerebro" puro del módulo Reconciliar.
 *
 * Problema que resuelve: en plataformas que hacen múltiples swaps/ventas en el
 * día, al final del día sabés el SALDO RESULTANTE, no el detalle de cada
 * operación (precio, hora, cantidad). Este módulo toma los saldos actuales
 * (calculados por la app) + los saldos reales (los que el usuario lee en la
 * plataforma) y deduce las transacciones necesarias.
 *
 * Idea central: un swap CONSERVA valor. Si sé los dos lados del movimiento,
 * el precio de ejecución se deduce exacto, sin tocar el precio de cache:
 *
 *     ΔUSDC = -3000  (salieron 3000 USD de valor)
 *     ΔBTC  = +0.0423 (entraron a ese mismo valor)
 *     precio implícito BTC = 3000 / 0.0423 = 70.921 USD/u
 *
 * Las dos transacciones netean a cero → no hay PnL fantasma, y la compra de
 * BTC entra al FIFO con su costo base correcto (clave para que el DCA siga
 * andando: "compré a 60k/65k/70k, ¿gano si vendo a 80k?").
 *
 * Scope multi-cartera: una reconciliación es por CUENTA pero abarca TODAS sus
 * carteras. Cada fila/movimiento se identifica por el scope `(asset, cartera)`
 * — porque el mismo activo (ej. USDC) puede vivir en `corto` y `medio` a la
 * vez, y el FIFO los maneja como posiciones independientes. Un swap puede
 * cruzar carteras (vendés USDC de `corto`, el BTC entra a `medio`): el valor
 * se conserva igual.
 *
 * Casos:
 *  - 1 baja + 1 suba           → 1 swap, precio implícito exacto.
 *  - 1 baja + N subas (o vice) → se reparte por valor de mercado de cada punta
 *    (el agregado sigue siendo exacto; el mercado solo decide el reparto).
 *  - varias bajas Y varias subas → ambiguo: requiere emparejamiento manual.
 *  - solo bajó / solo subió un activo → depósito / retiro (sin precio).
 *
 * El precio de cache se usa SOLO como ancla (swap entre dos volátiles) y como
 * guardrail (avisar si el precio implícito se desvía mucho del de mercado, lo
 * que delata un error de tipeo en los saldos). Nunca como verdad del valor.
 *
 * Módulo PURO — sin acceso a DB ni side effects. Testeable en aislamiento.
 */

import { fmtMoney } from '@/lib/format';

const DUST = 1e-8;

/** Umbral de desvío precio implícito vs mercado que dispara warning. */
const PRICE_DEVIATION_WARN = 0.15;

/** Stablecoins con valor USD conocido (≈ 1). */
const STABLE_TICKERS = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'USDD', 'FDUSD']);

export function isStableAsset(ticker: string, type: string): boolean {
  return type === 'cash' || STABLE_TICKERS.has(ticker.toUpperCase());
}

/** Identificador único de un scope `(asset, cartera)` dentro de la cuenta. */
export function scopeKey(assetId: string, portfolioId: string): string {
  return `${assetId}|${portfolioId}`;
}

// ─── Entrada ────────────────────────────────────────────────────────────────

/** Una fila de la tabla de reconciliación: saldo actual vs nuevo, con cartera. */
export interface BalanceLine {
  /** Clave única del scope `(asset, cartera)` — `scopeKey(assetId, portfolioId)`. */
  key: string;
  assetId: string;
  ticker: string;
  /** Cartera donde vive esta posición. El swap puede cruzar carteras. */
  portfolioId: string;
  /** Etiqueta legible de la cartera (ej. "corto") para mostrar. */
  bucketLabel: string;
  /** Saldo que la app calculó para este (cuenta, cartera). */
  currentQty: number;
  /** Saldo real que el usuario tiene ahora en la plataforma. */
  targetQty: number;
  /** Precio de mercado en USD (de priceCache). 0 si no hay cotización. */
  priceUSD: number;
  /** Stablecoin/cash → su valor USD se conoce aunque falte el cache. */
  isStable: boolean;
}

/** Un movimiento detectado (una punta del swap). Magnitud siempre positiva. */
export interface Delta {
  key: string;
  assetId: string;
  ticker: string;
  portfolioId: string;
  bucketLabel: string;
  qty: number;
  priceUSD: number;
  isStable: boolean;
  /** Valor USD de la magnitud. Para stables usa 1 si falta el precio. */
  valueUSD: number;
}

/** Un emparejamiento source→sink (por scope) con las cantidades de cada punta. */
export interface Pairing {
  fromKey: string;
  toKey: string;
  fromQty: number;
  toQty: number;
}

// ─── Salida ─────────────────────────────────────────────────────────────────

export type ReconcileMove =
  | {
      kind: 'swap';
      fromAssetId: string;
      fromTicker: string;
      fromPortfolioId: string;
      fromBucketLabel: string;
      fromQty: number;
      /** Precio USD del activo entregado (1 para stables). */
      fromPriceUSD: number;
      toAssetId: string;
      toTicker: string;
      toPortfolioId: string;
      toBucketLabel: string;
      toQty: number;
      /** Precio implícito del activo recibido = valueUSD / toQty. */
      impliedPriceUSD: number;
      valueUSD: number;
    }
  | {
      kind: 'deposit' | 'withdraw';
      assetId: string;
      ticker: string;
      portfolioId: string;
      bucketLabel: string;
      qty: number;
      priceUSD: number;
      valueUSD: number;
    };

export interface ReconcileWarning {
  level: 'warn' | 'info';
  message: string;
}

export interface ReconcilePlan {
  moves: ReconcileMove[];
  warnings: ReconcileWarning[];
}

// ─── Detección de deltas ─────────────────────────────────────────────────────

/** Parte las líneas en lo que bajó (sources) y lo que subió (sinks). */
export function computeDeltas(lines: BalanceLine[]): {
  sources: Delta[];
  sinks: Delta[];
} {
  const sources: Delta[] = [];
  const sinks: Delta[] = [];

  for (const l of lines) {
    const d = l.targetQty - l.currentQty;
    if (Math.abs(d) <= DUST) continue;
    const qty = Math.abs(d);
    const unit = l.priceUSD || (l.isStable ? 1 : 0);
    const entry: Delta = {
      key: l.key,
      assetId: l.assetId,
      ticker: l.ticker,
      portfolioId: l.portfolioId,
      bucketLabel: l.bucketLabel,
      qty,
      priceUSD: l.priceUSD,
      isStable: l.isStable,
      valueUSD: qty * unit,
    };
    if (d < 0) sources.push(entry);
    else sinks.push(entry);
  }

  return { sources, sinks };
}

/**
 * ¿Se puede resolver sin que el usuario empareje a mano?
 * Ambiguo solo cuando hay >1 baja Y >1 suba (no sabés qué fondeó qué).
 */
export function needsManualPairing(sources: Delta[], sinks: Delta[]): boolean {
  return sources.length > 1 && sinks.length > 1;
}

/**
 * Empareja automáticamente los casos no ambiguos:
 *  - 1 source + N sinks → reparte el source por valor de mercado de cada sink.
 *  - N sources + 1 sink → reparte el sink por valor de cada source.
 *  - 1 + 1               → trivial.
 * Devuelve `null` si el caso es ambiguo (N×M con N>1 y M>1).
 */
export function autoPairings(sources: Delta[], sinks: Delta[]): Pairing[] | null {
  if (sources.length === 0 || sinks.length === 0) return [];
  if (needsManualPairing(sources, sinks)) return null;

  const pairings: Pairing[] = [];

  if (sources.length === 1) {
    const src = sources[0];
    const total = sinks.reduce((s, k) => s + k.valueUSD, 0);
    for (const sink of sinks) {
      const w = total > 0 ? sink.valueUSD / total : 1 / sinks.length;
      pairings.push({
        fromKey: src.key,
        toKey: sink.key,
        fromQty: src.qty * w,
        toQty: sink.qty,
      });
    }
  } else {
    // sinks.length === 1
    const sink = sinks[0];
    const total = sources.reduce((s, k) => s + k.valueUSD, 0);
    for (const src of sources) {
      const w = total > 0 ? src.valueUSD / total : 1 / sources.length;
      pairings.push({
        fromKey: src.key,
        toKey: sink.key,
        fromQty: src.qty,
        toQty: sink.qty * w,
      });
    }
  }

  return pairings;
}

// ─── Construcción del plan ───────────────────────────────────────────────────

/**
 * Arma el plan final desde los deltas + emparejamientos. Cada pairing produce
 * un swap; lo que queda sin emparejar se vuelve depósito (subió) o retiro
 * (bajó). Agrega warnings de guardrail.
 */
export function buildPlan(
  sources: Delta[],
  sinks: Delta[],
  pairings: Pairing[],
): ReconcilePlan {
  const moves: ReconcileMove[] = [];
  const warnings: ReconcileWarning[] = [];

  const srcByKey = new Map(sources.map((s) => [s.key, s]));
  const sinkByKey = new Map(sinks.map((s) => [s.key, s]));
  const usedFrom = new Map<string, number>();
  const usedTo = new Map<string, number>();

  for (const p of pairings) {
    const src = srcByKey.get(p.fromKey);
    const sink = sinkByKey.get(p.toKey);
    if (!src || !sink || p.fromQty <= DUST || p.toQty <= DUST) continue;

    const fromPriceUSD = src.priceUSD || (src.isStable ? 1 : 0);
    const valueUSD = p.fromQty * fromPriceUSD;
    const impliedPriceUSD = valueUSD / p.toQty;

    moves.push({
      kind: 'swap',
      fromAssetId: src.assetId,
      fromTicker: src.ticker,
      fromPortfolioId: src.portfolioId,
      fromBucketLabel: src.bucketLabel,
      fromQty: p.fromQty,
      fromPriceUSD,
      toAssetId: sink.assetId,
      toTicker: sink.ticker,
      toPortfolioId: sink.portfolioId,
      toBucketLabel: sink.bucketLabel,
      toQty: p.toQty,
      impliedPriceUSD,
      valueUSD,
    });

    usedFrom.set(src.key, (usedFrom.get(src.key) ?? 0) + p.fromQty);
    usedTo.set(sink.key, (usedTo.get(sink.key) ?? 0) + p.toQty);

    // Guardrail: precio implícito muy lejos del de mercado = saldo mal tipeado.
    if (sink.priceUSD > 0) {
      const dev = Math.abs(impliedPriceUSD - sink.priceUSD) / sink.priceUSD;
      if (dev > PRICE_DEVIATION_WARN) {
        warnings.push({
          level: 'warn',
          message: `${sink.ticker}: precio implícito ${fmtMoney(impliedPriceUSD)} difiere ${(dev * 100).toFixed(0)}% del de mercado (${fmtMoney(sink.priceUSD)}). Revisá los saldos.`,
        });
      }
    }
    if (fromPriceUSD === 0) {
      warnings.push({
        level: 'warn',
        message: `No tengo precio USD de ${src.ticker}; el valor del swap puede ser impreciso.`,
      });
    }
  }

  // Remanentes no emparejados → depósito / retiro.
  for (const s of sources) {
    const rem = s.qty - (usedFrom.get(s.key) ?? 0);
    if (rem > DUST) {
      moves.push({
        kind: 'withdraw',
        assetId: s.assetId,
        ticker: s.ticker,
        portfolioId: s.portfolioId,
        bucketLabel: s.bucketLabel,
        qty: rem,
        priceUSD: s.priceUSD,
        valueUSD: rem * (s.priceUSD || (s.isStable ? 1 : 0)),
      });
    } else if (rem < -DUST) {
      warnings.push({
        level: 'warn',
        message: `Emparejaste más ${s.ticker} (${s.bucketLabel}) del que bajó el saldo.`,
      });
    }
  }
  for (const s of sinks) {
    const rem = s.qty - (usedTo.get(s.key) ?? 0);
    if (rem > DUST) {
      moves.push({
        kind: 'deposit',
        assetId: s.assetId,
        ticker: s.ticker,
        portfolioId: s.portfolioId,
        bucketLabel: s.bucketLabel,
        qty: rem,
        priceUSD: s.priceUSD,
        valueUSD: rem * (s.priceUSD || (s.isStable ? 1 : 0)),
      });
    } else if (rem < -DUST) {
      warnings.push({
        level: 'warn',
        message: `Emparejaste más ${s.ticker} (${s.bucketLabel}) del que subió el saldo.`,
      });
    }
  }

  return { moves, warnings };
}
