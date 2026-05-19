/**
 * Motor de accrual automático de staking.
 *
 * Lógica:
 *  1. Al montar la app, revisar todas las reglas de staking activas.
 *  2. Para cada regla, calcular cuántos días pasaron desde `lastAccrualDate`
 *     (o `startDate` si es la primera vez).
 *  3. Si pasó ≥ 1 día, crear UNA tx `kind='yield'` por el período completo.
 *  4. Actualizar `lastAccrualDate` a hoy.
 *
 * Frecuencia:
 *  El campo `payoutFrequency` de la regla es INFORMATIVO (la plataforma paga
 *  diario/semanal/mensual). Para la acumulación interna siempre usamos el APY
 *  prorrateado por días — que es cómo lo calculan Nexo, Binance y la mayoría.
 *  Fórmula: qty × (APY/100) × (días/365).
 *
 * Cross-asset:
 *  Si la regla tiene `rewardAssetId`, la tx de yield se crea con ese assetId
 *  (ej. stakear USDC y recibir NEXO). La qty se convierte usando precios de
 *  mercado: (held × staked_price × APY × days/365) / reward_price.
 *  Si no hay precios disponibles, se usa la misma unidad como fallback.
 *
 * Trazabilidad:
 *  Cada tx de yield incluye `[rule:ID]` en notes para que `staking.ts` pueda
 *  atribuir correctamente la performance por regla y evitar doble conteo
 *  cuando múltiples reglas producen el mismo activo de recompensa.
 *
 * Idempotencia:
 *  Si `lastAccrualDate` ya es hoy, no se hace nada. El hook `useYieldAccrual`
 *  usa un ref para correr solo una vez por mount, pero la fecha es el
 *  backstop definitivo.
 */

import type { StakingRule, Transaction } from '@/lib/types';
import { db } from '@/lib/db/schema';
import { newId } from '@/lib/utils';
import { loadLatestFxSnapshot } from '@/lib/db/fxSnapshot';

// ─── Helpers ───────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/**
 * Qty de un activo en (asset, account, portfolio) sumando txs históricas.
 * Método simple de balance corriente — suficiente para saber sobre qué
 * cantidad calcula el APY.
 */
function qtyHeld(
  txs: Transaction[],
  assetId: string,
  accountId: string,
  portfolioId: string,
): number {
  let qty = 0;
  for (const t of txs) {
    if (t.assetId !== assetId || t.accountId !== accountId || t.portfolioId !== portfolioId) continue;
    if (t.kind === 'buy' || t.kind === 'transfer_in' || t.kind === 'yield') qty += t.qty;
    else if (t.kind === 'sell' || t.kind === 'transfer_out' || t.kind === 'fee') qty -= t.qty;
  }
  return Math.max(0, qty);
}

/** ISO date de hoy (YYYY-MM-DD), en zona local. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Motor principal ───────────────────────────────────────────────────────

export interface AccrualResult {
  /** Cantidad de txs de yield creadas. */
  txsCreated: number;
  /** Resumen por regla para el toast (ticker + qty). */
  details: Array<{ assetId: string; qty: number; days: number }>;
}

/**
 * Ejecuta el accrual para todas las reglas activas. Llama a esto UNA VEZ
 * por sesión (el hook `useYieldAccrual` lo garantiza con un ref).
 *
 * Por cada regla:
 *  - Calcula días desde `lastAccrualDate` (o `startDate`).
 *  - Si ≥ 1 día y qty > 0, crea la tx de yield y actualiza la fecha.
 *  - Si la regla tiene `endDate` en el pasado, acumula solo hasta ese corte.
 *
 * Devuelve un resumen con las txs creadas para que el caller pueda mostrar
 * un toast informativo.
 */
export async function runYieldAccrual(
  rules: StakingRule[],
  txs: Transaction[],
): Promise<AccrualResult> {
  const today = todayISO();
  const fxSnapshot = await loadLatestFxSnapshot();
  const result: AccrualResult = { txsCreated: 0, details: [] };

  // Cargar precios una sola vez — para conversión cross-asset.
  const priceRows = await db.priceCache.toArray();
  const priceByAsset = new Map(priceRows.map((r) => [r.assetId, r.price]));

  for (const rule of rules) {
    if (!rule.active) continue;

    // Fecha hasta la cual acumular.
    const accrualToStr = rule.endDate && rule.endDate < today ? rule.endDate : today;
    const accrualTo = new Date(accrualToStr);

    // Fecha desde la cual acumular (última vez o inicio de la regla).
    const lastStr = rule.lastAccrualDate ?? rule.startDate.slice(0, 10);
    const lastDate = new Date(lastStr);

    // Ya acumulamos hasta aquí: nada que hacer.
    if (lastDate >= accrualTo) continue;

    const days = (accrualTo.getTime() - lastDate.getTime()) / MS_PER_DAY;
    if (days < 1) continue;

    // Qty del activo stakeado (el capital que produce el rendimiento).
    const held = qtyHeld(txs, rule.assetId, rule.accountId, rule.portfolioId);
    if (held <= 0) continue;

    // Yield base en unidades del activo stakeado.
    const yieldBase = held * (rule.apyPct / 100) * (days / 365);
    if (yieldBase <= 0) continue;

    // El activo de la tx de yield puede ser diferente al stakeado.
    const yieldAssetId = rule.rewardAssetId ?? rule.assetId;

    // Conversión cross-asset: si la recompensa es en otro activo, convertir
    // usando precios de mercado (yield_USD / reward_price).
    let yieldQty: number;
    if (rule.rewardAssetId && rule.rewardAssetId !== rule.assetId) {
      const stakedPrice = priceByAsset.get(rule.assetId) ?? 0;
      const rewardPrice = priceByAsset.get(rule.rewardAssetId) ?? 0;
      if (stakedPrice > 0 && rewardPrice > 0) {
        const yieldUSD = yieldBase * stakedPrice;
        yieldQty = yieldUSD / rewardPrice;
      } else {
        // Sin precios disponibles: fallback a mismas unidades (impreciso).
        yieldQty = yieldBase;
      }
    } else {
      yieldQty = yieldBase;
    }

    const now = new Date().toISOString();
    const tx: Transaction = {
      id: newId(),
      kind: 'yield',
      date: `${accrualToStr}T12:00:00.000Z`,
      accountId: rule.accountId,
      portfolioId: rule.portfolioId,
      assetId: yieldAssetId,
      qty: yieldQty,
      unitPrice: 0,
      priceCurrency: 'USD',
      fxSnapshot,
      // [rule:ID] permite a staking.ts atribuir este yield a esta regla
      // específica, evitando doble conteo cuando varias reglas comparten
      // el mismo activo de recompensa (ej. múltiples reglas → NEXO).
      notes: `Auto-accrual [rule:${rule.id}]: ${days.toFixed(1)} días de staking a ${rule.apyPct}% APY`,
      source: 'auto-yield',
      createdAt: now,
    };

    // Persist en una transacción atómica: tx + actualizar lastAccrualDate.
    await db.transaction('rw', db.transactions, db.stakingRules, async () => {
      await db.transactions.add(tx);
      await db.stakingRules.update(rule.id, { lastAccrualDate: accrualToStr });
    });

    result.txsCreated += 1;
    result.details.push({ assetId: yieldAssetId, qty: yieldQty, days });
  }

  return result;
}
