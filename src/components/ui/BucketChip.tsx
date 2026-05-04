/**
 * Pill que identifica el bucket temporal (corto/medio/largo/trade).
 *
 * Cada bucket tiene un color asignado en `tailwind.config.ts` (palette
 * `bucket.*`). El mismo color se usa en KPIs, donut de distribución y
 * filtros — mantener la consistencia es lo que hace que el sistema escale.
 */

import { cn } from '@/lib/utils';
import type { PortfolioBucket } from '@/lib/types';

const BUCKET_LABEL: Record<PortfolioBucket, string> = {
  corto: 'Corto plazo',
  medio: 'Mediano',
  largo: 'Largo plazo',
  trade: 'Trade',
};

/**
 * Tailwind no compila clases generadas dinámicamente, así que el switch va
 * a clases literales. Si se agrega un bucket, agregar también acá.
 */
const BUCKET_CLASSES: Record<PortfolioBucket, string> = {
  corto: 'text-bucket-corto bg-bucket-corto/10',
  medio: 'text-bucket-medio bg-bucket-medio/10',
  largo: 'text-bucket-largo bg-bucket-largo/10',
  trade: 'text-bucket-trade bg-bucket-trade/[0.12]',
};

interface BucketChipProps {
  bucket: PortfolioBucket;
  /** Override del label (ej. nombre custom de la cartera). */
  label?: string;
  small?: boolean;
  className?: string;
}

export function BucketChip({ bucket, label, small = false, className }: BucketChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-md font-medium tracking-wide',
        small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-[3px] text-[11px]',
        BUCKET_CLASSES[bucket],
        className,
      )}
    >
      {label ?? BUCKET_LABEL[bucket]}
    </span>
  );
}

export { BUCKET_LABEL };
