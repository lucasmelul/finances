import type { Portfolio, PortfolioBucket } from '@/lib/types';

/**
 * Carteras default que se siembran al primer arranque.
 *
 * IDs estáticos (no UUID) por dos razones:
 * 1. Idempotencia: re-llamar `defaultPortfolios()` produce los mismos IDs,
 *    así `bootstrap()` puede sembrar transactions que los referencien.
 * 2. Estabilidad de URL: `#/cartera/largo` es más legible que un UUID.
 *
 * Si el usuario crea carteras propias luego, esas sí usan `crypto.randomUUID()`.
 */
const DEFAULT_BUCKETS: Array<{
  id: string;
  bucket: PortfolioBucket;
  name: string;
  isDefault?: boolean;
}> = [
  { id: 'pf-largo', bucket: 'largo', name: 'Largo plazo', isDefault: true },
  { id: 'pf-medio', bucket: 'medio', name: 'Mediano' },
  { id: 'pf-corto', bucket: 'corto', name: 'Corto plazo' },
  { id: 'pf-trade', bucket: 'trade', name: 'Trade' },
];

export function defaultPortfolios(now: string = new Date().toISOString()): Portfolio[] {
  return DEFAULT_BUCKETS.map((b) => ({
    id: b.id,
    name: b.name,
    bucket: b.bucket,
    isDefault: b.isDefault,
    createdAt: now,
  }));
}

/** ID estático del portfolio default por bucket. Útil para mapear seed→tx. */
export function portfolioIdForBucket(bucket: PortfolioBucket): string {
  const pf = DEFAULT_BUCKETS.find((b) => b.bucket === bucket);
  if (!pf) throw new Error(`No hay portfolio default para bucket ${bucket}`);
  return pf.id;
}
