/**
 * Hooks de polling que combinan `useQuery` (TanStack) + escritura a Dexie.
 *
 * Patrón: TanStack se encarga del lifecycle (interval, retry, dedup), y un
 * `useEffect` espejo escribe a IndexedDB al ver `data`. Las pantallas leen
 * desde Dexie via `useLiveQuery`, así no acoplamos UI al status de la query
 * — si el fetch falla, sigue mostrando el último cache.
 *
 * Por qué no `onSuccess`: TanStack Query v5 deprecó callbacks por query.
 * El `useEffect` con `[data]` es el camino oficial.
 *
 * Por qué un solo poller (no uno por componente): mantenerlo en un nodo
 * raíz (`<Pollers/>` en App) garantiza una llamada cada 30s sin importar
 * cuántas pantallas estén montadas. La cache global de TanStack desduplica
 * llamadas si igual se montan dos.
 */

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db/schema';
import { useAssets } from '@/lib/db/queries';
import { useFx } from '@/lib/db/derived';
import { fetchDolarRates, type FxQuote } from './dolar';
import { fetchCryptoPrices, type CryptoQuote } from './coingecko';
import { fetchUnderlyingPrices, type UnderlyingQuote } from './twelvedata';
import type { Asset } from '@/lib/types';
import type { FxView } from '@/lib/holdings';

// ─── FX (DolarAPI) ─────────────────────────────────────────────────────────

const FX_REFETCH_MS = 60_000; // FX no cambia segundo a segundo — 60s alcanza
// CoinGecko free tier rate-limita ~10-30 req/min. Con 4 cryptos en una sola
// llamada batched, 60s da margen suficiente y sigue siendo "casi en vivo".
// SPEC §6 pedía 30s pero el free tier lo bloquea con 429s intermitentes.
const PRICE_REFETCH_MS = 60_000;

/**
 * Pollea DolarAPI cada 60s y guarda los resultados en `db.fxRateCache`.
 * Devuelve el status de la query por si el caller quiere mostrar un indicador.
 */
export function usePollFx() {
  const q = useQuery({
    queryKey: ['fx', 'dolarapi'],
    queryFn: fetchDolarRates,
    refetchInterval: FX_REFETCH_MS,
    refetchIntervalInBackground: true, // mobile congela tabs fácilmente; seguimos polleando
    staleTime: FX_REFETCH_MS / 2,
    retry: 2,
  });

  useEffect(() => {
    if (!q.data) return;
    void writeFxToCache(q.data);
  }, [q.data]);

  return q;
}

async function writeFxToCache(rows: FxQuote[]): Promise<void> {
  const records = rows.map((r) => ({
    kind: r.kind,
    buy: r.buy,
    sell: r.sell,
    fetchedAt: r.fetchedAt,
  }));
  await db.fxRateCache.bulkPut(records);
}

// ─── Crypto (CoinGecko) ────────────────────────────────────────────────────

/**
 * Pollea CoinGecko cada 30s para los assets de tipo `crypto` que tengan
 * `coingeckoId`. Si no hay assets crypto cargados, no dispara el fetch.
 *
 * El query key incluye los IDs ordenados, así que cualquier cambio en la
 * lista de assets re-ejecuta el fetch en lugar de devolver cache stale.
 */
export function usePollCryptoPrices() {
  const assets = useAssets();
  const cryptoAssets = (assets ?? []).filter(
    (a) => a.type === 'crypto' && a.coingeckoId,
  );
  const ids = cryptoAssets.map((a) => a.coingeckoId!).sort();

  const q = useQuery({
    queryKey: ['prices', 'crypto', ids],
    queryFn: () => fetchCryptoPrices(ids),
    enabled: ids.length > 0,
    refetchInterval: PRICE_REFETCH_MS,
    refetchIntervalInBackground: true,
    staleTime: PRICE_REFETCH_MS / 2,
    retry: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!q.data || cryptoAssets.length === 0) return;
    void writeCryptoToPriceCache(q.data, cryptoAssets);
  }, [q.data, cryptoAssets]);

  return q;
}

async function writeCryptoToPriceCache(
  quotes: CryptoQuote[],
  assets: Array<{ id: string; coingeckoId?: string }>,
): Promise<void> {
  // CoinGecko devuelve por coingeckoId; en Dexie el PK es nuestro asset.id.
  // Construir el reverse lookup una sola vez.
  const byCgId = new Map<string, string>();
  for (const a of assets) {
    if (a.coingeckoId) byCgId.set(a.coingeckoId, a.id);
  }

  // Spark preservation: `simple/price` no trae sparkline. Si en el futuro
  // agregamos un poller de market_chart que llene `spark` con datos reales,
  // lo preservamos acá (no lo pisamos con `undefined`). Hoy spark queda
  // undefined hasta que ese poller exista — preferimos no mostrar nada
  // antes que un placeholder PRNG inventado.
  const ids = quotes.map((q) => byCgId.get(q.coingeckoId)).filter((x): x is string => !!x);
  const existing = await db.priceCache.bulkGet(ids);
  const sparkById = new Map<string, number[] | undefined>();
  existing.forEach((row, i) => sparkById.set(ids[i], row?.spark));

  const records = quotes
    .map((q) => {
      const assetId = byCgId.get(q.coingeckoId);
      if (!assetId) return null;
      return {
        assetId,
        price: q.priceUSD,
        currency: 'USD' as const,
        ch24Pct: q.ch24Pct,
        spark: sparkById.get(assetId), // preserva spark real si existe
        fetchedAt: q.fetchedAt,
        source: 'coingecko',
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (records.length === 0) return;
  await db.priceCache.bulkPut(records);
}

// ─── Underlying USA stocks (Twelve Data) — para CEDEARs/ETFs ──────────────

/**
 * Frecuencia de polling para precios subyacentes. Más espaciado que cripto
 * porque:
 *  - Free tier de Twelve Data tiene 8 req/min de límite.
 *  - Los precios de NYSE/NASDAQ no cambian segundo a segundo en horario ARG
 *    (el mercado USA cierra a las 18hs ARG).
 *  - Una sola llamada batched cubre todos los CEDEARs.
 */
const UNDERLYING_REFETCH_MS = 60_000; // 1 min

/**
 * Pollea Twelve Data para los tickers subyacentes de los CEDEARs/ETFs del
 * usuario, y deriva el precio del CEDEAR en ARS usando el CCL actual.
 *
 * Fórmula (SPEC §4.2): precio_cedear_ARS = precio_subyacente_USD × CCL / ratio
 *
 * Si la API falla (rate limit, key inválida) el precio del seed se mantiene
 * — la app no rompe, solo no se actualiza ese tipo de activo.
 */
export function usePollUnderlyingPrices() {
  const assets = useAssets();
  const fx = useFx();

  // Activos que NECESITAN un fetch al subyacente: CEDEAR (con underlyingTicker
  // y cedearRatio) + ETF (que cotizan en USD). Excluímos crypto/bonos/fondos.
  const targets = useMemo<Array<{ asset: Asset; ticker: string }>>(() => {
    if (!assets) return [];
    const out: Array<{ asset: Asset; ticker: string }> = [];
    for (const a of assets) {
      if (a.type === 'cedear' && a.underlyingTicker) {
        out.push({ asset: a, ticker: a.underlyingTicker });
      } else if (a.type === 'etf') {
        out.push({ asset: a, ticker: a.ticker });
      }
    }
    return out;
  }, [assets]);

  const tickers = useMemo(() => targets.map((t) => t.ticker).sort(), [targets]);

  const q = useQuery({
    queryKey: ['prices', 'underlying', tickers],
    queryFn: () => fetchUnderlyingPrices(tickers),
    enabled: tickers.length > 0,
    refetchInterval: UNDERLYING_REFETCH_MS,
    refetchIntervalInBackground: true,
    staleTime: UNDERLYING_REFETCH_MS / 2,
    retry: 1,
  });

  useEffect(() => {
    if (!q.data || targets.length === 0) return;
    void writeUnderlyingsToCache(q.data, targets, fx);
  }, [q.data, targets, fx]);

  return q;
}

/**
 * Escribe los precios derivados a priceCache. Para cada target:
 *  - Si es CEDEAR: price_ARS = underlying_USD × CCL / ratio  (currency='ARS')
 *  - Si es ETF: price_USD = underlying_USD                  (currency='USD')
 *
 * En ambos casos guardamos `underlyingUSD` para que el UI lo muestre.
 *
 * Preserva spark previo (twelvedata `/quote` no trae sparkline; histórico
 * está en otro endpoint que se llama on-demand desde el chart).
 */
async function writeUnderlyingsToCache(
  quotes: UnderlyingQuote[],
  targets: Array<{ asset: Asset; ticker: string }>,
  fx: FxView,
): Promise<void> {
  // Reverse map: ticker → asset (puede haber múltiples, ej. CEDEAR + ETF
  // del mismo símbolo, pero por ahora asumimos 1:1 por ticker).
  const byTicker = new Map<string, Asset>();
  for (const { ticker, asset } of targets) {
    byTicker.set(ticker.toUpperCase(), asset);
  }

  const assetIds = quotes
    .map((q) => byTicker.get(q.ticker.toUpperCase())?.id)
    .filter((x): x is string => !!x);
  const existing = await db.priceCache.bulkGet(assetIds);
  const sparkById = new Map<string, number[] | undefined>();
  existing.forEach((row, i) => sparkById.set(assetIds[i], row?.spark));

  const records = quotes
    .map((q) => {
      const asset = byTicker.get(q.ticker.toUpperCase());
      if (!asset) return null;

      let price: number;
      let currency: 'ARS' | 'USD';
      if (asset.cedearRatio && asset.currency === 'ARS') {
        // CEDEAR o ETF con ratio y cotización en ARS (ej. IBIT, SPY en BYMA).
        // Fórmula: precio_CDR_ARS = subyacente_USD × CCL / ratio
        price = (q.priceUSD * fx.ccl) / asset.cedearRatio;
        currency = 'ARS';
      } else if (asset.type === 'cedear' || asset.type === 'etf') {
        // ETF sin ratio o CEDEAR sin ratio configurado: usar precio en USD.
        price = q.priceUSD;
        currency = 'USD';
      } else {
        return null;
      }

      return {
        assetId: asset.id,
        price,
        currency,
        ch24Pct: q.ch24Pct,
        spark: sparkById.get(asset.id),
        fetchedAt: q.fetchedAt,
        source: 'twelvedata',
        underlyingUSD: q.priceUSD,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (records.length === 0) return;
  await db.priceCache.bulkPut(records);
}
