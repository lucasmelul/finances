import Dexie, { type Table } from 'dexie';
import type {
  Account,
  Asset,
  FxRateCache,
  Portfolio,
  PriceCache,
  StakingRule,
  Transaction,
  WatchlistEntry,
  YieldAccrual,
} from '@/lib/types';

/**
 * Schema de IndexedDB vía Dexie.
 *
 * Convenciones:
 * - Índices declarados explícitamente en cada `version().stores()`.
 * - PK siempre `id` (UUID v4 de `crypto.randomUUID()`).
 * - Las migraciones se acumulan: cada cambio es una nueva `.version(N)`.
 */
export class PortfolioDB extends Dexie {
  accounts!: Table<Account, string>;
  assets!: Table<Asset, string>;
  portfolios!: Table<Portfolio, string>;
  transactions!: Table<Transaction, string>;
  stakingRules!: Table<StakingRule, string>;
  yieldAccruals!: Table<YieldAccrual, string>;
  watchlist!: Table<WatchlistEntry, string>;
  priceCache!: Table<PriceCache, string>;
  fxRateCache!: Table<FxRateCache, string>;

  constructor() {
    super('portfolio_tracker');

    this.version(1).stores({
      accounts: 'id, name, kind, tag, archivedAt',
      assets: 'id, &[type+ticker], type, ticker, coingeckoId',
      portfolios: 'id, bucket, isDefault',
      transactions:
        'id, date, accountId, portfolioId, assetId, kind, [assetId+accountId+portfolioId]',
      stakingRules: 'id, assetId, accountId, portfolioId, active',
      yieldAccruals: 'id, ruleId, txId',
      watchlist: 'id, &assetId',
      priceCache: 'assetId, fetchedAt',
      fxRateCache: 'kind, fetchedAt',
    });
  }
}

export const db = new PortfolioDB();
