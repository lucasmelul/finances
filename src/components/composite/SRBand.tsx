/**
 * Banda visual de soporte/resistencia (rangos verde/rojo + marcador del precio
 * actual). Usada en OpportunityCard y en la pantalla Asset.
 *
 * El "pos" es la posición normalizada en la banda S→R (0=soporte, 1=resistencia).
 * El caller decide cómo lo calcula (pivot points, rolling min/max, etc.).
 */

import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

interface SRBandProps {
  /** Posición del precio actual en la banda S→R, en [0..1]. */
  pos: number;
  srLow: number;
  srHigh: number;
  currency: Currency | string;
  className?: string;
}

export function SRBand({ pos, srLow, srHigh, currency, className }: SRBandProps) {
  // Clamp visual: nunca sale de los bordes de la barra (sin esto el marker
  // se "pierde" cuando el precio rompe S o R, y la banda parece rota).
  const clamped = Math.max(2, Math.min(98, pos * 100));

  return (
    <div className={className}>
      <div className="relative h-8 overflow-hidden rounded-lg bg-bg-base">
        {/* Zonas de gradiente: 0–25% verde (zona compra), 25–75% neutro,
            75–100% rojo (zona venta). */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, hsl(var(--positive) / 0.12) 0%, hsl(var(--positive) / 0.12) 25%, transparent 25%, transparent 75%, hsl(var(--negative) / 0.12) 75%, hsl(var(--negative) / 0.12) 100%)',
          }}
        />
        {/* Marcadores de S y R. */}
        <div className="absolute inset-y-0 left-1/4 w-px bg-positive opacity-50" />
        <div className="absolute inset-y-0 left-3/4 w-px bg-negative opacity-50" />
        {/* Pill blanco con sombra que marca el precio actual. */}
        <div
          className="absolute inset-y-1 w-3 rounded bg-text-primary"
          style={{
            left: `calc(${clamped}% - 6px)`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }}
        />
      </div>
      <div
        className={cn(
          'mt-1.5 flex items-center justify-between font-mono text-[10px] text-text-muted',
        )}
      >
        <span>
          <span className="text-positive">S</span> {fmtMoney(srLow, currency)}
        </span>
        <span className="font-semibold text-text-secondary">actual</span>
        <span>
          <span className="text-negative">R</span> {fmtMoney(srHigh, currency)}
        </span>
      </div>
    </div>
  );
}
