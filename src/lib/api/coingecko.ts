/**
 * Cliente CoinGecko — precios spot + variación 24h + histórico para criptos.
 *
 * Endpoints públicos (sin API key, con CORS):
 *   /api/v3/simple/price          — precios actuales (spot)
 *   /api/v3/coins/{id}/market_chart — histórico de precios (para charts)
 *
 * Rate limits del free tier (~10-30 req/min). El polling 30s sobre 4 coins
 * en una llamada batched cae muy por debajo. El histórico se llama on-demand
 * (al abrir Asset detail), una llamada por cambio de período.
 */

// ─── Tipos ─────────────────────────────────────────────────────────────────

/** Shape que devuelve CoinGecko. Las claves son los `ids` que pediste. */
interface CoinGeckoSimplePriceResponse {
  [coingeckoId: string]: {
    usd: number;
    usd_24h_change?: number;
    last_updated_at?: number; // unix seconds
  };
}

export interface CryptoQuote {
  coingeckoId: string;
  /** Precio en USD. */
  priceUSD: number;
  /** Variación porcentual 24h. */
  ch24Pct?: number;
  /** Marca de tiempo del proveedor. */
  providerUpdatedAt: string;
  /** Marca local del fetch. */
  fetchedAt: string;
}

// ─── Fetch ─────────────────────────────────────────────────────────────────

const ENDPOINT = 'https://api.coingecko.com/api/v3/simple/price';

/**
 * Trae precios para una lista de coingeckoIds. Devuelve solo los IDs que
 * existen en la respuesta (CoinGecko silenciosamente ignora ids inválidos).
 *
 * Si el array de input está vacío, retornamos rápido sin pegar al endpoint
 * — útil cuando aún no se cargaron los assets de Dexie.
 */
export async function fetchCryptoPrices(ids: string[]): Promise<CryptoQuote[]> {
  if (ids.length === 0) return [];

  // Dedup defensivo — si dos assets comparten coingeckoId (no debería), una
  // sola llamada al endpoint los cubre.
  const unique = [...new Set(ids)];
  const params = new URLSearchParams({
    ids: unique.join(','),
    vs_currencies: 'usd',
    include_24hr_change: 'true',
    include_last_updated_at: 'true',
  });
  const url = `${ENDPOINT}?${params.toString()}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    // 429 = rate limit — TanStack Query va a hacer backoff.
    throw new Error(`CoinGecko ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as CoinGeckoSimplePriceResponse;

  const fetchedAt = new Date().toISOString();
  const out: CryptoQuote[] = [];
  for (const id of unique) {
    const entry = json[id];
    if (!entry || typeof entry.usd !== 'number') continue;
    const ts =
      typeof entry.last_updated_at === 'number'
        ? new Date(entry.last_updated_at * 1000).toISOString()
        : fetchedAt;
    out.push({
      coingeckoId: id,
      priceUSD: entry.usd,
      ch24Pct: entry.usd_24h_change,
      providerUpdatedAt: ts,
      fetchedAt,
    });
  }
  return out;
}

// ─── Histórico ─────────────────────────────────────────────────────────────

/**
 * Períodos soportados por el endpoint `market_chart` de CoinGecko.
 * - `1` día → granularidad 5m (288 puntos)
 * - `7` días → granularidad ~horaria
 * - `30` días → granularidad horaria
 * - `90` / `365` / `max` → granularidad diaria
 *
 * Mapping del período de UI a `days`:
 */
export type ChartPeriod = '1D' | '1W' | '1M' | '3M' | '1Y' | 'All';

const DAYS_FOR_PERIOD: Record<ChartPeriod, number | 'max'> = {
  '1D': 1,
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '1Y': 365,
  All: 'max',
};

interface CoinGeckoMarketChartResponse {
  /** [timestamp_ms, price_usd][] */
  prices: Array<[number, number]>;
  market_caps: Array<[number, number]>;
  total_volumes: Array<[number, number]>;
}

export interface PriceHistoryPoint {
  timestamp: number; // unix ms
  price: number; // USD
}

/**
 * Trae el histórico de precios de un coin para el período pedido.
 * Devuelve solo `[timestamp, price]` — descartamos market cap/volume porque
 * no los usamos en el chart.
 *
 * Para reducir puntos en períodos largos (1Y, All) podríamos downsamplear,
 * pero el endpoint ya envía granularidad apropiada → no hace falta.
 */
export async function fetchCryptoHistory(
  coingeckoId: string,
  period: ChartPeriod,
): Promise<PriceHistoryPoint[]> {
  const days = DAYS_FOR_PERIOD[period];
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coingeckoId)}/market_chart?vs_currency=usd&days=${days}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`CoinGecko history ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as CoinGeckoMarketChartResponse;
  if (!Array.isArray(json.prices)) {
    throw new Error('CoinGecko devolvió shape inesperado en market_chart');
  }
  return json.prices.map(([ts, price]) => ({ timestamp: ts, price }));
}
