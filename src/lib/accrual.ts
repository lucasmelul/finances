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
 *  (ej. stakear USDC y recibir NEXO). El assetId stakeado solo sirve para
 *  calcular el qty base.
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

/**
 * Ejecuta el accrual para todas las reglas activas. Llama a esto UNA VEZ
 * por sesión (el hook `useYieldAccrual` lo garantiza con un ref).
 *
 * Por cada regla:
 *  - Calcula días desde `lastAccrualDate` (o `startDate`).
 *  - Si ≥ 1 día y qty > 0, crea la tx de yield y actualiza la fecha.
 *  - Si la regla tiene `endDate` en el pasado, acumula solo hasta ese corte.
 */
export async function runYieldAccrual(
  rules: StakingRule[],
  txs: Transaction[],
): Promise<void> {
  const today = todayISO();
  const fxSnapshot = await loadLatestFxSnapshot();

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

    // APY prorrateado por días.
    const yieldQty = held * (rule.apyPct / 100) * (days / 365);
    if (yieldQty <= 0) continue;

    // El activo de la tx de yield puede ser diferente al stakeado.
    const yieldAssetId = rule.rewardAssetId ?? rule.assetId;

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
      notes: `Auto-accrual: ${days.toFixed(1)} días de staking a ${rule.apyPct}% APY`,
      source: 'auto-yield',
      createdAt: now,
    };

    // Persist en una transacción atómica: tx + actualizar lastAccrualDate.
    await db.transaction('rw', db.transactions, db.stakingRules, async () => {
      await db.transactions.add(tx);
      await db.stakingRules.update(rule.id, { lastAccrualDate: accrualToStr });
    });
  }
}
