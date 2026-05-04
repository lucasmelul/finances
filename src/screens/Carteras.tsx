/**
 * Carteras (4 buckets temporales). Tabs arriba para cambiar de bucket;
 * tarjeta resumen, donut de distribución por activo, y lista de holdings.
 *
 * El bucket activo se mantiene en URL (`/carteras/:bucket`) — mejor para
 * deep-link y para volver desde "ver todo" en Inicio.
 */

import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/format';
import { useUIStore } from '@/lib/store';
import { useAssets } from '@/lib/db/queries';
import { useFx, useHoldings, usePriceMap } from '@/lib/db/derived';
import { buildAssetRowVMs, convertUSD } from '@/lib/holdings';
import { BUCKET_LABEL } from '@/components/ui/BucketChip';
import { Donut } from '@/components/charts/Donut';
import { AssetRow } from '@/components/composite/AssetRow';
import { portfolioIdForBucket } from '@/data/portfolios';
import type { PortfolioBucket } from '@/lib/types';

const BUCKETS: PortfolioBucket[] = ['largo', 'medio', 'corto', 'trade'];

const BUCKET_DESC: Record<PortfolioBucket, string> = {
  largo: 'HODL, jubilación',
  medio: '6 m – 2 años',
  corto: 'Objetivos < 6 meses',
  trade: 'Especulativo con S/R',
};

/** Paleta para el donut (loop si hay >6 activos). */
const SLICE_COLORS = ['#6366F1', '#22D3EE', '#34D399', '#FB923C', '#A78BFA', '#F472B6'];

function isBucket(value: string | undefined): value is PortfolioBucket {
  return value === 'largo' || value === 'medio' || value === 'corto' || value === 'trade';
}

export function Carteras() {
  const navigate = useNavigate();
  const params = useParams<{ bucket?: string }>();
  const activeBucket: PortfolioBucket = isBucket(params.bucket) ? params.bucket : 'largo';

  const { displayCurrency, hidden } = useUIStore();
  const assets = useAssets();
  const holdings = useHoldings();
  const prices = usePriceMap();
  const fx = useFx();

  const portfolioId = portfolioIdForBucket(activeBucket);

  const bucketRows = useMemo(() => {
    if (!holdings || !assets || !prices) return undefined;
    const filtered = holdings.filter((h) => h.portfolioId === portfolioId);
    return buildAssetRowVMs(filtered, assets, prices, fx, displayCurrency);
  }, [holdings, assets, prices, fx, displayCurrency, portfolioId]);

  const summary = useMemo(() => {
    if (!bucketRows) return undefined;
    const valueUSD = bucketRows.reduce((s, r) => s + r.valueUSD, 0);
    const costUSD = bucketRows.reduce((s, r) => s + r.costUSD, 0);
    const pnlUSD = valueUSD - costUSD;
    const pnlPct = costUSD > 0 ? (pnlUSD / costUSD) * 100 : 0;
    return {
      valueDisplay: convertUSD(valueUSD, displayCurrency, fx),
      pnlDisplay: convertUSD(pnlUSD, displayCurrency, fx),
      pnlPct,
      positions: bucketRows.length,
      valueUSD,
    };
  }, [bucketRows, displayCurrency, fx]);

  return (
    <div className="flex flex-col gap-3.5 pb-6">
      {/* Bucket tabs */}
      <div className="flex gap-1.5 rounded-xl border border-border-subtle bg-bg-surface p-1">
        {BUCKETS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => navigate(`/carteras/${b}`)}
            className={cn(
              'h-9 flex-1 rounded-lg text-xs font-semibold transition-colors',
              activeBucket === b
                ? 'bg-bg-elevated text-text-primary shadow-[0_1px_0_hsl(var(--border-hover))]'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {BUCKET_LABEL[b]}
          </button>
        ))}
      </div>

      {/* Resumen del bucket */}
      <section className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
            {BUCKET_DESC[activeBucket]}
          </div>
          <div className="font-mono text-[11px] text-text-muted">
            {summary?.positions ?? '—'} pos.
          </div>
        </div>
        <div className="text-[28px] font-semibold tracking-tight text-text-primary tabular-nums">
          {hidden
            ? '••••••'
            : summary
              ? fmtMoney(summary.valueDisplay, displayCurrency)
              : '—'}
        </div>
        <div className="mt-1 flex items-center gap-2.5 text-[13px] tabular-nums">
          <span
            className={cn(
              'font-semibold',
              (summary?.pnlDisplay ?? 0) >= 0 ? 'text-positive' : 'text-negative',
            )}
          >
            {hidden || !summary
              ? '•••'
              : `${summary.pnlDisplay >= 0 ? '+' : ''}${fmtMoney(summary.pnlDisplay, displayCurrency)}`}
          </span>
          <span
            className={cn(
              'font-medium',
              (summary?.pnlPct ?? 0) >= 0 ? 'text-positive' : 'text-negative',
            )}
          >
            {hidden || !summary
              ? '•••'
              : `${summary.pnlPct >= 0 ? '+' : ''}${summary.pnlPct.toFixed(2)}%`}
          </span>
          <span className="text-[11px] text-text-muted">· total</span>
        </div>
      </section>

      {/* Distribución (donut) */}
      <section className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Distribución
        </div>
        <div className="flex items-center gap-4">
          <Donut
            slices={(bucketRows ?? []).slice(0, 6).map((r, i) => ({
              label: r.asset.ticker,
              value: r.valueUSD,
              color: SLICE_COLORS[i % SLICE_COLORS.length],
            }))}
            size={130}
            thickness={18}
            label={hidden ? '••' : `${bucketRows?.length ?? 0}`}
            sublabel="ACTIVOS"
          />
          <div className="flex flex-1 flex-col gap-1.5">
            {bucketRows?.slice(0, 5).map((r, i) => {
              const pct = summary?.valueUSD ? (r.valueUSD / summary.valueUSD) * 100 : 0;
              return (
                <div key={r.assetId} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                  />
                  <span className="flex-1 font-medium text-text-primary">
                    {r.asset.ticker}
                  </span>
                  <span className="text-text-secondary tabular-nums">
                    {hidden ? '••' : `${pct.toFixed(1)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Holdings */}
      <section>
        <div className="mb-2.5 px-1 text-sm font-semibold text-text-primary">Holdings</div>
        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface">
          {bucketRows?.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-text-muted">
              Este bucket no tiene posiciones.
            </div>
          )}
          {bucketRows?.map((r, i) => (
            <AssetRow
              key={r.assetId}
              vm={r}
              displayCurrency={displayCurrency}
              hidden={hidden}
              divider={i < (bucketRows?.length ?? 0) - 1}
              onClick={(id) => navigate(`/asset/${id}`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
