import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Helper canónico de shadcn/ui para componer clases Tailwind. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Formatea un número como moneda. Usa tabular-nums por CSS. */
export function formatMoney(
  value: number,
  currency: string = 'USD',
  options: { compact?: boolean; decimals?: number } = {},
): string {
  const { compact = false, decimals } = options;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: decimals ?? (compact ? 1 : 2),
    minimumFractionDigits: decimals ?? (compact ? 0 : 2),
  }).format(value);
}

/** Porcentaje con signo. */
export function formatPct(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/** Genera un ID corto para entidades locales. */
export function newId(): string {
  return crypto.randomUUID();
}
