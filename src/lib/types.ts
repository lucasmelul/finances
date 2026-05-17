/**
 * Modelo de dominio del Portfolio Tracker.
 * Fuente de verdad: SPEC.md §3 + DESIGN_BRIEF.
 *
 * Reglas duras:
 * - Account.tag es inmutable post-creación.
 * - Asset es único por (type, ticker).
 * - Cada Transaction hereda tag desde su Account.
 * - Un Asset puede aparecer en múltiples Portfolios y Accounts.
 * - FIFO se calcula por scope (asset, account, portfolio).
 *
 * Nota: el diseño renombró el flag fiscal de "blanco/negro" a "A/B" con
 * labels A · DECLARADO / B · PRIVADO (más neutro). Mantenemos el modelo
 * tributario igual: A = declarado al fisco, B = no declarado.
 */

// ─── Monedas y FX ──────────────────────────────────────────────────────────

export type Currency = 'ARS' | 'USD' | 'USDT' | 'BTC' | 'EUR';

export type FxKind = 'oficial' | 'mep' | 'ccl' | 'blue' | 'crypto';

// ─── Tag fiscal (A = declarado, B = privado) ───────────────────────────────

export type AccountTag = 'A' | 'B';

export const TAG_LABEL: Record<AccountTag, string> = {
  A: 'A · DECLARADO',
  B: 'B · PRIVADO',
};

// ─── Cuentas ───────────────────────────────────────────────────────────────

export type AccountKind =
  | 'broker' // IOL, Bull, Cocos
  | 'exchange' // Binance, Lemon, Belo
  | 'wallet' // self-custody cripto
  | 'bank' // CBU pesos/USD
  | 'cash'; // efectivo físico

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  tag: AccountTag; // INMUTABLE post-creación
  currency?: Currency;
  notes?: string;
  archivedAt?: string;
  createdAt: string;
}

// ─── Activos ───────────────────────────────────────────────────────────────

export type AssetType =
  | 'cedear'
  | 'stock'
  | 'etf'
  | 'fondo' // FCI argentino
  | 'crypto'
  | 'bono'
  | 'cash';

export interface Asset {
  id: string;
  type: AssetType;
  ticker: string;
  name: string;
  currency: Currency;
  // Display
  logo?: string; // letra/emoji para placeholder
  logoBg?: string; // color de fondo del avatar
  // CEDEAR-specific
  underlyingTicker?: string;
  cedearRatio?: number; // CEDEARs por 1 acción real
  // Cripto
  coingeckoId?: string;
  // Bono
  isin?: string;
  createdAt: string;
}

// ─── Carteras (buckets temporales) ─────────────────────────────────────────

export type PortfolioBucket = 'corto' | 'medio' | 'largo' | 'trade';

export interface Portfolio {
  id: string;
  name: string;
  bucket: PortfolioBucket;
  isDefault?: boolean;
  notes?: string;
  createdAt: string;
}

// ─── Transacciones ─────────────────────────────────────────────────────────

export type TxKind =
  | 'buy'
  | 'sell'
  | 'transfer_in'
  | 'transfer_out'
  | 'yield'
  | 'fee'
  | 'fx'
  | 'adjustment';

export interface FxSnapshot {
  ccl?: number;
  mep?: number;
  blue?: number;
  oficial?: number;
}

export interface Transaction {
  id: string;
  kind: TxKind;
  date: string;
  accountId: string;
  portfolioId: string;
  assetId: string;
  qty: number;
  unitPrice: number;
  priceCurrency: Currency;
  fee?: number;
  feeCurrency?: Currency;
  fxSnapshot?: FxSnapshot;
  notes?: string;
  source: 'form' | 'chat' | 'auto-yield' | 'import';
  createdAt: string;
}

// ─── Holdings (vista derivada — NO se persiste) ────────────────────────────

/**
 * Posición agregada por (asset, account, portfolio). Se calcula desde
 * transactions con FIFO en runtime; este tipo solo describe la forma de la
 * vista, no es una tabla.
 */
export interface Holding {
  assetId: string;
  accountId: string;
  portfolioId: string;
  qty: number;
  /** Costo promedio en USD calculado desde tx (FIFO). */
  avgCostUSD: number;
}

// ─── Staking / yield ───────────────────────────────────────────────────────

export interface StakingRule {
  id: string;
  assetId: string;
  accountId: string;
  portfolioId: string;
  /**
   * Si los intereses se cobran en un activo diferente al stakeado (ej. stakear
   * USDC y cobrar en NEXO), indicar el assetId del activo de recompensa.
   * Si está ausente, se asume que la recompensa es en el mismo activo.
   */
  rewardAssetId?: string;
  apyPct: number;
  payoutFrequency: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate?: string;
  active: boolean;
  lastAccrualDate?: string;
  createdAt: string;
}

export interface YieldAccrual {
  id: string;
  ruleId?: string;
  txId: string;
  expected: number;
  actual?: number;
  correctedAt?: string;
}

// ─── Watchlist (oportunidades) ─────────────────────────────────────────────

export interface WatchlistEntry {
  id: string;
  assetId: string;
  support?: number;
  resistance?: number;
  notes?: string;
  createdAt: string;
}

// ─── Cache de precios y FX ─────────────────────────────────────────────────

export interface PriceCache {
  assetId: string;
  price: number; // moneda nativa del activo
  currency: Currency;
  ch24Pct?: number;
  spark?: number[];
  fetchedAt: string;
  source: string;
  /**
   * Solo para CEDEARs: precio del subyacente en USD (NYSE/NASDAQ) en el
   * momento del fetch. Permite calcular prima/descuento vs el precio del
   * CEDEAR en BYMA. Se llena cuando hay polling al subyacente.
   */
  underlyingUSD?: number;
}

export interface FxRateCache {
  kind: FxKind;
  buy: number;
  sell: number;
  fetchedAt: string;
}

/**
 * Cache de histórico de precios (para charts y cálculo de S/R).
 *
 * PK compuesta `[assetId+period]` — un activo puede tener histórico cacheado
 * para múltiples períodos (1D / 1W / 1M / 3M / 1Y / All) sin pisarse.
 *
 * Persistir en IndexedDB (no solo TanStack memoria) sobrevive a hard reload
 * y evita pegarle a CoinGecko cada vez que el user abre la app — clave para
 * no chocar con el rate limit del free tier.
 */
export interface PriceHistoryCache {
  assetId: string;
  /** '1D' | '1W' | '1M' | '3M' | '1Y' | 'All' — definido en chart period type. */
  period: string;
  /** Serie temporal `[timestamp_ms, price_usd]`. */
  points: Array<{ timestamp: number; price: number }>;
  fetchedAt: string;
  /** Fuente — útil para invalidar cache cuando cambiamos de proveedor. */
  source: string;
}
