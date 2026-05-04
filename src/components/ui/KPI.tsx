/**
 * Tarjeta KPI: label arriba, valor grande, delta% y/o sub-texto opcional, y
 * sparkline opcional al lado derecho. Usada en Inicio y Cuentas.
 *
 * Soporta privacidad: si `hidden=true`, oculta valor + delta con bullets
 * (mismo gesto que Apple en Wallet).
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Sparkline } from '@/components/charts/Sparkline';

interface KPIProps {
  label: string;
  /** Valor grande. Aceptamos string ya formateado para que el caller decida moneda/decimales. */
  value: ReactNode;
  /** Cambio % en el período. Positivo = verde, negativo = rojo. */
  delta?: number;
  /** Texto pequeño debajo del valor (ej. "vs ayer"). */
  sub?: string;
  /** Modo privacidad — oculta valor y delta. */
  hidden?: boolean;
  sparkData?: number[];
  /** Color del sparkline. Si se omite, deriva del signo del delta. */
  sparkColor?: string;
  /** Ocupa toda la fila (para "Patrimonio total" en mobile). */
  full?: boolean;
  className?: string;
}

export function KPI({
  label,
  value,
  delta,
  sub,
  hidden = false,
  sparkData,
  sparkColor,
  full = false,
  className,
}: KPIProps) {
  const positive = delta != null && delta >= 0;
  const computedSparkColor =
    sparkColor ?? (positive ? 'hsl(var(--positive))' : 'hsl(var(--negative))');

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-2xl border border-border-subtle bg-bg-surface p-4',
        full ? 'flex-[1_1_100%]' : 'flex-[1_1_0]',
        className,
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-[0.4px] text-text-secondary">
        {label}
      </div>
      <div className="text-[22px] font-semibold tracking-tight text-text-primary tabular-nums">
        {hidden ? '••••' : value}
      </div>
      {(delta != null || sub || sparkData) && (
        <div className="mt-0.5 flex items-center justify-between gap-2">
          {delta != null && (
            <div
              className={cn(
                'text-xs font-medium tabular-nums',
                positive ? 'text-positive' : 'text-negative',
              )}
            >
              {hidden ? '•••' : `${positive ? '+' : ''}${delta.toFixed(2)}%`}
            </div>
          )}
          {sub && <div className="text-[11px] text-text-muted">{sub}</div>}
          {sparkData && (
            <Sparkline data={sparkData} color={computedSparkColor} width={50} height={18} fill={false} />
          )}
        </div>
      )}
    </div>
  );
}
