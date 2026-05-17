/**
 * Motor FIFO (First-In, First-Out) para cálculo de costo base y ganancias realizadas.
 *
 * Terminología:
 *  - Lot: unidad de compra (buy o transfer_in) con qty, costo base y qty restante.
 *  - FIFO: los lots más antiguos se consumen primero en cada venta.
 *  - RealizedGain: resultado de una venta (proceeds − costBasis).
 *
 * Scope del FIFO: (assetId × accountId × portfolioId).
 * Esto coincide con el scope de los holdings — cada posición se maneja
 * de forma independiente. Las transferencias entre cuentas abren un nuevo lot
 * en la cuenta destino con el precio que traiga la transacción.
 *
 * Eventos:
 *  - buy / transfer_in  → abren lot
 *  - yield              → abre lot a costo 0 (dilutivo del DCA, no del invested)
 *  - sell               → consume lots FIFO + registra ganancia realizada
 *  - transfer_out / fee → consume lots FIFO sin evento de realización
 *  - fx / adjustment    → ignorados (no afectan qty)
 *
 * La función es PURA — no escribe a DB, no tiene side effects.
 * Se llama en runtime con todas las txs cada vez que se necesite; para uso
 * personal (<1 000 txs) el costo es despreciable.
 */

import type { Transaction } from '@/lib/types';
import type { FxView } from '@/lib/holdings';

// ─── Tipos públicos ────────────────────────────────────────────────────────

/** Un lote de compra con qty remanente. */
export interface OpenLot {
  /** ID de la tx que creó este lot. */
  txId: string;
  /** Fecha de apertura (ISO). Define el orden FIFO. */
  date: string;
  assetId: string;
  accountId: string;
  portfolioId: string;
  /** Cantidad original al abrir el lot. */
  qty: number;
  /** Cantidad todavía no consumida. */
  remainingQty: number;
  /** Costo en USD por unidad al momento de la compra. Fijo; nunca cambia. */
  costUSDPerUnit: number;
}

/** Ganancia/pérdida realizada al ejecutar una venta. */
export interface RealizedGain {
  /** ID de la tx de venta. */
  sellTxId: string;
  assetId: string;
  /** ISO date de la venta. */
  date: string;
  /** Cantidad vendida. */
  qty: number;
  /** Suma del costo base de los lots consumidos. */
  costBasisUSD: number;
  /** Precio de venta × qty convertido a USD. */
  proceedsUSD: number;
  /** `proceedsUSD − costBasisUSD`. Positivo = ganancia, negativo = pérdida. */
  realizedPnLUSD: number;
}

export interface FIFOResult {
  /** Lots con qty > 0 (posiciones abiertas). */
  openLots: OpenLot[];
  /** Ganancias/pérdidas ya cristalizadas por ventas ejecutadas. */
  realized: RealizedGain[];
}

// ─── Función principal ─────────────────────────────────────────────────────

/**
 * Procesa todas las transacciones en orden cronológico y produce:
 *  - `openLots`: posiciones abiertas con su costo base FIFO correcto
 *  - `realized`: ganancias/pérdidas de las ventas ya ejecutadas
 *
 * Las transacciones NO necesitan estar ordenadas — la función las ordena internamente.
 */
export function computeFIFO(transactions: Transaction[], fx: FxView): FIFOResult {
  // FIFO requiere orden cronológico estricto.
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  // Mapa scope → cola FIFO de lots abiertos (el primer elemento es el más antiguo).
  const lotQueues = new Map<string, OpenLot[]>();
  const realized: RealizedGain[] = [];

  for (const tx of sorted) {
    const scope = scopeKey(tx);

    switch (tx.kind) {
      case 'buy':
      case 'transfer_in': {
        openLot(lotQueues, scope, tx, txUnitCostUSD(tx, fx));
        break;
      }

      case 'yield': {
        // El yield suma qty a la posición pero a costo 0 — dilutivo del DCA.
        // Cuando se vende, la porción "yield" tiene costo 0 y toda la venta
        // es ganancia realizada (correcto desde el punto de vista contable).
        openLot(lotQueues, scope, tx, 0);
        break;
      }

      case 'sell': {
        const proceeds = tx.qty * txUnitCostUSD(tx, fx);
        const { costBasisUSD, qtyConsumed } = consumeLots(lotQueues, scope, tx.qty);
        realized.push({
          sellTxId: tx.id,
          assetId: tx.assetId,
          date: tx.date,
          qty: qtyConsumed,
          costBasisUSD,
          proceedsUSD: proceeds,
          realizedPnLUSD: proceeds - costBasisUSD,
        });
        break;
      }

      case 'transfer_out':
      case 'fee': {
        // Consume lots pero NO registra ganancia realizada. Mover activos entre
        // cuentas propias no es un evento de realización fiscal (en Argentina
        // ni en la mayoría de jurisdicciones).
        consumeLots(lotQueues, scope, tx.qty);
        break;
      }

      case 'fx':
      case 'adjustment':
        // No afectan qty de activos — ignorar.
        break;
    }
  }

  // Extraer todos los lots con qty remanente.
  const openLots: OpenLot[] = [];
  for (const queue of lotQueues.values()) {
    for (const lot of queue) {
      if (lot.remainingQty > DUST) openLots.push(lot);
    }
  }

  return { openLots, realized };
}

// ─── Helpers internos ──────────────────────────────────────────────────────

/** Por debajo de esta cantidad consideramos el lot "cerrado" (evita basura de redondeo). */
const DUST = 1e-8;

function scopeKey(tx: Transaction): string {
  return `${tx.assetId}|${tx.accountId}|${tx.portfolioId}`;
}

function openLot(
  queues: Map<string, OpenLot[]>,
  scope: string,
  tx: Transaction,
  costUSDPerUnit: number,
): void {
  const lot: OpenLot = {
    txId: tx.id,
    date: tx.date,
    assetId: tx.assetId,
    accountId: tx.accountId,
    portfolioId: tx.portfolioId,
    qty: tx.qty,
    remainingQty: tx.qty,
    costUSDPerUnit,
  };
  const q = queues.get(scope) ?? [];
  q.push(lot);
  queues.set(scope, q);
}

/**
 * Consume `qty` unidades de los lots FIFO del scope.
 * Devuelve cuánto se consumió realmente (puede ser menor si la posición
 * es más chica que qty — escenario "oversell", inusual en uso normal).
 */
function consumeLots(
  queues: Map<string, OpenLot[]>,
  scope: string,
  qty: number,
): { costBasisUSD: number; qtyConsumed: number } {
  const queue = queues.get(scope) ?? [];
  let toConsume = qty;
  let costBasisUSD = 0;

  for (const lot of queue) {
    if (toConsume <= 0) break;
    const consumed = Math.min(lot.remainingQty, toConsume);
    costBasisUSD += consumed * lot.costUSDPerUnit;
    lot.remainingQty -= consumed;
    toConsume -= consumed;
  }

  // Limpiar lots agotados para mantener la cola chica.
  queues.set(scope, queue.filter((l) => l.remainingQty > DUST));

  const qtyConsumed = qty - Math.max(0, toConsume);
  return { costBasisUSD, qtyConsumed };
}

/**
 * Convierte el `unitPrice` de una tx a USD usando el snapshot FX de la propia
 * tx (históricamente correcto) o el FX actual como fallback.
 *
 * Prioridad del snapshot: preserva el costo histórico aunque el CCL cambie
 * después — crítico para que el PnL no "respire" con el dólar.
 */
export function txUnitCostUSD(tx: Transaction, fallbackFx: FxView): number {
  if (tx.priceCurrency === 'USD' || tx.priceCurrency === 'USDT') {
    return tx.unitPrice;
  }
  if (tx.priceCurrency === 'ARS') {
    const ccl = tx.fxSnapshot?.ccl ?? fallbackFx.ccl;
    if (!ccl) return 0;
    return tx.unitPrice / ccl;
  }
  // EUR / BTC como moneda de precio: sin tasa confiable → 0.
  // El caller puede detectar esto con `hasCompleteData`.
  return 0;
}
