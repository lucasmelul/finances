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
 * Modos de importación:
 *  - `replace`: borra todo antes de insertar. Útil para "empezar de cero"
 *    con un backup nuevo. Evita cualquier conflicto de índices únicos.
 *  - `merge`: conserva los datos existentes y sobreescribe solo los que
 *    vienen en el backup (upsert por ID). Para assets resuelve el conflicto
 *    del índice único `[type+ticker]` eliminando previamente el registro
 *    anterior si tiene un ID distinto.
 */
export type ImportMode = 'replace' | 'merge';

export async function importDatabase(
  data: unknown,
  mode: ImportMode = 'replace',
): Promise<{ imported: number }> {
  const dump = validate(data);
  const { accounts, assets, transactions, stakingRules, yieldAccruals, watchlist } = dump;
  const { priceCache = [] } = dump;
  let imported = 0;

  await db.transaction(
    'rw',
    [db.accounts, db.assets, db.transactions, db.stakingRules, db.yieldAccruals, db.watchlist, db.priceCache],
    async () => {
      if (mode === 'replace') {
        // Limpiar todo primero — sin conflictos posibles.
        await Promise.all([
          db.accounts.clear(),
          db.assets.clear(),
          db.transactions.clear(),
          db.stakingRules.clear(),
          db.yieldAccruals.clear(),
          db.watchlist.clear(),
          db.priceCache.clear(),
        ]);
        if (accounts.length)     { await db.accounts.bulkAdd(accounts);        imported += accounts.length; }
        if (assets.length)       { await db.assets.bulkAdd(assets);            imported += assets.length; }
        if (transactions.length) { await db.transactions.bulkAdd(transactions); imported += transactions.length; }
        if (stakingRules.length) { await db.stakingRules.bulkAdd(stakingRules); imported += stakingRules.length; }
        if (yieldAccruals.length){ await db.yieldAccruals.bulkAdd(yieldAccruals); imported += yieldAccruals.length; }
        if (watchlist.length)    { await db.watchlist.bulkAdd(watchlist);      imported += watchlist.length; }
        if (priceCache.length)   { await db.priceCache.bulkAdd(priceCache);    imported += priceCache.length; }
      } else {
        // Merge: upsert por ID. Para assets, primero resolver conflictos
        // del índice único [type+ticker]: si ya existe un asset con el mismo
        // (type, ticker) pero distinto ID, lo borramos antes del bulkPut.
        if (assets.length) {
          for (const asset of assets) {
            const conflict = await db.assets
              .where('[type+ticker]')
              .equals([asset.type, asset.ticker])
              .first();
            if (conflict && conflict.id !== asset.id) {
              await db.assets.delete(conflict.id);
            }
          }
          await db.assets.bulkPut(assets);
          imported += assets.length;
        }
        if (accounts.length)     { await db.accounts.bulkPut(accounts);        imported += accounts.length; }
        if (transactions.length) { await db.transactions.bulkPut(transactions); imported += transactions.length; }
        if (stakingRules.length) { await db.stakingRules.bulkPut(stakingRules); imported += stakingRules.length; }
        if (yieldAccruals.length){ await db.yieldAccruals.bulkPut(yieldAccruals); imported += yieldAccruals.length; }
        if (watchlist.length)    { await db.watchlist.bulkPut(watchlist);      imported += watchlist.length; }
        if (priceCache.length)   { await db.priceCache.bulkPut(priceCache);    imported += priceCache.length; }
      }
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
