/**
 * Export / Import de la base de datos completa en JSON.
 *
 * Solo exportamos datos del usuario (accounts, assets, transactions,
 * stakingRules, yieldAccruals, watchlist). Omitimos caches (priceCache,
 * fxRateCache, priceHistoryCache) porque se regeneran solos del polling.
 *
 * El formato es un JSON plano con un campo por tabla:
 * {
 *   version: 1,
 *   exportedAt: "ISO",
 *   accounts: [...],
 *   assets: [...],
 *   transactions: [...],
 *   stakingRules: [...],
 *   yieldAccruals: [...],
 *   watchlist: [...],
 * }
 */

import { db } from './schema';
import type {
  Account,
  Asset,
  PriceCache,
  Transaction,
  StakingRule,
  WatchlistEntry,
  YieldAccrual,
} from '@/lib/types';

const EXPORT_VERSION = 1;

export interface DbExport {
  version: number;
  exportedAt: string;
  accounts: Account[];
  assets: Asset[];
  transactions: Transaction[];
  stakingRules: StakingRule[];
  yieldAccruals: YieldAccrual[];
  watchlist: WatchlistEntry[];
  /** Precios iniciales opcionales — útil para activos sin feed automático (cash). */
  priceCache?: PriceCache[];
}

export async function exportDatabase(): Promise<DbExport> {
  const [accounts, assets, transactions, stakingRules, yieldAccruals, watchlist] =
    await Promise.all([
      db.accounts.toArray(),
      db.assets.toArray(),
      db.transactions.toArray(),
      db.stakingRules.toArray(),
      db.yieldAccruals.toArray(),
      db.watchlist.toArray(),
    ]);

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    accounts,
    assets,
    transactions,
    stakingRules,
    yieldAccruals,
    watchlist,
  };
}

/** Descarga el JSON como archivo en el navegador. */
export function downloadAsJson(data: DbExport): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `portfolio-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Importa un DbExport al IndexedDB.
 * Estrategia "merge upsert": si un ID ya existe, se sobreescribe.
 * No borra datos existentes que NO estén en el backup.
 *
 * Para un "restore completo" el caller debería hacer resetToClean() primero.
 */
export async function importDatabase(data: unknown): Promise<{ imported: number }> {
  const dump = validate(data);
  const { accounts, assets, transactions, stakingRules, yieldAccruals, watchlist } = dump;
  let imported = 0;

  const { priceCache = [] } = dump;

  await db.transaction(
    'rw',
    [db.accounts, db.assets, db.transactions, db.stakingRules, db.yieldAccruals, db.watchlist, db.priceCache],
    async () => {
      if (accounts.length) { await db.accounts.bulkPut(accounts); imported += accounts.length; }
      if (assets.length) { await db.assets.bulkPut(assets); imported += assets.length; }
      if (transactions.length) { await db.transactions.bulkPut(transactions); imported += transactions.length; }
      if (stakingRules.length) { await db.stakingRules.bulkPut(stakingRules); imported += stakingRules.length; }
      if (yieldAccruals.length) { await db.yieldAccruals.bulkPut(yieldAccruals); imported += yieldAccruals.length; }
      if (watchlist.length) { await db.watchlist.bulkPut(watchlist); imported += watchlist.length; }
      if (priceCache.length) { await db.priceCache.bulkPut(priceCache); imported += priceCache.length; }
    },
  );

  return { imported };
}

function validate(data: unknown): DbExport {
  if (!data || typeof data !== 'object') throw new Error('El archivo no es un JSON válido.');
  const d = data as DbExport;
  if (d.version !== EXPORT_VERSION) {
    throw new Error(
      `Versión de backup incompatible (esperada: ${EXPORT_VERSION}, recibida: ${(data as Record<string, unknown>).version ?? '?'}).`,
    );
  }
  if (!Array.isArray(d.accounts)) throw new Error('Backup inválido: falta campo "accounts".');
  if (!Array.isArray(d.transactions)) throw new Error('Backup inválido: falta campo "transactions".');
  // priceCache es opcional — si viene, debe ser array
  if (d.priceCache !== undefined && !Array.isArray(d.priceCache)) {
    throw new Error('Backup inválido: campo "priceCache" debe ser un array.');
  }
  return d;
}

/** Lee un File y parsea el JSON. */
export async function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(JSON.parse(e.target?.result as string));
      } catch {
        reject(new Error('El archivo no es un JSON válido.'));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo.'));
    reader.readAsText(file);
  });
}
