/**
 * Lista completa de operaciones con la posibilidad de borrar — el botón
 * "deshacer" del chat funciona solo para la última, así que esta pantalla
 * existe para los casos donde el usuario quiere limpiar errores antiguos.
 *
 * Filtros: por kind (compra/venta/yield) y búsqueda por ticker. La búsqueda
 * vive en URL (`?q=BTC`) — comparte enlace y back/forward funciona.
 *
 * Borrado: el delete confirma en un modal, no in-place — borrar una tx
 * histórica recalcula TODO el FIFO/PnL hacia atrás, no es un undo barato.
 */

import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { fmt, fmtMoney, relTime } from '@/lib/format';
import { useUIStore } from '@/lib/store';
import { useAccounts, useAssets, useTransactions } from '@/lib/db/queries';
import { deleteTransaction } from '@/lib/db/mutations';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { TagBadge } from '@/components/ui/TagBadge';
import { BucketChip } from '@/components/ui/BucketChip';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { EditTxDialog } from '@/components/dialogs/EditTxDialog';
import type { PortfolioBucket, Transaction, TxKind } from '@/lib/types';

type Filter = 'all' | TxKind;

const FILTERS: ReadonlyArray<[Filter, string]> = [
  ['all', 'Todas'],
  ['buy', 'Compras'],
  ['sell', 'Ventas'],
  ['yield', 'Yields'],
];

export function Operaciones() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hidden } = useUIStore();
  const accounts = useAccounts();
  const assets = useAssets();
  const transactions = useTransactions();

  const [filter, setFilter] = useState<Filter>('all');
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const search = searchParams.get('q') ?? '';

  const filteredTxs = useMemo(() => {
    if (!transactions || !assets) return undefined;
    const q = search.trim().toUpperCase();
    return transactions.filter((tx) => {
      if (filter !== 'all' && tx.kind !== filter) return false;
      if (q) {
        const asset = assets.find((a) => a.id === tx.assetId);
        if (!asset || !asset.ticker.toUpperCase().includes(q)) return false;
      }
      return true;
    });
  }, [transactions, assets, filter, search]);

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteTransaction(pendingDelete.id);
      setPendingDelete(null);
    } catch (err) {
      console.error('No se pudo borrar', err);
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-bg-surface text-text-primary transition-colors hover:border-border-hover"
          aria-label="Volver"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 className="flex-1 text-[22px] font-semibold tracking-tight text-text-primary">
          Operaciones
        </h1>
        <div className="font-mono text-[11px] text-text-muted">
          {filteredTxs?.length ?? '—'} resultados
        </div>
      </div>

      {/* Búsqueda + filtros */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            <Icon name="search" size={16} />
          </span>
          <Input
            value={search}
            onChange={(e) => {
              const v = e.target.value;
              const next = new URLSearchParams(searchParams);
              if (v) next.set('q', v);
              else next.delete('q');
              setSearchParams(next, { replace: true });
            }}
            placeholder="Buscar por ticker (BTC, ETH, AAPL...)"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 self-start rounded-[10px] border border-border-subtle bg-bg-surface p-1">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                filter === id
                  ? 'bg-bg-elevated text-text-primary'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface">
        {filteredTxs === undefined && (
          <div className="px-4 py-6 text-center text-[13px] text-text-muted">Cargando…</div>
        )}
        {filteredTxs?.length === 0 && (
          <div className="px-4 py-6 text-center text-[13px] text-text-muted">
            Sin operaciones para este filtro
          </div>
        )}
        {filteredTxs?.map((tx, i) => (
          <OperacionRow
            key={tx.id}
            tx={tx}
            asset={assets?.find((a) => a.id === tx.assetId)}
            accountName={accounts?.find((a) => a.id === tx.accountId)?.name ?? tx.accountId}
            tag={accounts?.find((a) => a.id === tx.accountId)?.tag}
            divider={i < filteredTxs.length - 1}
            hidden={hidden}
            onEdit={() => setEditingTx(tx)}
            onDelete={() => setPendingDelete(tx)}
          />
        ))}
      </section>

      {/* Modal de confirmación de borrado */}
      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent
          title="Borrar operación"
          description="Esta acción no se puede deshacer. El holding y el PnL del activo se van a recalcular."
        >
          {pendingDelete && (
            <div className="mb-4 rounded-lg border border-border-subtle bg-bg-base p-3 text-[13px] text-text-secondary">
              <strong className="text-text-primary capitalize">
                {pendingDelete.kind}
              </strong>{' '}
              de {fmt(pendingDelete.qty, 4)}{' '}
              {assets?.find((a) => a.id === pendingDelete.assetId)?.ticker ?? '?'}
              {pendingDelete.unitPrice > 0 && (
                <>
                  {' '}a {fmtMoney(pendingDelete.unitPrice, pendingDelete.priceCurrency)}
                </>
              )}{' '}
              · {new Date(pendingDelete.date).toLocaleDateString('es-AR')}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              full
              onClick={() => setPendingDelete(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              full
              onClick={handleConfirmDelete}
              leftIcon="x"
            >
              Borrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de edición */}
      <EditTxDialog
        open={!!editingTx}
        onOpenChange={(o) => !o && setEditingTx(null)}
        tx={editingTx}
      />
    </div>
  );
}

// ─── Sub-componente fila ───────────────────────────────────────────────────

function OperacionRow({
  tx,
  asset,
  accountName,
  tag,
  divider,
  hidden,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  asset?: { ticker: string; type: string };
  accountName: string;
  tag?: 'A' | 'B';
  divider: boolean;
  hidden: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg = KIND_CONFIG[tx.kind];
  const decimals = asset?.type === 'crypto' ? 4 : 0;
  const date = new Date(tx.date);

  // Detectar cambio de cartera para mostrar label y valor correctos.
  const isBucketTransfer =
    (tx.kind === 'transfer_out' || tx.kind === 'transfer_in') &&
    /mover a cartera|desde cartera/i.test(tx.notes ?? '');
  const label = isBucketTransfer ? 'Cambio de cartera' : cfg.label;

  const priceText = (() => {
    if (tx.unitPrice <= 0) return relTime(date);
    const curr = tx.priceCurrency === 'USD' ? 'US$' : '$';
    const dec = tx.priceCurrency === 'USD' ? 2 : 0;
    // Transfers: mostrar total en vez de precio unitario.
    if (tx.kind === 'transfer_in' || tx.kind === 'transfer_out') {
      return `${curr}${fmt(tx.qty * tx.unitPrice, dec)}`;
    }
    return `${curr}${fmt(tx.unitPrice, dec)}`;
  })();

  const bucket = bucketFromPortfolioId(tx.portfolioId);
  const isSeed = tx.id.startsWith('seed-tx-');

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3.5 py-3',
        divider && 'border-b border-border-subtle',
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          cfg.className,
        )}
      >
        <Icon name={cfg.iconName as 'arrow-down'} size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-text-primary">
            {label} · {asset?.ticker ?? '?'}
          </span>
          {tx.notes && (
            <span className="text-[10px] italic text-text-muted">{tx.notes}</span>
          )}
          {isSeed && (
            <span className="rounded bg-bg-base px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-text-muted">
              inicial
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[11px] text-text-secondary">{accountName}</span>
          {tag && <TagBadge tag={tag} />}
          <span className="text-[10px] text-text-muted">·</span>
          <BucketChip bucket={bucket} small />
        </div>
      </div>
      <div className="text-right">
        <div className="text-[13px] font-semibold text-text-primary tabular-nums">
          {hidden ? '••••' : `${cfg.sign ?? ''}${fmt(tx.qty, decimals)}`}
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-text-muted">{priceText}</div>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onEdit}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
          aria-label={`Editar ${cfg.label} de ${asset?.ticker ?? '?'}`}
        >
          <Icon name="edit" size={14} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-negative/[0.12] hover:text-negative"
          aria-label={`Borrar ${cfg.label} de ${asset?.ticker ?? '?'}`}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Config / helpers ──────────────────────────────────────────────────────

const KIND_CONFIG: Record<TxKind, { iconName: string; label: string; className: string; sign: '+' | '-' | null }> = {
  buy: { iconName: 'arrow-down', label: 'Compra', className: 'bg-positive/[0.12] text-positive', sign: '+' },
  sell: { iconName: 'arrow-up', label: 'Venta', className: 'bg-negative/[0.12] text-negative', sign: '-' },
  yield: { iconName: 'spark', label: 'Yield', className: 'bg-accent/[0.14] text-accent', sign: '+' },
  transfer_in: { iconName: 'arrow-down', label: 'Ingreso', className: 'bg-info/[0.14] text-info', sign: '+' },
  transfer_out: { iconName: 'arrow-up', label: 'Retiro / Egreso', className: 'bg-info/[0.14] text-info', sign: '-' },
  fee: { iconName: 'x', label: 'Comisión', className: 'bg-text-muted/10 text-text-secondary', sign: '-' },
  fx: { iconName: 'refresh', label: 'FX', className: 'bg-info/[0.14] text-info', sign: null },
  adjustment: { iconName: 'edit', label: 'Ajuste', className: 'bg-warning/[0.14] text-warning', sign: null },
};

function bucketFromPortfolioId(portfolioId: string): PortfolioBucket {
  const m = portfolioId.match(/^pf-(corto|medio|largo|trade)$/);
  if (m) return m[1] as PortfolioBucket;
  return 'largo';
}
