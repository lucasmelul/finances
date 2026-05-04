/**
 * Hooks de live-query contra IndexedDB. Cada uno se suscribe a la tabla
 * relevante y re-renderiza cuando cambia.
 *
 * Por qué `useLiveQuery` y no React Query para datos locales:
 * - dexie-react-hooks observa cambios en la DB (cualquier `put`/`delete` se
 *   propaga sin invalidate manual).
 * - React Query queda para fetches HTTP (precios, FX) — datos remotos.
 *
 * Convención: cada hook devuelve `undefined` mientras carga, y un array (o
 * valor) cuando hay datos. Las pantallas hacen guard `if (!x) return null`.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './schema';
import type {
  Account,
  Asset,
  Portfolio,
  PriceCache,
  StakingRule,
  Transaction,
} from '@/lib/types';

export function useAccounts(): Account[] | undefined {
  return useLiveQuery(() => db.accounts.toArray(), []);
}

export function useAssets(): Asset[] | undefined {
  return useLiveQuery(() => db.assets.toArray(), []);
}

export function usePortfolios(): Portfolio[] | undefined {
  return useLiveQuery(() => db.portfolios.toArray(), []);
}

/** Todas las transactions, ordenadas por fecha descendente (más recientes primero). */
export function useTransactions(): Transaction[] | undefined {
  return useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), []);
}

/** Transactions filtradas a un asset específico. */
export function useTransactionsByAsset(assetId: string | undefined): Transaction[] | undefined {
  return useLiveQuery(async () => {
    if (!assetId) return [];
    return db.transactions.where('assetId').equals(assetId).reverse().sortBy('date');
  }, [assetId]);
}

/** Snapshot completo del cache de precios. */
export function usePriceCache(): PriceCache[] | undefined {
  return useLiveQuery(() => db.priceCache.toArray(), []);
}

/** Lista de reglas de staking (activas e inactivas). */
export function useStakingRules(): StakingRule[] | undefined {
  return useLiveQuery(() => db.stakingRules.toArray(), []);
}
