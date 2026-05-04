/**
 * Cuentas — lista de cuentas con split A/B (declarado/privado) visualizado
 * como barra horizontal. Filtro por tag.
 *
 * Decisión: el icono de cada cuenta usa el mismo color del tag (info/warning)
 * porque queremos que A↔B sea identificable de un vistazo, no solo por la
 * etiqueta textual.
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/format';
import { useUIStore } from '@/lib/store';
import { useAccounts } from '@/lib/db/queries';
import { useFx, useHoldings, usePriceMap } from '@/lib/db/derived';
import { convertUSD, priceInUSD } from '@/lib/holdings';
import { Icon, type IconName } from '@/components/ui/Icon';
import { TagBadge } from '@/components/ui/TagBadge';
import { Button } from '@/components/ui/Button';
import { NuevaCuentaDialog } from '@/components/dialogs/NuevaCuentaDialog';
import type { AccountKind, AccountTag } from '@/lib/types';

type Filter = 'all' | 'A' | 'B';

const FILTERS: Array<[Filter, string]> = [
  ['all', 'Todas'],
  ['A', 'A · Declarado'],
  ['B', 'B · Privado'],
];

const ACCOUNT_ICON: Record<AccountKind, IconName> = {
  broker: 'briefcase',
  exchange: 'coins',
  wallet: 'wallet',
  bank: 'bank',
  cash: 'safe',
};

export function Cuentas() {
  const { displayCurrency, hidden } = useUIStore();
  const accounts = useAccounts();
  const holdings = useHoldings();
  const prices = usePriceMap();
  const fx = useFx();
  const [filter, setFilter] = useState<Filter>('all');
  const [newAccountOpen, setNewAccountOpen] = useState(false);

  // Calcular valor por cuenta (suma de todos los holdings de esa cuenta)
  const enriched = useMemo(() => {
    if (!accounts || !holdings || !prices) return undefined;
    return accounts.map((acc) => {
      const accHoldings = holdings.filter((h) => h.accountId === acc.id);
      const valueUSD = accHoldings.reduce((sum, h) => {
        const p = prices.get(h.assetId);
        if (!p) return sum;
        return sum + h.qty * priceInUSD(p, fx);
      }, 0);
      return { ...acc, valueUSD, positions: accHoldings.length };
    });
  }, [accounts, holdings, prices, fx]);

  const totals = useMemo(() => {
    if (!enriched) return { A: 0, B: 0, all: 0 };
    const A = enriched.filter((a) => a.tag === 'A').reduce((s, a) => s + a.valueUSD, 0);
    const B = enriched.filter((a) => a.tag === 'B').reduce((s, a) => s + a.valueUSD, 0);
    return { A, B, all: A + B };
  }, [enriched]);

  const filtered = useMemo(() => {
    if (!enriched) return undefined;
    return enriched
      .filter((a) => filter === 'all' || a.tag === filter)
      .sort((a, b) => b.valueUSD - a.valueUSD);
  }, [enriched, filter]);

  return (
    <div className="flex flex-col gap-3.5 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">
          Cuentas
        </h1>
        <Button
          variant="soft"
          size="sm"
          leftIcon="plus"
          onClick={() => setNewAccountOpen(true)}
        >
          Nueva
        </Button>
      </div>

      {/* Split A / B */}
      <section className="rounded-2xl border border-border-subtle bg-bg-surface p-3.5">
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Distribución por etiqueta
        </div>
        <div className="mb-2.5 flex h-2 overflow-hidden rounded bg-bg-base">
          <div
            className="bg-info transition-all"
            style={{ flex: totals.A || 0.0001 }}
          />
          <div
            className="bg-warning transition-all"
            style={{ flex: totals.B || 0.0001 }}
          />
        </div>
        <div className="flex gap-3">
          <SplitColumn
            tag="A"
            valueUSD={totals.A}
            totalUSD={totals.all}
            displayCurrency={displayCurrency}
            fx={fx}
            hidden={hidden}
          />
          <SplitColumn
            tag="B"
            valueUSD={totals.B}
            totalUSD={totals.all}
            displayCurrency={displayCurrency}
            fx={fx}
            hidden={hidden}
          />
        </div>
      </section>

      {/* Filtro */}
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

      {/* Lista */}
      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface">
        {filtered?.length === 0 && (
          <div className="px-4 py-6 text-center text-[13px] text-text-muted">
            Sin cuentas con esta etiqueta
          </div>
        )}
        {filtered?.map((acc, i) => (
          <div
            key={acc.id}
            className={cn(
              'flex items-center gap-3 px-3.5 py-3.5',
              i < filtered.length - 1 && 'border-b border-border-subtle',
            )}
          >
            <div
              className={cn(
                'flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px]',
                acc.tag === 'A' ? 'bg-info/[0.14] text-info' : 'bg-warning/[0.14] text-warning',
              )}
            >
              <Icon name={ACCOUNT_ICON[acc.kind]} size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-text-primary">{acc.name}</span>
                <TagBadge tag={acc.tag} />
              </div>
              <div className="mt-0.5 text-[11px] capitalize text-text-secondary">
                {acc.kind} · {acc.positions}{' '}
                {acc.positions === 1 ? 'activo' : 'activos'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-text-primary tabular-nums">
                {hidden
                  ? '••••'
                  : fmtMoney(convertUSD(acc.valueUSD, displayCurrency, fx), displayCurrency)}
              </div>
              {acc.currency && (
                <div className="mt-0.5 font-mono text-[10px] uppercase text-text-muted">
                  {acc.currency}
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      <NuevaCuentaDialog open={newAccountOpen} onOpenChange={setNewAccountOpen} />
    </div>
  );
}

// ─── Sub-componente ────────────────────────────────────────────────────────

function SplitColumn({
  tag,
  valueUSD,
  totalUSD,
  displayCurrency,
  fx,
  hidden,
}: {
  tag: AccountTag;
  valueUSD: number;
  totalUSD: number;
  displayCurrency: 'USD' | 'ARS' | 'USDT' | 'BTC' | 'EUR';
  fx: { ccl: number };
  hidden: boolean;
}) {
  const pct = totalUSD > 0 ? (valueUSD / totalUSD) * 100 : 0;
  return (
    <div className="flex-1">
      <div className="mb-0.5 flex items-center gap-1.5">
        <span
          className={cn(
            'h-2 w-2 rounded-sm',
            tag === 'A' ? 'bg-info' : 'bg-warning',
          )}
        />
        <TagBadge tag={tag} full />
      </div>
      <div className="text-base font-semibold text-text-primary tabular-nums">
        {hidden ? '••••' : fmtMoney(convertUSD(valueUSD, displayCurrency, fx), displayCurrency)}
      </div>
      <div className="mt-0.5 text-[11px] text-text-muted">
        {hidden ? '•' : `${pct.toFixed(1)}%`}
      </div>
    </div>
  );
}
