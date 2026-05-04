/**
 * Búsqueda global de activos. Combina:
 *  1. **Catálogo local** (assets ya cargados en Dexie) — match por ticker/nombre.
 *  2. **CEDEARs** (seed estático en `data/cedears.ts`).
 *  3. **CoinGecko** (`/search`) para criptos no cargadas.
 *  4. **Twelve Data** (`/symbol_search`) para stocks/ETFs USA — opcional, requiere
 *     API key configurada; si no, omitimos esta fuente (el resto sigue andando).
 *
 * Diseño:
 *  - El caller llama `searchAssets(query, opts)` y recibe una lista unificada.
 *  - Cada resultado lleva `source` para que la UI distinga "ya tenés" vs "agregar".
 *  - Si una fuente externa falla, ignoramos el error de esa fuente (no rompemos
 *    la búsqueda completa). Errors van por console, no por throw.
 *  - Debounce lo hace el caller (hook), no este módulo — separa concerns.
 */

import type { Asset, AssetType } from '@/lib/types';
import { CEDEARS } from '@/data/cedears';

// ─── Tipos de salida ───────────────────────────────────────────────────────

export type AssetSearchSource = 'local' | 'cedear-seed' | 'coingecko' | 'twelvedata';

export interface AssetSearchResult {
  /** ID estable: si es local, el id del Asset; si es externo, el ticker/coingeckoId. */
  id: string;
  ticker: string;
  name: string;
  type: AssetType;
  source: AssetSearchSource;
  /** Si ya está cargado en Dexie, este flag es true. UI: chip "ya lo tenés". */
  alreadyInLibrary: boolean;
  /** Logo emoji/letra para placeholder. Si la fuente externa no trae, usa la 1ra letra. */
  logo?: string;
  logoBg?: string;
  /** Coingecko ID para criptos (necesario para alta posterior). */
  coingeckoId?: string;
  /** Para CEDEARs: ratio + ticker subyacente. */
  cedearRatio?: number;
  underlyingTicker?: string;
}

export interface SearchOptions {
  /** Lista actual de assets en Dexie para detectar `alreadyInLibrary`. */
  localAssets: Asset[];
  /** Solo buscar tipos específicos (ej. solo crypto). Default = todos. */
  types?: AssetType[];
  /** Límite total de resultados. */
  limit?: number;
  /** Saltear fuentes externas (modo offline / tests). */
  localOnly?: boolean;
  /** AbortSignal para cancelar fetches in-flight si el query cambia. */
  signal?: AbortSignal;
}

// ─── Búsqueda ──────────────────────────────────────────────────────────────

const COINGECKO_SEARCH = 'https://api.coingecko.com/api/v3/search';
const TWELVEDATA_SEARCH = 'https://api.twelvedata.com/symbol_search';

function getTwelveKey(): string | undefined {
  const k = import.meta.env.VITE_TWELVEDATA_KEY;
  return k && k !== 'demo' ? k : undefined;
}

/**
 * Ejecuta la búsqueda. Devuelve resultados ordenados por:
 *  1. local first (lo que ya tenés)
 *  2. CEDEARs del seed (catalog AR)
 *  3. APIs externas
 * Y dentro de cada bucket, por exact match de ticker.
 */
export async function searchAssets(
  query: string,
  opts: SearchOptions,
): Promise<AssetSearchResult[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const limit = opts.limit ?? 20;
  const types = opts.types ? new Set(opts.types) : null;

  const out: AssetSearchResult[] = [];
  const seenKeys = new Set<string>(); // dedup por (type+ticker)

  // 1. Local
  for (const a of opts.localAssets) {
    if (!matches(a.ticker, a.name, q)) continue;
    if (types && !types.has(a.type)) continue;
    const key = `${a.type}|${a.ticker.toUpperCase()}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push({
      id: a.id,
      ticker: a.ticker,
      name: a.name,
      type: a.type,
      source: 'local',
      alreadyInLibrary: true,
      logo: a.logo,
      logoBg: a.logoBg,
      coingeckoId: a.coingeckoId,
      cedearRatio: a.cedearRatio,
      underlyingTicker: a.underlyingTicker,
    });
    if (out.length >= limit) return rank(out, q);
  }

  // 2. CEDEARs seed
  for (const c of CEDEARS) {
    if (!matches(c.ticker, c.name, q)) continue;
    if (types && !types.has('cedear')) continue;
    const key = `cedear|${c.ticker.toUpperCase()}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push({
      id: `cedear-${c.ticker}`,
      ticker: c.ticker,
      name: c.name,
      type: 'cedear',
      source: 'cedear-seed',
      alreadyInLibrary: false,
      cedearRatio: c.ratio,
      underlyingTicker: c.underlyingTicker,
    });
    if (out.length >= limit) return rank(out, q);
  }

  if (opts.localOnly) return rank(out, q);

  // 3. APIs externas en paralelo. Si una falla, lo dejamos pasar.
  const remoteTasks: Array<Promise<AssetSearchResult[]>> = [];
  if (!types || types.has('crypto')) {
    remoteTasks.push(searchCoinGecko(q, opts.signal).catch(handleApiErr('coingecko')));
  }
  if (
    !types ||
    types.has('stock') ||
    types.has('etf') ||
    types.has('cedear')
  ) {
    if (getTwelveKey()) {
      remoteTasks.push(searchTwelve(q, opts.signal).catch(handleApiErr('twelvedata')));
    }
  }
  const remote = (await Promise.all(remoteTasks)).flat();

  for (const r of remote) {
    const key = `${r.type}|${r.ticker.toUpperCase()}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }

  return rank(out, q);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function matches(ticker: string, name: string, q: string): boolean {
  const lowerQ = q.toLowerCase();
  return (
    ticker.toLowerCase().includes(lowerQ) || name.toLowerCase().includes(lowerQ)
  );
}

/** Reordena: exact ticker > prefix ticker > otros. Mantiene el orden de fuente como tie-break. */
function rank(arr: AssetSearchResult[], q: string): AssetSearchResult[] {
  const qLower = q.toLowerCase();
  const score = (r: AssetSearchResult): number => {
    const t = r.ticker.toLowerCase();
    if (t === qLower) return 100;
    if (t.startsWith(qLower)) return 50;
    if (r.name.toLowerCase().startsWith(qLower)) return 25;
    return 10;
  };
  return arr
    .map((r, i) => ({ r, s: score(r), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
}

function handleApiErr(source: string) {
  return (err: unknown): AssetSearchResult[] => {
    console.warn(`[search] ${source} failed:`, err);
    return [];
  };
}

// ─── Fuentes externas ──────────────────────────────────────────────────────

interface CoinGeckoSearchResponse {
  coins: Array<{
    id: string; // coingecko id
    name: string;
    symbol: string;
    thumb?: string;
    market_cap_rank?: number;
  }>;
}

async function searchCoinGecko(
  q: string,
  signal?: AbortSignal,
): Promise<AssetSearchResult[]> {
  const url = `${COINGECKO_SEARCH}?query=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`CoinGecko search ${res.status}`);
  const json = (await res.json()) as CoinGeckoSearchResponse;
  // Tomamos top 8 por market cap rank (los más relevantes). Filtra los que
  // no tienen rank — suelen ser shitcoins.
  return (json.coins ?? [])
    .filter((c) => typeof c.market_cap_rank === 'number')
    .sort((a, b) => (a.market_cap_rank ?? 9999) - (b.market_cap_rank ?? 9999))
    .slice(0, 8)
    .map((c) => ({
      id: `cg-${c.id}`,
      ticker: c.symbol.toUpperCase(),
      name: c.name,
      type: 'crypto' as const,
      source: 'coingecko' as const,
      alreadyInLibrary: false,
      coingeckoId: c.id,
      logo: c.symbol.slice(0, 1).toUpperCase(),
      logoBg: '#3A4254',
    }));
}

interface TwelveSearchResponse {
  data?: Array<{
    symbol: string;
    instrument_name: string;
    exchange?: string;
    instrument_type?: string;
    country?: string;
  }>;
}

async function searchTwelve(
  q: string,
  signal?: AbortSignal,
): Promise<AssetSearchResult[]> {
  const key = getTwelveKey();
  if (!key) return [];
  const url = `${TWELVEDATA_SEARCH}?symbol=${encodeURIComponent(q)}&apikey=${key}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Twelve search ${res.status}`);
  const json = (await res.json()) as TwelveSearchResponse;
  return (json.data ?? [])
    .filter((d) => d.country === 'United States') // foco AR: CEDEARs vienen de USA
    .slice(0, 6)
    .map((d) => ({
      id: `td-${d.symbol}`,
      ticker: d.symbol,
      name: d.instrument_name,
      type: ((): AssetType => {
        const t = (d.instrument_type ?? '').toLowerCase();
        if (t.includes('etf')) return 'etf';
        return 'stock';
      })(),
      source: 'twelvedata' as const,
      alreadyInLibrary: false,
      logo: d.symbol.slice(0, 1).toUpperCase(),
      logoBg: '#3A4254',
    }));
}
