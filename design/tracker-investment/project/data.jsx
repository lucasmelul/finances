// Mock data + design tokens for the portfolio tracker

const DESIGN_TOKENS = {
  dark: {
    bgBase: '#0B0E14',
    bgSurface: '#151923',
    bgElevated: '#1E2330',
    borderSubtle: '#2A3142',
    borderHover: '#3A4254',
    textPrimary: '#F5F7FA',
    textSecondary: '#9AA3B2',
    textMuted: '#5A6373',
    accent: '#6366F1',
    accentSoft: 'rgba(99,102,241,0.14)',
    positive: '#10B981',
    positiveSoft: 'rgba(16,185,129,0.12)',
    negative: '#EF4444',
    negativeSoft: 'rgba(239,68,68,0.12)',
    warning: '#F59E0B',     // tag B (privado)
    warningSoft: 'rgba(245,158,11,0.14)',
    info: '#3B82F6',        // tag A (declarado)
    infoSoft: 'rgba(59,130,246,0.14)',
  },
  light: {
    bgBase: '#FBFAF7',
    bgSurface: '#FFFFFF',
    bgElevated: '#FFFFFF',
    borderSubtle: '#E8E6E1',
    borderHover: '#D4D1CA',
    textPrimary: '#1A1D24',
    textSecondary: '#5A6373',
    textMuted: '#9AA3B2',
    accent: '#4F46E5',
    accentSoft: 'rgba(79,70,229,0.10)',
    positive: '#059669',
    positiveSoft: 'rgba(5,150,105,0.10)',
    negative: '#DC2626',
    negativeSoft: 'rgba(220,38,38,0.10)',
    warning: '#D97706',
    warningSoft: 'rgba(217,119,6,0.12)',
    info: '#2563EB',
    infoSoft: 'rgba(37,99,235,0.10)',
  },
};

// Cotizaciones FX (ARS por 1 USD)
const FX = {
  oficial: 1018,
  mep: 1187,
  ccl: 1205,
  blue: 1230,
  eur: 1305,   // ARS por 1 EUR
  btc: 95400,  // USD por 1 BTC
};

// Cuentas (cada una es A=declarado o B=privado, color inmutable)
const ACCOUNTS = [
  { id: 'iol',     name: 'IOL',           kind: 'broker',   tag: 'A', currency: 'ARS' },
  { id: 'cocos',   name: 'Cocos Capital', kind: 'broker',   tag: 'A', currency: 'ARS' },
  { id: 'bull',    name: 'Bull Market',   kind: 'broker',   tag: 'A', currency: 'ARS' },
  { id: 'binance', name: 'Binance',       kind: 'exchange', tag: 'B', currency: 'USDT' },
  { id: 'lemon',   name: 'Lemon',         kind: 'exchange', tag: 'A', currency: 'ARS' },
  { id: 'belo',    name: 'Belo',          kind: 'exchange', tag: 'B', currency: 'USDT' },
  { id: 'metamask',name: 'MetaMask',      kind: 'wallet',   tag: 'B', currency: 'USDT' },
  { id: 'galicia', name: 'Galicia',       kind: 'bank',     tag: 'A', currency: 'ARS' },
  { id: 'cash',    name: 'Caja fuerte',   kind: 'cash',     tag: 'B', currency: 'USD'  },
];

// Buckets
const BUCKETS = [
  { id: 'corto',  label: 'Corto plazo', desc: 'Objetivos < 6 meses' },
  { id: 'medio',  label: 'Mediano',     desc: '6 m – 2 años' },
  { id: 'largo',  label: 'Largo plazo', desc: 'HODL, jubilación' },
  { id: 'trade',  label: 'Trade',       desc: 'Especulativo con S/R' },
];

// Generador de sparkline determinístico
function spark(seed, n = 24, drift = 0, vol = 1) {
  const out = [];
  let v = 100;
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    const r = (x / 233280) - 0.5;
    v += r * vol * 4 + drift;
    out.push(Math.max(20, v));
  }
  return out;
}

// Activos (tickers)
const ASSETS = [
  // Cripto
  { id: 'btc',  symbol: 'BTC',   name: 'Bitcoin',           type: 'crypto', logo: '₿', logoBg: '#F7931A', priceUSD: 95400,  ch24: 2.4,  spark: spark(11, 28, 0.4, 1.2), srLow: 88000, srHigh: 102000 },
  { id: 'eth',  symbol: 'ETH',   name: 'Ethereum',          type: 'crypto', logo: 'Ξ', logoBg: '#627EEA', priceUSD: 3250,   ch24: -1.2, spark: spark(22, 28, -0.1, 1), srLow: 3050, srHigh: 3600 },
  { id: 'sol',  symbol: 'SOL',   name: 'Solana',            type: 'crypto', logo: '◎', logoBg: '#9945FF', priceUSD: 178,    ch24: 4.8,  spark: spark(33, 28, 0.6, 1.3), srLow: 155, srHigh: 195 },
  { id: 'usdt', symbol: 'USDT',  name: 'Tether',            type: 'crypto', logo: '₮', logoBg: '#26A17B', priceUSD: 1.0,    ch24: 0.0,  spark: spark(7, 28, 0, 0.05), srLow: 0.99, srHigh: 1.01 },
  // CEDEARs (precio en ARS, ratio = cuántos cedears equivalen a 1 acción real)
  { id: 'aapl', symbol: 'AAPL',  name: 'Apple',             type: 'cedear', logo: 'A',  logoBg: '#1D1D1F', priceARS: 9120,   ch24: 0.8,  spark: spark(44, 28, 0.2, 0.8), ratio: 10, underlyingUSD: 218.5, srLow: 8400, srHigh: 9800 },
  { id: 'msft', symbol: 'MSFT',  name: 'Microsoft',         type: 'cedear', logo: 'M',  logoBg: '#00A4EF', priceARS: 12480,  ch24: 1.6,  spark: spark(55, 28, 0.3, 0.9), ratio: 5,  underlyingUSD: 421.3, srLow: 11500, srHigh: 13200 },
  { id: 'nvda', symbol: 'NVDA',  name: 'Nvidia',            type: 'cedear', logo: 'N',  logoBg: '#76B900', priceARS: 7860,   ch24: -2.1, spark: spark(66, 28, -0.2, 1.4), ratio: 20, underlyingUSD: 132.6, srLow: 7200, srHigh: 8900 },
  { id: 'koxp', symbol: 'KO',    name: 'Coca-Cola',         type: 'cedear', logo: 'K',  logoBg: '#E61A27', priceARS: 4250,   ch24: 0.3,  spark: spark(77, 28, 0.05, 0.5), ratio: 7,  underlyingUSD: 71.8, srLow: 3950, srHigh: 4600 },
  // ETFs
  { id: 'spy',  symbol: 'SPY',   name: 'S&P 500 ETF',       type: 'etf',    logo: 'S',  logoBg: '#3A4254', priceUSD: 587.4,  ch24: 0.7,  spark: spark(88, 28, 0.15, 0.7), srLow: 545, srHigh: 605 },
  // Bonos
  { id: 'al30', symbol: 'AL30',  name: 'Bonar 2030 USD',    type: 'bono',   logo: 'B',  logoBg: '#6366F1', priceUSD: 68.2,   ch24: -0.4, spark: spark(99, 28, 0.05, 0.6), srLow: 62, srHigh: 72 },
  { id: 'gd35', symbol: 'GD35',  name: 'Global 2035',       type: 'bono',   logo: 'G',  logoBg: '#6366F1', priceUSD: 54.1,   ch24: 0.9,  spark: spark(101,28, 0.1, 0.5), srLow: 49, srHigh: 58 },
  // Fondos
  { id: 'fci1', symbol: 'AdCap', name: 'AdCap Renta Fija',  type: 'fondo',  logo: 'F',  logoBg: '#3A4254', priceARS: 1287.5, ch24: 0.05, spark: spark(110,28, 0.05, 0.2), srLow: 1270, srHigh: 1300 },
];

// Holdings (posiciones actuales) — cantidad por activo, cuenta y bucket
// Algunos assets tienen splits entre buckets (ej. BTC: parte largo + parte trade)
const HOLDINGS = [
  // BTC dividido entre largo y trade
  { assetId: 'btc',  accountId: 'binance', bucketId: 'largo', qty: 0.485, avgUSD: 67200 },
  { assetId: 'btc',  accountId: 'binance', bucketId: 'trade', qty: 0.052, avgUSD: 91500 },
  { assetId: 'eth',  accountId: 'binance', bucketId: 'medio', qty: 4.2,   avgUSD: 2940 },
  { assetId: 'eth',  accountId: 'metamask',bucketId: 'largo', qty: 2.8,   avgUSD: 2210 },
  { assetId: 'sol',  accountId: 'binance', bucketId: 'trade', qty: 18,    avgUSD: 142 },
  { assetId: 'sol',  accountId: 'binance', bucketId: 'medio', qty: 12,    avgUSD: 95 },
  { assetId: 'usdt', accountId: 'belo',    bucketId: 'corto', qty: 3200,  avgUSD: 1 },
  { assetId: 'usdt', accountId: 'lemon',   bucketId: 'corto', qty: 1450,  avgUSD: 1 },
  // CEDEARs
  { assetId: 'aapl', accountId: 'iol',     bucketId: 'largo', qty: 50,    avgARS: 7800 },
  { assetId: 'msft', accountId: 'iol',     bucketId: 'largo', qty: 25,    avgARS: 10200 },
  { assetId: 'nvda', accountId: 'cocos',   bucketId: 'trade', qty: 40,    avgARS: 8400 },
  { assetId: 'koxp', accountId: 'iol',     bucketId: 'largo', qty: 30,    avgARS: 3950 },
  // ETF / Bonos / Fondos
  { assetId: 'spy',  accountId: 'iol',     bucketId: 'medio', qty: 8,     avgUSD: 540 },
  { assetId: 'al30', accountId: 'cocos',   bucketId: 'medio', qty: 1200,  avgUSD: 64.5 },
  { assetId: 'gd35', accountId: 'bull',    bucketId: 'largo', qty: 800,   avgUSD: 51 },
  { assetId: 'fci1', accountId: 'iol',     bucketId: 'corto', qty: 850,   avgARS: 1240 },
];

// Operaciones recientes
const RECENT_TX = [
  { id: 1, kind: 'buy',   assetId: 'sol',  qty: 18,   priceUSD: 165, accountId: 'binance', bucketId: 'trade', date: '2026-04-26T14:22:00' },
  { id: 2, kind: 'yield', assetId: 'eth',  qty: 0.018,                accountId: 'binance', bucketId: 'medio', date: '2026-04-25T08:00:00', note: 'staking' },
  { id: 3, kind: 'buy',   assetId: 'aapl', qty: 50,   priceARS: 8950, accountId: 'iol',     bucketId: 'largo', date: '2026-04-23T11:05:00' },
  { id: 4, kind: 'sell',  assetId: 'nvda', qty: 10,   priceARS: 8200, accountId: 'cocos',   bucketId: 'trade', date: '2026-04-22T16:48:00' },
  { id: 5, kind: 'buy',   assetId: 'usdt', qty: 1500, priceUSD: 1.0,  accountId: 'belo',    bucketId: 'corto', date: '2026-04-20T19:12:00', note: 'P2P' },
  { id: 6, kind: 'yield', assetId: 'sol',  qty: 0.42,                  accountId: 'binance', bucketId: 'medio', date: '2026-04-19T08:00:00', note: 'staking' },
];

// Helpers de cálculo
function priceInUSD(asset) {
  if (asset.priceUSD != null) return asset.priceUSD;
  if (asset.priceARS != null) return asset.priceARS / FX.ccl;
  return 0;
}
function priceInARS(asset, fxRate = 'ccl') {
  if (asset.priceARS != null) return asset.priceARS;
  if (asset.priceUSD != null) return asset.priceUSD * FX[fxRate];
  return 0;
}
function holdingValueUSD(h) {
  const a = ASSETS.find(x => x.id === h.assetId);
  return h.qty * priceInUSD(a);
}
function holdingCostUSD(h) {
  if (h.avgUSD != null) return h.qty * h.avgUSD;
  if (h.avgARS != null) return (h.qty * h.avgARS) / FX.ccl;
  return 0;
}

Object.assign(window, {
  DESIGN_TOKENS, FX, ACCOUNTS, BUCKETS, ASSETS, HOLDINGS, RECENT_TX,
  priceInUSD, priceInARS, holdingValueUSD, holdingCostUSD, spark,
});
