/**
 * Helper compartido: carga el FX más reciente desde IndexedDB para embeber
 * como `fxSnapshot` en una transacción nueva.
 *
 * Separado de `mutations.ts` para que `accrual.ts` pueda usarlo sin crear
 * una dependencia circular.
 */

import { db } from './schema';
import { SEED_FX } from '@/data/seed';
import type { Transaction } from '@/lib/types';

/**
 * Lee el FX más fresco para embeber como `fxSnapshot` en la tx.
 * Si no hay nada en cache (primer arranque sin polling), usa el seed.
 */
export async function loadLatestFxSnapshot(): Promise<Transaction['fxSnapshot']> {
  const rows = await db.fxRateCache.toArray();
  if (rows.length === 0) {
    return {
      ccl: SEED_FX.ccl,
      mep: SEED_FX.mep,
      blue: SEED_FX.blue,
      oficial: SEED_FX.oficial,
    };
  }
  const byKind = new Map(rows.map((r) => [r.kind, r.sell]));
  return {
    ccl: byKind.get('ccl') ?? SEED_FX.ccl,
    mep: byKind.get('mep') ?? SEED_FX.mep,
    blue: byKind.get('blue') ?? SEED_FX.blue,
    oficial: byKind.get('oficial') ?? SEED_FX.oficial,
  };
}
