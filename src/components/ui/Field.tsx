/**
 * Fila label↔value usada en el "recibo" del chat (ParsedReceipt) y en
 * cards de detalle. Layout simple: label a la izquierda, value a la derecha,
 * con un flag/etiqueta opcional al lado del value para marcar autocompletes
 * (ej. "precio actual" en chip violeta).
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  value: ReactNode;
  /** Si está activo, el value se muestra en font-semibold (para "Total"). */
  bold?: boolean;
  /** Etiqueta pequeña que indica auto-fill (ej. "precio actual", "hoy"). */
  flag?: string | null;
  className?: string;
}

export function Field({ label, value, bold = false, flag, className }: FieldProps) {
  return (
    <div className={cn('flex items-center justify-between text-[13px]', className)}>
      <span className="font-medium text-text-secondary">{label}</span>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-text-primary tabular-nums',
          bold ? 'font-semibold' : 'font-medium',
        )}
      >
        {flag && (
          <span className="rounded bg-accent/[0.14] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-accent">
            {flag}
          </span>
        )}
        {value}
      </span>
    </div>
  );
}
