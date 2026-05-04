/**
 * Bootstrap del primer arranque.
 *
 * Modos:
 *  - **demo** (default): siembra carteras + assets + cuentas + holdings + tx
 *    de ejemplo del DESIGN_BRIEF. Útil para explorar la app sin cargar nada.
 *  - **clean**: siembra solo carteras y catálogo de assets (sin cuentas, sin
 *    holdings, sin tx). El usuario empieza desde cero. Lo eligen explícitamente
 *    desde Settings.
 *
 * El modo se persiste en localStorage (`portfolio.bootstrap-mode`) para que
 * sobreviva a `db.delete()` (la DB se borra, el flag queda).
 *
 * `bootstrap()` corre auto en cada arranque y respeta el modo guardado. Si
 * la DB ya tiene portfolios, no hace nada (idempotente).
 */

import { db } from '@/lib/db/schema';
import { defaultPortfolios, portfolioIdForBucket } from '@/data/portfolios';
import {
  SEED_ACCOUNTS,
  SEED_ASSETS,
  SEED_HOLDINGS,
  SEED_PRICE_CACHE,
  SEED_RECENT_TX,
  seedHoldingAsTransaction,
} from '@/data/seed';
import type { Transaction } from '@/lib/types';

// ─── Modo de bootstrap ─────────────────────────────────────────────────────

export type BootstrapMode = 'demo' | 'clean';

const MODE_KEY = 'portfolio.bootstrap-mode';

export function getBootstrapMode(): BootstrapMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'clean' ? 'clean' : 'demo';
  } catch {
    return 'demo';
  }
}

export function setBootstrapMode(mode: BootstrapMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // localStorage puede estar bloqueado (Safari privado). Ignoramos.
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function isFreshDatabase(): Promise<boolean> {
  const count = await db.portfolios.count();
  return count === 0;
}

function recentTxToTransaction(
  raw: (typeof SEED_RECENT_TX)[number],
  createdAt: string,
): Transaction {
  const inARS = raw.priceARS != null;
  const unitPrice = raw.kind === 'yield' ? 0 : inARS ? raw.priceARS! : raw.priceUSD!;
  const priceCurrency = inARS ? 'ARS' : 'USD';

  return {
    id: raw.id,
    kind: raw.kind,
    date: raw.date,
    accountId: raw.accountId,
    portfolioId: portfolioIdForBucket(raw.bucket),
    assetId: raw.assetId,
    qty: raw.qty,
    unitPrice,
    priceCurrency,
    notes: raw.note,
    source: 'import',
    createdAt,
  };
}

// ─── Seed demo (datos de muestra completos) ────────────────────────────────

async function seedDemoData(): Promise<void> {
  const now = new Date().toISOString();
  const portfolios = defaultPortfolios(now);

  const holdingTxs: Transaction[] = SEED_HOLDINGS.map((h) =>
    seedHoldingAsTransaction(h, portfolioIdForBucket(h.bucket)),
  );
  const recentTxs: Transaction[] = SEED_RECENT_TX.map((t) =>
    recentTxToTransaction(t, now),
  );

  await db.transaction(
    'rw',
    [db.portfolios, db.accounts, db.assets, db.transactions, db.priceCache],
    async () => {
      await db.portfolios.bulkPut(portfolios);
      await db.accounts.bulkPut(SEED_ACCOUNTS);
      await db.assets.bulkPut(SEED_ASSETS);
      await db.transactions.bulkPut([...holdingTxs, ...recentTxs]);
      await db.priceCache.bulkPut(SEED_PRICE_CACHE);
    },
  );
}

// ─── Seed clean (solo carteras + catálogo de assets) ───────────────────────

async function seedCleanState(): Promise<void> {
  const now = new Date().toISOString();
  const portfolios = defaultPortfolios(now);

  // Catálogo de assets: lo necesitamos para que el chat / search reconozcan
  // tickers. Pero NO sembramos cuentas, holdings ni tx — el usuario los carga.
  await db.transaction(
    'rw',
    [db.portfolios, db.assets],
    async () => {
      await db.portfolios.bulkPut(portfolios);
      await db.assets.bulkPut(SEED_ASSETS);
    },
  );
}

// ─── Bootstrap auto ────────────────────────────────────────────────────────

/**
 * Siembra la DB si está vacía, según el modo guardado en localStorage.
 * Idempotente: si ya hay portfolios, no toca.
 *
 * Devuelve `true` si efectivamente sembró algo.
 */
export async function bootstrap(): Promise<boolean> {
  if (!(await isFreshDatabase())) return false;

  const mode = getBootstrapMode();
  if (mode === 'clean') {
    await seedCleanState();
  } else {
    await seedDemoData();
  }
  return true;
}

// ─── Reset funciones (para Settings) ───────────────────────────────────────

/**
 * Borra TODO y re-siembra con datos de demo. Mantiene `mode = 'demo'`.
 */
export async function resetToDemo(): Promise<void> {
  setBootstrapMode('demo');
  await db.delete();
  await db.open();
  await seedDemoData();
}

/**
 * Borra TODO y deja la DB con solo carteras + catálogo de assets.
 * El modo queda como 'clean' — al recargar, `bootstrap()` no re-siembra demo.
 */
export async function resetToClean(): Promise<void> {
  setBootstrapMode('clean');
  await db.delete();
  await db.open();
  await seedCleanState();
}

// Backwards-compat: el nombre viejo apunta al reset demo.
export const resetDatabase = resetToDemo;
