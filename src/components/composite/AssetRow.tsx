/**
 * Fila de activo en listas (Inicio "Mis activos", Cartera holdings, etc).
 *
 * Densidad alta: logo · ticker+type · qty · sparkline · valor+delta. Toda la
 * fila es tappeable y navega al detalle del activo.
 *
 * Recibe ya el "view model" (qty agregada, valor en display currency, spark)
 * en lugar de calcular desde la DB — eso se hace una vez en el screen y se
 * memoiza, así N filas no disparan N queries.
 */

import { cn } from '@/lib/utils';
import { fmt, fmtMoney } from '@/lib/format';
import { Sparkline } from '@/components/charts/Sparkline';
import { AssetLogo } from '@/components/ui/AssetLogo';
import type { Asset, Currency } from '@/lib/types';

export interface AssetRowVM {
  asset: Pick<Asset, 'id' | 'ticker' | 'name' | 'type' | 'logo' | 'logoBg'>;
  /** Cantidad total agregada de todos los holdings. */
  qty: number;
  /** Valor en la moneda de display. */
  valueDisplay: number;
  /** Variación 24h (puede ser null si aún no llegó del polling). */
  ch24Pct: number | null;
  spark: number[];
  /**
   * Δ% del precio actual vs DCA (Dollar-Cost Average) del usuario en USD.
   * Distinto del ch24Pct: este muestra "cuán arriba/abajo del costo estás".
   * Opcional — si no se provee, no se muestra.
   */
  dcaDeltaPct?: number | null;
}

interface AssetRowProps {
  vm: AssetRowVM;
  displayCurrency: Currency;
  hidden?: boolean;
  /** Pintar separador inferior (caller decide para evitar último border). */
  divider?: boolean;
  onClick?: (assetId: string) => void;
  className?: string;
}

export function AssetRow({
  vm,
  displayCurrency,
  hidden = false,
  divider = false,
  onClick,
  className,
}: AssetRowProps) {
  const { asset, qty, valueDisplay, ch24Pct, spark, dcaDeltaPct } = vm;
  const positive = (ch24Pct ?? 0) >= 0;
  const sparkColor = positive ? 'hsl(var(--positive))' : 'hsl(var(--negative))';
  const dcaPositive = (dcaDeltaPct ?? 0) >= 0;

  return (
    <button
      type="button"
      onClick={() => onClick?.(asset.id)}
      className={cn(
        'flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors',
        'hover:bg-bg-elevated/50',
        divider && 'border-b border-border-subtle',
        className,
      )}
    >
      <AssetLogo asset={asset} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold tracking-tight text-text-primary">
            {asset.ticker}
          </span>
          <span className="rounded bg-bg-base px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-text-muted">
            {asset.type}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-secondary">
          <span>
            {hidden
              ? '••••'
              : `${fmt(qty, asset.type === 'crypto' ? 4 : 0)} ${asset.ticker}`}
          </span>
          {dcaDeltaPct != null && !hidden && (
            <>
              <span className="text-text-muted">·</span>
              <span
                className={cn(
                  'tabular-nums',
                  dcaPositive ? 'text-positive' : 'text-negative',
                )}
                title="vs DCA (tu costo promedio)"
              >
                DCA {dcaPositive ? '+' : ''}
                {dcaDeltaPct.toFixed(1)}%
              </span>
            </>
          )}
        </div>
      </div>
      <Sparkline data={spark} color={sparkColor} width={50} height={20} fill={false} />
      <div className="min-w-[90px] text-right">
        <div className="text-sm font-semibold text-text-primary tabular-nums">
          {hidden ? '••••' : fmtMoney(valueDisplay, displayCurrency)}
        </div>
        <div
          className={cn(
            'mt-0.5 text-[11px] font-medium tabular-nums',
            positive ? 'text-positive' : 'text-negative',
          )}
        >
          {hidden || ch24Pct == null
            ? '•••'
            : `${positive ? '+' : ''}${ch24Pct.toFixed(2)}%`}
        </div>
      </div>
    </button>
  );
}
