/**
 * Fila de transacción. Muestra:
 *  - Icono coloreado según `kind` (compra=verde abajo, venta=rojo arriba, yield=spark accent)
 *  - Tipo + ticker · nota opcional (ej. "P2P", "staking")
 *  - Cuenta · BucketChip
 *  - Cantidad signada · precio o tiempo relativo
 *
 * Recibe el view-model con asset y account ya resueltos para no re-leer la DB
 * por fila. Si el caller no tiene el precio/tiempo a mano, el renderer falla
 * back a tiempo relativo.
 */

import { cn } from '@/lib/utils';
import { fmt, relTime } from '@/lib/format';
import { Icon, type IconName } from '@/components/ui/Icon';
import { BucketChip } from '@/components/ui/BucketChip';
import type { Asset, PortfolioBucket, TxKind } from '@/lib/types';

/**
 * Shape mínima de transacción que TxRow consume. No usa el tipo `Transaction`
 * completo a propósito: el caller puede mappear desde la DB y agregar `note`
 * arbitrario sin tener que extender el tipo de dominio.
 */
export interface TxRowVM {
  id: string;
  kind: TxKind;
  date: string;
  qty: number;
  /** Precio unitario en moneda original. Opcional para `yield` que es 0. */
  unitPrice?: number;
  priceCurrency?: 'ARS' | 'USD' | string;
  bucket: PortfolioBucket;
  asset: Pick<Asset, 'id' | 'ticker' | 'type'>;
  account: { name: string };
  note?: string;
}

interface TxKindConfig {
  iconName: IconName;
  label: string;
  /** Clase Tailwind para color de texto + fondo del icono. */
  className: string;
  /** Signo del qty mostrado. `null` = sin signo (transfer/adjust). */
  sign: '+' | '-' | null;
}

const KIND_CONFIG: Record<TxKind, TxKindConfig> = {
  buy: { iconName: 'arrow-down', label: 'Compra', className: 'bg-positive/[0.12] text-positive', sign: '+' },
  sell: { iconName: 'arrow-up', label: 'Venta', className: 'bg-negative/[0.12] text-negative', sign: '-' },
  yield: { iconName: 'spark', label: 'Yield', className: 'bg-accent/[0.14] text-accent', sign: '+' },
  transfer_in: { iconName: 'arrow-down', label: 'Ingreso', className: 'bg-info/[0.14] text-info', sign: '+' },
  transfer_out: { iconName: 'arrow-up', label: 'Retiro / Egreso', className: 'bg-info/[0.14] text-info', sign: '-' },
  fee: { iconName: 'x', label: 'Comisión', className: 'bg-text-muted/10 text-text-secondary', sign: '-' },
  fx: { iconName: 'refresh', label: 'FX', className: 'bg-info/[0.14] text-info', sign: null },
  adjustment: { iconName: 'edit', label: 'Ajuste', className: 'bg-warning/[0.14] text-warning', sign: null },
};

interface TxRowProps {
  vm: TxRowVM;
  hidden?: boolean;
  divider?: boolean;
  onClick?: (txId: string) => void;
  className?: string;
}

export function TxRow({ vm, hidden = false, divider = false, onClick, className }: TxRowProps) {
  const cfg = KIND_CONFIG[vm.kind];
  const decimals = vm.asset.type === 'crypto' ? 4 : 0;
  const date = new Date(vm.date);
  const priceText =
    vm.unitPrice != null && vm.priceCurrency
      ? `${vm.priceCurrency === 'USD' ? 'US$' : '$'}${fmt(vm.unitPrice, vm.priceCurrency === 'USD' ? 2 : 0)}`
      : relTime(date);

  return (
    <button
      type="button"
      onClick={() => onClick?.(vm.id)}
      className={cn(
        'flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors',
        'hover:bg-bg-elevated/50',
        divider && 'border-b border-border-subtle',
        className,
      )}
    >
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', cfg.className)}>
        <Icon name={cfg.iconName} size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-text-primary">
            {cfg.label} · {vm.asset.ticker}
          </span>
          {vm.note && (
            <span className="text-[10px] italic text-text-muted">{vm.note}</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[11px] text-text-secondary">{vm.account.name}</span>
          <span className="text-[10px] text-text-muted">·</span>
          <BucketChip bucket={vm.bucket} small />
        </div>
      </div>
      <div className="text-right">
        <div className="text-[13px] font-semibold text-text-primary tabular-nums">
          {hidden ? '••••' : `${cfg.sign ?? ''}${fmt(vm.qty, decimals)}`}
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-text-muted">{priceText}</div>
      </div>
    </button>
  );
}
