import type { Currency } from '@/lib/types';

const SYMBOL: Record<string, string> = {
  USD: 'US$',
  ARS: '$',
  EUR: '€',
  BTC: '₿',
  USDT: '$',
};

/**
 * Formato numérico del diseño: 4+ decimales para cripto, 0 para enteros >10k,
 * 2 para resto. Compacto cuando >1M.
 */
export function fmt(n: number | null | undefined, dp = 2, hidden = false): string {
  if (hidden) return '••••••';
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e4) return n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

export function fmtMoney(
  n: number | null | undefined,
  currency: Currency | string = 'USD',
  hidden = false,
): string {
  if (hidden) return '••••••';
  if (n == null || isNaN(n)) return '—';
  const symbol = SYMBOL[currency] ?? '';
  const dp = currency === 'BTC' ? 6 : 2;
  return `${symbol} ${fmt(n, dp)}`.trim();
}

export function fmtPct(
  n: number | null | undefined,
  options: { plusSign?: boolean; hidden?: boolean; decimals?: number } = {},
): string {
  const { plusSign = true, hidden = false, decimals = 2 } = options;
  if (hidden) return '••••';
  if (n == null || isNaN(n)) return '—';
  const sign = plusSign && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

/** Tiempo relativo en español ("hace 5m", "hace 2h", "hace 3d"). */
export function relTime(d: Date | string, now: Date = new Date()): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const diff = (now.getTime() - date.getTime()) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `hace ${Math.round(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`;
  if (diff < 86400 * 7) return `hace ${Math.round(diff / 86400)}d`;
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

/** Hora en formato 24h (HH:mm) — usado en headers tipo "lun · 28 abr · 14:32". */
export function fmtTime(d: Date = new Date()): string {
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function fmtDateShort(d: Date = new Date()): string {
  const w = d.toLocaleDateString('es-AR', { weekday: 'short' }).slice(0, 3);
  const day = d.getDate();
  const m = d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
  return `${w} · ${day} ${m}`;
}
