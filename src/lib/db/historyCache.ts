/**
 * Cache de histórico de precios en IndexedDB.
 *
 * Patrón cache-aside:
 *  1. Read: Dexie primero. Si tiene < TTL, devolvemos sin pegarle al provider.
 *  2. Miss/stale: fetch al provider, persistir, devolver.
 *
 * Diferencia con TanStack Query (que ya cachea en memoria):
 *  - Persistencia → sobrevive a reload duro y a cierre de tab.
 *  - Trans-tab → si el user abre dos tabs, ambas comparten cache.
 *  - Reduce 50%+ de calls a CoinGecko en uso normal (free tier ~10 req/min).
 */

import { db } from './schema';
import {
  fetchCryptoHistory,
  type ChartPeriod,
  type PriceHistoryPoint,
} from '@/lib/api/coingecko';

/** TTL del cache. 6h alcanza para SR (percentile 90 días casi no varía hora a hora). */
const TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Lee el histórico desde Dexie si está fresco. `null` si no existe; `null`
 * también si está expirado (TTL pasado) — el caller debe re-fetch.
 */
export async function loadCachedHistory(
  assetId: string,
  period: ChartPeriod,
): Promise<PriceHistoryPoint[] | null> {
  const row = await db.priceHistoryCache.get([assetId, period]);
  if (!row) return null;
  const age = Date.now() - new Date(row.fetchedAt).getTime();
  if (age > TTL_MS) return null;
  return row.points;
}

/** Persiste el histórico para `(assetId, period)`. Sobrescribe si existía. */
export async function saveCachedHistory(
  assetId: string,
  period: ChartPeriod,
  points: PriceHistoryPoint[],
  source = 'coingecko',
): Promise<void> {
  await db.priceHistoryCache.put({
    assetId,
    period,
    points,
    fetchedAt: new Date().toISOString(),
    source,
  });
}

/**
 * Single entry point: pide histórico, sirviendo del cache si está fresco.
 * Si el fetch falla y hay cache stale, devolvemos el stale (mejor mostrar
 * algo que nada ante un rate limit de CoinGecko).
 */
export async function fetchAndCacheHistory(
  assetId: string,
  coingeckoId: string,
  period: ChartPeriod,
): Promise<PriceHistoryPoint[]> {
  const cached = await loadCachedHistory(assetId, period);
  if (cached) return cached;

  try {
    const fresh = await fetchCryptoHistory(coingeckoId, period);
    await saveCachedHistory(assetId, period, fresh);
    return fresh;
  } catch (err) {
    // Last-resort: si tenemos cache stale (más viejo que TTL pero existe),
    // devolverlo igual. Mejor un SR de hace 12h que no mostrar nada.
    const stale = await db.priceHistoryCache.get([assetId, period]);
    if (stale) {
      console.warn(
        `[historyCache] CoinGecko falló para ${assetId}/${period}, sirviendo stale`,
        err,
      );
      return stale.points;
    }
    throw err;
  }
}
