/**
 * Cliente Twelve Data — precios spot de US stocks / ETFs.
 *
 * Usado para CEDEARs (necesitamos el precio del subyacente en NASDAQ/NYSE
 * para derivar el "fair value" del CEDEAR en ARS, ver SPEC §4.2 / §6).
 *
 * Endpoint multi-símbolo en una sola llamada:
 *   /quote?symbol=AAPL,MSFT,NVDA&apikey=KEY
 *
 * CORS: ✓ permisivo, funciona desde browser.
 *
 * API key:
 *  - Default: `demo` (limitado, solo para desarrollo).
 *  - Override via `VITE_TWELVEDATA_KEY` en `.env.local` para uso real.
 *  - Free tier: 800 calls/día, 8 calls/min.
 *
 * Si la API falla (rate limit, key inválida, red), el caller cae al precio
 * del seed — no rompe la app.
 */

const ENDPOINT = 'https://api.twelvedata.com/quote';

function getApiKey(): string {
  return import.meta.env.VITE_TWELVEDATA_KEY ?? 'demo';
}

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface QuoteRow {
  symbol: string;
  /** Último precio cerrado (para after-hours es el cierre regular). */
  close: string;
  previous_close?: string;
  percent_change?: string;
  /** Marca de tiempo del último quote, unix seconds. */
  timestamp?: number;
}

/**
 * Respuesta multi-símbolo: objeto keyed por symbol cuando hay varios,
 * objeto plano cuando es uno solo. Normalizamos.
 */
type MultiQuoteResponse = QuoteRow | Record<string, QuoteRow>;

export interface UnderlyingQuote {
  ticker: string; // ej. "AAPL"
  priceUSD: number;
  ch24Pct?: number;
  providerUpdatedAt: string;
  fetchedAt: string;
}

// ─── Fetch ─────────────────────────────────────────────────────────────────

/**
 * Trae quotes para una lista de tickers US. Devuelve solo los que parsean OK.
 * Si la lista está vacía → no hace request.
 *
 * El endpoint a veces devuelve `code` y `message` cuando hay error (rate limit,
 * key inválida) — lo detectamos y throw para que TanStack Query haga backoff.
 */
export async function fetchUnderlyingPrices(
  tickers: string[],
): Promise<UnderlyingQuote[]> {
  if (tickers.length === 0) return [];

  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const params = new URLSearchParams({
    symbol: unique.join(','),
    apikey: getApiKey(),
  });
  const url = `${ENDPOINT}?${params}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Twelve Data ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as MultiQuoteResponse | { code: number; message: string };

  // Detección de error wrapper
  if ('code' in json && typeof json.code === 'number' && json.code >= 400) {
    throw new Error(`Twelve Data API: ${json.message ?? 'unknown error'}`);
  }

  const fetchedAt = new Date().toISOString();
  const out: UnderlyingQuote[] = [];

  // Single-symbol: { symbol, close, ... }
  // Multi-symbol: { AAPL: { ... }, MSFT: { ... } }
  const isMulti = !('symbol' in (json as QuoteRow)) || unique.length > 1;
  const entries = isMulti
    ? Object.entries(json as Record<string, QuoteRow>)
    : ([[(json as QuoteRow).symbol, json as QuoteRow]] as Array<[string, QuoteRow]>);

  for (const [key, row] of entries) {
    if (!row || typeof row !== 'object') continue;
    const closeNum = parseFloat(row.close);
    if (!isFinite(closeNum)) continue;
    const ts =
      typeof row.timestamp === 'number'
        ? new Date(row.timestamp * 1000).toISOString()
        : fetchedAt;
    const ch24 = row.percent_change ? parseFloat(row.percent_change) : undefined;
    out.push({
      ticker: (row.symbol ?? key).toUpperCase(),
      priceUSD: closeNum,
      ch24Pct: isFinite(ch24 ?? NaN) ? ch24 : undefined,
      providerUpdatedAt: ts,
      fetchedAt,
    });
  }
  return out;
}
