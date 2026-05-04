/**
 * Datos iniciales para el primer arranque (mock del DESIGN_BRIEF).
 *
 * Importante: estos datos son una FOTO de demostración. En producción los
 * reemplaza el flujo de onboarding (alta de cuentas + import de tx). Mientras
 * tanto, sembramos la app para que se vea poblada al primer arranque.
 *
 * Convenciones:
 * - IDs estáticos (string corto, no UUID) para que `seed()` sea idempotente
 *   y los HOLDINGS / TX puedan referenciar IDs por nombre.
 * - Las cantidades reflejan el escenario del diseño (BTC dividido entre
 *   `largo` y `trade`, ETH entre `medio` y `largo`, etc.).
 * - Los precios "actuales" no se persisten acá: van a `priceCache` para que
 *   el polling de TanStack Query los sobrescriba.
 */

import type {
  Account,
  Asset,
  FxKind,
  PortfolioBucket,
  PriceCache,
  Transaction,
} from '@/lib/types';

// ─── Tipos auxiliares de seed ──────────────────────────────────────────────

/** Tasas FX en ARS por 1 unidad de la moneda indicada (USD por defecto). */
export interface SeedFx {
  oficial: number;
  mep: number;
  ccl: number;
  blue: number;
  /** ARS por 1 EUR. */
  eur: number;
  /** USD por 1 BTC (no es ARS, ojo). */
  btc: number;
}

/**
 * Holding "denormalizado" del diseño — cantidad por (asset, account, bucket)
 * con costo promedio expresado en la moneda original. Solo se usa para
 * generar las transactions iniciales; el modelo persistido es `Transaction`.
 */
export interface SeedHolding {
  assetId: string;
  accountId: string;
  bucket: PortfolioBucket;
  qty: number;
  /** Costo promedio en USD (cripto / ETF / bono USD). */
  avgUSD?: number;
  /** Costo promedio en ARS (CEDEAR / fondo). */
  avgARS?: number;
}

/** Forma del seed a consumir desde `bootstrap()`. */
export interface SeedBundle {
  fx: SeedFx;
  accounts: Account[];
  assets: Asset[];
  holdings: SeedHolding[];
  /** Transacciones recientes mostradas en Inicio. */
  recentTx: Array<{
    id: string;
    kind: 'buy' | 'sell' | 'yield';
    assetId: string;
    accountId: string;
    bucket: PortfolioBucket;
    qty: number;
    /** Precio unitario en moneda original (USD para cripto/ETF/bono USD, ARS para CEDEAR/fondo). */
    priceUSD?: number;
    priceARS?: number;
    date: string;
    note?: string;
  }>;
  /** Snapshot de precios para sembrar el cache antes del primer polling. */
  priceCache: PriceCache[];
}

// ─── Fechas estables para el seed ──────────────────────────────────────────

/** Marca de tiempo de "instalación" — todas las entidades del seed la usan
 * como `createdAt`. Mantener fija (no `new Date()`) para que el seed sea
 * determinístico entre reseeds. */
const SEED_NOW = '2026-04-28T12:00:00.000Z';

// ─── FX (cotizaciones de referencia del diseño) ────────────────────────────

export const SEED_FX: SeedFx = {
  oficial: 1018,
  mep: 1187,
  ccl: 1205,
  blue: 1230,
  eur: 1305,
  btc: 95400,
};

/** Tasa que usa la app por defecto para convertir ARS↔USD (CCL es lo más
 * cercano al "USD libre real" en contexto AR). */
export const DEFAULT_FX_KIND: FxKind = 'ccl';

// ─── Cuentas ───────────────────────────────────────────────────────────────

export const SEED_ACCOUNTS: Account[] = [
  { id: 'iol', name: 'IOL', kind: 'broker', tag: 'A', currency: 'ARS', createdAt: SEED_NOW },
  { id: 'cocos', name: 'Cocos Capital', kind: 'broker', tag: 'A', currency: 'ARS', createdAt: SEED_NOW },
  { id: 'bull', name: 'Bull Market', kind: 'broker', tag: 'A', currency: 'ARS', createdAt: SEED_NOW },
  { id: 'binance', name: 'Binance', kind: 'exchange', tag: 'B', currency: 'USDT', createdAt: SEED_NOW },
  { id: 'lemon', name: 'Lemon', kind: 'exchange', tag: 'A', currency: 'ARS', createdAt: SEED_NOW },
  { id: 'belo', name: 'Belo', kind: 'exchange', tag: 'B', currency: 'USDT', createdAt: SEED_NOW },
  { id: 'metamask', name: 'MetaMask', kind: 'wallet', tag: 'B', currency: 'USDT', createdAt: SEED_NOW },
  { id: 'galicia', name: 'Galicia', kind: 'bank', tag: 'A', currency: 'ARS', createdAt: SEED_NOW },
  { id: 'cash', name: 'Caja fuerte', kind: 'cash', tag: 'B', currency: 'USD', createdAt: SEED_NOW },
];

// ─── Activos ───────────────────────────────────────────────────────────────

export const SEED_ASSETS: Asset[] = [
  // Cripto
  {
    id: 'btc',
    type: 'crypto',
    ticker: 'BTC',
    name: 'Bitcoin',
    currency: 'USD',
    logo: '₿',
    logoBg: '#F7931A',
    coingeckoId: 'bitcoin',
    createdAt: SEED_NOW,
  },
  {
    id: 'eth',
    type: 'crypto',
    ticker: 'ETH',
    name: 'Ethereum',
    currency: 'USD',
    logo: 'Ξ',
    logoBg: '#627EEA',
    coingeckoId: 'ethereum',
    createdAt: SEED_NOW,
  },
  {
    id: 'sol',
    type: 'crypto',
    ticker: 'SOL',
    name: 'Solana',
    currency: 'USD',
    logo: '◎',
    logoBg: '#9945FF',
    coingeckoId: 'solana',
    createdAt: SEED_NOW,
  },
  {
    id: 'usdt',
    type: 'crypto',
    ticker: 'USDT',
    name: 'Tether',
    currency: 'USD',
    logo: '₮',
    logoBg: '#26A17B',
    coingeckoId: 'tether',
    createdAt: SEED_NOW,
  },

  // CEDEARs (cotizan en ARS, ratio = CEDEARs por 1 acción real)
  {
    id: 'aapl',
    type: 'cedear',
    ticker: 'AAPL',
    name: 'Apple',
    currency: 'ARS',
    logo: 'A',
    logoBg: '#1D1D1F',
    underlyingTicker: 'AAPL',
    cedearRatio: 10,
    createdAt: SEED_NOW,
  },
  {
    id: 'msft',
    type: 'cedear',
    ticker: 'MSFT',
    name: 'Microsoft',
    currency: 'ARS',
    logo: 'M',
    logoBg: '#00A4EF',
    underlyingTicker: 'MSFT',
    cedearRatio: 5,
    createdAt: SEED_NOW,
  },
  {
    id: 'nvda',
    type: 'cedear',
    ticker: 'NVDA',
    name: 'Nvidia',
    currency: 'ARS',
    logo: 'N',
    logoBg: '#76B900',
    underlyingTicker: 'NVDA',
    cedearRatio: 20,
    createdAt: SEED_NOW,
  },
  {
    id: 'koxp',
    type: 'cedear',
    ticker: 'KO',
    name: 'Coca-Cola',
    currency: 'ARS',
    logo: 'K',
    logoBg: '#E61A27',
    underlyingTicker: 'KO',
    cedearRatio: 7,
    createdAt: SEED_NOW,
  },

  // ETFs
  {
    id: 'spy',
    type: 'etf',
    ticker: 'SPY',
    name: 'S&P 500 ETF',
    currency: 'USD',
    logo: 'S',
    logoBg: '#3A4254',
    createdAt: SEED_NOW,
  },

  // Bonos
  {
    id: 'al30',
    type: 'bono',
    ticker: 'AL30',
    name: 'Bonar 2030 USD',
    currency: 'USD',
    logo: 'B',
    logoBg: '#6366F1',
    createdAt: SEED_NOW,
  },
  {
    id: 'gd35',
    type: 'bono',
    ticker: 'GD35',
    name: 'Global 2035',
    currency: 'USD',
    logo: 'G',
    logoBg: '#6366F1',
    createdAt: SEED_NOW,
  },

  // Fondos
  {
    id: 'fci1',
    type: 'fondo',
    ticker: 'AdCap',
    name: 'AdCap Renta Fija',
    currency: 'ARS',
    logo: 'F',
    logoBg: '#3A4254',
    createdAt: SEED_NOW,
  },
];

// ─── Holdings (se materializan a transactions de tipo `buy` en bootstrap) ──

export const SEED_HOLDINGS: SeedHolding[] = [
  // BTC dividido entre largo (HODL) y trade (especulativo con S/R)
  { assetId: 'btc', accountId: 'binance', bucket: 'largo', qty: 0.485, avgUSD: 67200 },
  { assetId: 'btc', accountId: 'binance', bucket: 'trade', qty: 0.052, avgUSD: 91500 },
  // ETH entre medio y largo (custodia propia en MetaMask)
  { assetId: 'eth', accountId: 'binance', bucket: 'medio', qty: 4.2, avgUSD: 2940 },
  { assetId: 'eth', accountId: 'metamask', bucket: 'largo', qty: 2.8, avgUSD: 2210 },
  // SOL entre trade y medio
  { assetId: 'sol', accountId: 'binance', bucket: 'trade', qty: 18, avgUSD: 142 },
  { assetId: 'sol', accountId: 'binance', bucket: 'medio', qty: 12, avgUSD: 95 },
  // Stables en corto plazo
  { assetId: 'usdt', accountId: 'belo', bucket: 'corto', qty: 3200, avgUSD: 1 },
  { assetId: 'usdt', accountId: 'lemon', bucket: 'corto', qty: 1450, avgUSD: 1 },
  // CEDEARs (precio promedio en ARS)
  { assetId: 'aapl', accountId: 'iol', bucket: 'largo', qty: 50, avgARS: 7800 },
  { assetId: 'msft', accountId: 'iol', bucket: 'largo', qty: 25, avgARS: 10200 },
  { assetId: 'nvda', accountId: 'cocos', bucket: 'trade', qty: 40, avgARS: 8400 },
  { assetId: 'koxp', accountId: 'iol', bucket: 'largo', qty: 30, avgARS: 3950 },
  // ETF / Bonos / Fondos
  { assetId: 'spy', accountId: 'iol', bucket: 'medio', qty: 8, avgUSD: 540 },
  { assetId: 'al30', accountId: 'cocos', bucket: 'medio', qty: 1200, avgUSD: 64.5 },
  { assetId: 'gd35', accountId: 'bull', bucket: 'largo', qty: 800, avgUSD: 51 },
  { assetId: 'fci1', accountId: 'iol', bucket: 'corto', qty: 850, avgARS: 1240 },
];

// ─── Transacciones recientes (mostrar en Inicio / "Operaciones recientes") ─

export const SEED_RECENT_TX: SeedBundle['recentTx'] = [
  {
    id: 'tx-1',
    kind: 'buy',
    assetId: 'sol',
    accountId: 'binance',
    bucket: 'trade',
    qty: 18,
    priceUSD: 165,
    date: '2026-04-26T14:22:00.000Z',
  },
  {
    id: 'tx-2',
    kind: 'yield',
    assetId: 'eth',
    accountId: 'binance',
    bucket: 'medio',
    qty: 0.018,
    date: '2026-04-25T08:00:00.000Z',
    note: 'staking',
  },
  {
    id: 'tx-3',
    kind: 'buy',
    assetId: 'aapl',
    accountId: 'iol',
    bucket: 'largo',
    qty: 50,
    priceARS: 8950,
    date: '2026-04-23T11:05:00.000Z',
  },
  {
    id: 'tx-4',
    kind: 'sell',
    assetId: 'nvda',
    accountId: 'cocos',
    bucket: 'trade',
    qty: 10,
    priceARS: 8200,
    date: '2026-04-22T16:48:00.000Z',
  },
  {
    id: 'tx-5',
    kind: 'buy',
    assetId: 'usdt',
    accountId: 'belo',
    bucket: 'corto',
    qty: 1500,
    priceUSD: 1.0,
    date: '2026-04-20T19:12:00.000Z',
    note: 'P2P',
  },
  {
    id: 'tx-6',
    kind: 'yield',
    assetId: 'sol',
    accountId: 'binance',
    bucket: 'medio',
    qty: 0.42,
    date: '2026-04-19T08:00:00.000Z',
    note: 'staking',
  },
];

// ─── PriceCache (snapshot inicial — sobrescrito por el polling) ──────────

/**
 * NOTA: el snapshot inicial NO incluye sparklines. Los sparks anteriormente
 * eran generados por un PRNG centrado en el precio del seed — valores
 * inventados que parecían reales. Ahora dejamos `spark: undefined` y la UI
 * lo respeta (Sparkline component renderiza null si no hay datos).
 *
 * Cuando agreguemos un poller específico de histórico (ej. CoinGecko
 * `/coins/{id}/market_chart` cada hora con `days=7`), ese poblará sparks
 * reales — un seed determinístico es engañoso.
 */
interface SeedPriceRow {
  assetId: string;
  /** Precio en moneda nativa del activo. Solo sirve como bootstrap antes del primer poll. */
  price: number;
  /** Variación 24h del seed. Sobrescrito al primer poll. */
  ch24Pct: number;
}

const SEED_PRICE_ROWS: SeedPriceRow[] = [
  { assetId: 'btc', price: 95400, ch24Pct: 2.4 },
  { assetId: 'eth', price: 3250, ch24Pct: -1.2 },
  { assetId: 'sol', price: 178, ch24Pct: 4.8 },
  { assetId: 'usdt', price: 1.0, ch24Pct: 0.0 },
  { assetId: 'aapl', price: 9120, ch24Pct: 0.8 },
  { assetId: 'msft', price: 12480, ch24Pct: 1.6 },
  { assetId: 'nvda', price: 7860, ch24Pct: -2.1 },
  { assetId: 'koxp', price: 4250, ch24Pct: 0.3 },
  { assetId: 'spy', price: 587.4, ch24Pct: 0.7 },
  { assetId: 'al30', price: 68.2, ch24Pct: -0.4 },
  { assetId: 'gd35', price: 54.1, ch24Pct: 0.9 },
  { assetId: 'fci1', price: 1287.5, ch24Pct: 0.05 },
];

export const SEED_PRICE_CACHE: PriceCache[] = SEED_PRICE_ROWS.map((row) => {
  const asset = SEED_ASSETS.find((a) => a.id === row.assetId);
  if (!asset) throw new Error(`SEED_PRICE_CACHE: asset ${row.assetId} no existe`);
  return {
    assetId: row.assetId,
    price: row.price,
    currency: asset.currency,
    ch24Pct: row.ch24Pct,
    // spark omitido — sin datos inventados; el polling/history llenan después
    fetchedAt: SEED_NOW,
    source: 'seed',
  };
});

// ─── Soporte/Resistencia (para Trade y Oportunidades) ──────────────────────

/**
 * Niveles S/R del diseño. En producción se calculan automáticamente desde
 * rolling min/max + pivot points (SPEC §6). Mientras no esté el cálculo, el
 * seed sirve para que la pantalla Asset ya muestre la banda S/R.
 */
export const SEED_SR: Record<string, { low: number; high: number }> = {
  btc: { low: 88000, high: 102000 },
  eth: { low: 3050, high: 3600 },
  sol: { low: 155, high: 195 },
  usdt: { low: 0.99, high: 1.01 },
  aapl: { low: 8400, high: 9800 },
  msft: { low: 11500, high: 13200 },
  nvda: { low: 7200, high: 8900 },
  koxp: { low: 3950, high: 4600 },
  spy: { low: 545, high: 605 },
  al30: { low: 62, high: 72 },
  gd35: { low: 49, high: 58 },
  fci1: { low: 1270, high: 1300 },
};

// ─── Bundle exportable ─────────────────────────────────────────────────────

export const SEED_BUNDLE: SeedBundle = {
  fx: SEED_FX,
  accounts: SEED_ACCOUNTS,
  assets: SEED_ASSETS,
  holdings: SEED_HOLDINGS,
  recentTx: SEED_RECENT_TX,
  priceCache: SEED_PRICE_CACHE,
};

// ─── Helpers de conversión seed → entidades persistibles ───────────────────

/**
 * Convierte un `SeedHolding` en una transacción `buy` que materializa la
 * posición inicial. Esto evita persistir `Holding` (que es vista derivada)
 * y deja la cadena FIFO ya armada con un solo lote por scope.
 *
 * Nota: estas tx no llevan `fxSnapshot` real porque son una fotocopia del
 * estado del usuario al alta — el costo USD viene directo de `avgUSD` o
 * convertido a CCL si el costo está en ARS (CEDEARs / fondos).
 */
export function seedHoldingAsTransaction(
  h: SeedHolding,
  portfolioId: string,
  fx: SeedFx = SEED_FX,
): Transaction {
  const inARS = h.avgARS != null;
  const unitPrice = inARS ? h.avgARS! : h.avgUSD!;
  const priceCurrency = inARS ? 'ARS' : 'USD';

  // El "alta inicial" es una compra ficticia datada en SEED_NOW. La fecha
  // exacta no afecta a FIFO (es el primer lote del scope) pero sí al P&L
  // histórico; el usuario debería editarla cuando importe sus tx reales.
  return {
    id: `seed-tx-${h.assetId}-${h.accountId}-${h.bucket}`,
    kind: 'buy',
    date: SEED_NOW,
    accountId: h.accountId,
    portfolioId,
    assetId: h.assetId,
    qty: h.qty,
    unitPrice,
    priceCurrency,
    fxSnapshot: { ccl: fx.ccl, mep: fx.mep, blue: fx.blue, oficial: fx.oficial },
    notes: 'Posición inicial (seed)',
    source: 'import',
    createdAt: SEED_NOW,
  };
}
