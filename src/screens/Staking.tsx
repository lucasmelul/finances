/**
 * Pantalla Staking — overview de reglas + performance esperada vs real.
 *
 * Layout:
 *  1. Resumen global (esperado / cobrado / performance %)
 *  2. Lista de reglas con badge de estado
 *  3. Botón "Nueva regla"
 *
 * Cuando no hay reglas, mostramos empty state con CTA al modal.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { fmt, fmtMoney } from '@/lib/format';
import { useUIStore } from '@/lib/store';
import { useStakingSummary } from '@/lib/db/derived';
import { useAccounts, useAssets } from '@/lib/db/queries';
import {
  activateStakingRule,
  deactivateStakingRule,
  deleteStakingRule,
} from '@/lib/db/mutations';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { TagBadge } from '@/components/ui/TagBadge';
import { BucketChip } from '@/components/ui/BucketChip';
import { NuevaReglaStakingDialog } from '@/components/dialogs/NuevaReglaStakingDialog';
import { EditarReglaStakingDialog } from '@/components/dialogs/EditarReglaStakingDialog';
import type { RulePerformance } from '@/lib/staking';
import type { PortfolioBucket, StakingRule } from '@/lib/types';

export function Staking() {
  const summary = useStakingSummary();
  const accounts = useAccounts();
  const assets = useAssets();
  const { hidden } = useUIStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<StakingRule | null>(null);

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">
            Staking
          </h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Reglas activas y performance vs lo esperado.
          </p>
        </div>
        <Button
          variant="soft"
          size="sm"
          leftIcon="plus"
          onClick={() => setDialogOpen(true)}
        >
          Nueva
        </Button>
      </header>

      {summary && summary.rules.length === 0 && (
        <div className="rounded-2xl border border-border-subtle bg-bg-surface px-4 py-8 text-center">
          <p className="text-[13px] text-text-secondary">
            No tenés reglas de staking cargadas.
          </p>
          <p className="mt-1 text-[11px] text-text-muted">
            Asociá un activo a un APY para que la app mida si tu staking rinde
            como esperás.
          </p>
          <Button
            className="mt-3"
            variant="primary"
            size="md"
            leftIcon="plus"
            onClick={() => setDialogOpen(true)}
          >
            Cargar primera regla
          </Button>
        </div>
      )}

      {summary && summary.rules.length > 0 && (
        <>
          {/* Resumen global */}
          <SummaryCard summary={summary} hidden={hidden} />

          {/* Lista de reglas */}
          <section>
            <div className="mb-2.5 px-1 text-sm font-semibold tracking-tight text-text-primary">
              Reglas
            </div>
            <div className="flex flex-col gap-2">
              {summary.rules.map((p) => (
                <RuleCard
                  key={p.rule.id}
                  perf={p}
                  accountName={
                    accounts?.find((a) => a.id === p.rule.accountId)?.name ?? '—'
                  }
                  accountTag={
                    accounts?.find((a) => a.id === p.rule.accountId)?.tag ?? 'A'
                  }
                  assetTicker={
                    assets?.find((a) => a.id === p.rule.assetId)?.ticker ?? '—'
                  }
                  hidden={hidden}
                  onEdit={() => setEditRule(p.rule)}
                  onToggleActive={async () => {
                    if (p.rule.active) await deactivateStakingRule(p.rule.id);
                    else await activateStakingRule(p.rule.id);
                  }}
                  onDelete={async () => {
                    if (
                      window.confirm(
                        `¿Borrar la regla de staking de ${p.asset?.ticker}? Las tx de yield no se eliminan.`,
                      )
                    ) {
                      await deleteStakingRule(p.rule.id);
                    }
                  }}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <NuevaReglaStakingDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      {editRule && (
        <EditarReglaStakingDialog
          rule={editRule}
          open={!!editRule}
          onOpenChange={(o) => { if (!o) setEditRule(null); }}
        />
      )}
    </div>
  );
}

// ─── Sub-componentes ───────────────────────────────────────────────────────

function SummaryCard({
  summary,
  hidden,
}: {
  summary: import('@/lib/staking').StakingSummary;
  hidden: boolean;
}) {
  const positive = summary.performancePct >= 90;
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        Performance global
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatCell
          label="Esperado"
          value={hidden ? '••••' : fmtMoney(summary.totalExpectedUSD, 'USD')}
        />
        <StatCell
          label="Cobrado"
          value={hidden ? '••••' : fmtMoney(summary.totalActualUSD, 'USD')}
        />
        <StatCell
          label="Performance"
          value={
            hidden
              ? '••••'
              : summary.totalExpectedUSD > 0
                ? `${summary.performancePct.toFixed(0)}%`
                : '—'
          }
          tone={
            summary.totalExpectedUSD > 0
              ? positive
                ? 'positive'
                : 'negative'
              : 'neutral'
          }
        />
      </div>
      <div className="mt-2 text-[11px] text-text-muted">
        {summary.rulesAboveThreshold} regla
        {summary.rulesAboveThreshold === 1 ? '' : 's'} rinden como esperado
        {summary.rulesBelowThreshold > 0 && (
          <> · {summary.rulesBelowThreshold} debajo del 90%</>
        )}
      </div>
    </section>
  );
}

function StatCell({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const cls = {
    neutral: 'text-text-primary',
    positive: 'text-positive',
    negative: 'text-negative',
  }[tone];
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-base p-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className={cn('mt-0.5 text-[14px] font-semibold tabular-nums', cls)}>
        {value}
      </div>
    </div>
  );
}

function RuleCard({
  perf,
  accountName,
  accountTag,
  assetTicker,
  hidden,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  perf: RulePerformance;
  accountName: string;
  accountTag: 'A' | 'B';
  assetTicker: string;
  hidden: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const { rule } = perf;
  const bucket = bucketFromPortfolioId(rule.portfolioId);
  // Status del rendimiento
  const hasExpected = perf.expectedQty > 0;
  let status: 'good' | 'low' | 'unknown' | 'inactive' = 'unknown';
  if (!rule.active) status = 'inactive';
  else if (!hasExpected) status = 'unknown';
  else if (perf.performancePct >= 90) status = 'good';
  else status = 'low';

  return (
    <article
      className={cn(
        'rounded-2xl border bg-bg-surface p-3.5 transition-colors',
        rule.active ? 'border-border-subtle' : 'border-border-subtle/40 opacity-70',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-text-primary">
              {assetTicker}
            </span>
            {perf.rewardAsset && perf.rewardAsset.id !== perf.rule.assetId && (
              <span className="text-text-muted text-[11px]"> → recompensa en <strong>{perf.rewardAsset.ticker}</strong></span>
            )}
            <span className="text-[11px] text-text-secondary">
              en {accountName}
            </span>
            <TagBadge tag={accountTag} />
            <BucketChip bucket={bucket} small />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-text-muted">
            <span className="tabular-nums">{rule.apyPct}% APY</span>
            <span>·</span>
            <span className="capitalize">{rule.payoutFrequency === 'daily' ? 'diario' : rule.payoutFrequency === 'weekly' ? 'semanal' : 'mensual'}</span>
            {rule.active && (
              <>
                <span>·</span>
                <span className="tabular-nums">
                  {Math.round(perf.daysSinceLastAccrual)}d sin acreditar
                </span>
              </>
            )}
          </div>
        </div>
        <StatusBadge status={status} performancePct={perf.performancePct} />
      </div>

      {/* Métricas */}
      {rule.active && hasExpected && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <SmallStat
            label="Esperado"
            value={hidden ? '••' : `${fmt(perf.expectedQty, 4)} ${assetTicker}`}
            sub={hidden ? '' : fmtMoney(perf.expectedUSD, 'USD')}
          />
          <SmallStat
            label="Cobrado"
            value={hidden ? '••' : `${fmt(perf.actualQty, 6)} ${perf.rewardAsset?.ticker ?? assetTicker}`}
            sub={hidden ? '' : fmtMoney(perf.actualUSD, 'USD')}
          />
          <SmallStat
            label="Diff USD"
            value={
              hidden
                ? '••'
                : `${perf.actualUSD >= perf.expectedUSD ? '+' : ''}${fmtMoney(perf.actualUSD - perf.expectedUSD, 'USD')}`
            }
            tone={perf.actualUSD >= perf.expectedUSD ? 'positive' : 'negative'}
          />
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" leftIcon="edit" onClick={onEdit}>
          Editar
        </Button>
        <Button variant="ghost" size="sm" onClick={onToggleActive}>
          {rule.active ? 'Pausar' : 'Reactivar'}
        </Button>
        <Button variant="danger" size="sm" leftIcon="x" onClick={onDelete}>
          Borrar
        </Button>
      </div>
    </article>
  );
}

function StatusBadge({
  status,
  performancePct,
}: {
  status: 'good' | 'low' | 'unknown' | 'inactive';
  performancePct: number;
}) {
  const cfg = {
    good: { cls: 'bg-positive/[0.14] text-positive', label: 'Rinde OK' },
    low: { cls: 'bg-negative/[0.14] text-negative', label: 'Bajo' },
    unknown: { cls: 'bg-text-muted/15 text-text-secondary', label: 'Sin datos' },
    inactive: { cls: 'bg-text-muted/15 text-text-muted', label: 'Pausada' },
  }[status];
  return (
    <div className="text-right">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
          cfg.cls,
        )}
      >
        {status === 'good' && <Icon name="check" size={10} />}
        {cfg.label}
      </span>
      {(status === 'good' || status === 'low') && (
        <div className="mt-0.5 text-[11px] text-text-secondary tabular-nums">
          {performancePct.toFixed(0)}%
        </div>
      )}
    </div>
  );
}

function SmallStat({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const cls = {
    neutral: 'text-text-primary',
    positive: 'text-positive',
    negative: 'text-negative',
  }[tone];
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-base p-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className={cn('mt-px text-[11px] font-semibold tabular-nums', cls)}>
        {value}
      </div>
      {sub && (
        <div className="text-[9px] text-text-muted tabular-nums">{sub}</div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function bucketFromPortfolioId(portfolioId: string): PortfolioBucket {
  const m = portfolioId.match(/^pf-(corto|medio|largo|trade)$/);
  if (m) return m[1] as PortfolioBucket;
  return 'largo';
}
