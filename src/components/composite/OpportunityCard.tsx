/**
 * Card de oportunidad de compra/venta basada en la posición del precio en la
 * banda S/R. Aparece en la pantalla Oportunidades.
 *
 * El "signal" lo calcula el screen (no este componente) porque depende de
 * thresholds que pueden ajustarse global (config). Acá solo se renderiza.
 */

import { cn } from '@/lib/utils';
import { fmt, fmtMoney } from '@/lib/format';
import { Icon, type IconName } from '@/components/ui/Icon';
import { AssetLogo } from '@/components/ui/AssetLogo';
import { SRBand } from './SRBand';
import type { Asset, Currency } from '@/lib/types';

export type OpportunitySignal = 'buy' | 'watch' | 'sell';

export interface OpportunityVM {
  asset: Pick<Asset, 'id' | 'ticker' | 'name' | 'type' | 'logo' | 'logoBg'>;
  /** Precio actual en moneda nativa del activo. */
  price: number;
  currency: Currency | string;
  /** Variación 24h en %. Puede venir como null si aún no se hizo polling. */
  ch24Pct: number | null;
  srLow: number;
  srHigh: number;
  /** Posición en banda S→R, 0..1. */
  pos: number;
  signal: OpportunitySignal;
  /** Texto del banner (ej. "EN ZONA DE COMPRA"). El cálculo lo hace el screen. */
  signalLabel: string;
  /** True si el usuario ya tiene posición — pinta chip "Tenés". */
  heldByUser: boolean;
}

const SIGNAL_CLASSES: Record<OpportunitySignal, string> = {
  buy: 'text-positive bg-positive/[0.12]',
  watch: 'text-warning bg-warning/[0.14]',
  sell: 'text-negative bg-negative/[0.12]',
};

const SIGNAL_ICON: Record<OpportunitySignal, IconName> = {
  buy: 'trend-up',
  watch: 'target',
  sell: 'arrow-up',
};

interface OpportunityCardProps {
  vm: OpportunityVM;
  onClick?: (assetId: string) => void;
  className?: string;
}

export function OpportunityCard({ vm, onClick, className }: OpportunityCardProps) {
  const { asset, price, currency, ch24Pct, srLow, srHigh, pos, signal, signalLabel, heldByUser } = vm;
  const positive = (ch24Pct ?? 0) >= 0;

  return (
    <button
      type="button"
      onClick={() => onClick?.(asset.id)}
      className={cn(
        'block w-full rounded-2xl border border-border-subtle bg-bg-surface p-3.5 text-left transition-colors',
        'hover:border-border-hover',
        className,
      )}
    >
      {/* Banner: signal + chip "Tenés" */}
      <div className="mb-2.5 flex items-center gap-1.5">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold tracking-wider',
            SIGNAL_CLASSES[signal],
          )}
        >
          <Icon name={SIGNAL_ICON[signal]} size={11} />
          {signalLabel}
        </span>
        {heldByUser && (
          <span className="rounded bg-bg-base px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
            Tenés
          </span>
        )}
      </div>

      {/* Asset row */}
      <div className="mb-3 flex items-center gap-3">
        <AssetLogo asset={asset} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-text-primary">{asset.ticker}</span>
            <span className="truncate text-[11px] text-text-secondary">{asset.name}</span>
          </div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wider text-text-muted">
            {asset.type === 'cedear' ? 'CEDEAR · ARS' : asset.type}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-text-primary tabular-nums">
            {fmtMoney(price, currency)}
          </div>
          <div
            className={cn(
              'text-[11px] font-medium tabular-nums',
              positive ? 'text-positive' : 'text-negative',
            )}
          >
            {ch24Pct == null ? '—' : `${positive ? '+' : ''}${fmt(ch24Pct, 2)}%`}
          </div>
        </div>
      </div>

      <SRBand pos={pos} srLow={srLow} srHigh={srHigh} currency={currency} />
    </button>
  );
}
