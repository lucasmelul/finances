/**
 * Inicio — cockpit de decisión (SPEC V2 §12 / PROMPT 13).
 *
 * Orden de bloques:
 *  1. Banner demo (solo si hay tx del seed)
 *  2. Hero: Hoy vale · Invertiste · Ganancia (separación explícita capital ↔ resultado)
 *  3. "Qué hacer hoy" — Insights top 3
 *  4. Capital Timeline (curva REAL: invertido vs valor)
 *  5. FX card (live)
 *  6. Mis activos (top movers con DCA inline)
 *  7. Operaciones recientes
 *  8. Acciones rápidas (Operar / Oportunidades / Operaciones)
 *
 * Política de loading: si los hooks de DB devuelven `undefined` (primera
 * lectura), mostramos esqueletos opacos en vez de "nada" — evita el flash.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmt, fmtMoney, fmtTime, relTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/store';
import { useAccounts, useAssets, useTransactions } from '@/lib/db/queries';
import {
  useCapitalTimeline,
  useFx,
  useFxFreshness,
  useHoldings,
  useInsights,
  useLiquidityMetrics,
  usePortfolioMetrics,
  usePriceMap,
  useRiskMetrics,
} from '@/lib/db/derived';
import { buildAssetRowVMs } from '@/lib/holdings';
import { metricToDisplay } from '@/lib/metrics';
import type { RiskMetrics } from '@/lib/metrics';
import type { TimelineRange } from '@/lib/timeline';
import { Icon, type IconName } from '@/components/ui/Icon';
import { AssetRow } from '@/components/composite/AssetRow';
import { InsightCard } from '@/components/composite/InsightCard';
import { TipsCarousel } from '@/components/composite/TipsCarousel';
import { TxRow, type TxRowVM } from '@/components/composite/TxRow';
import { generateTips } from '@/lib/tips';
import type { Account, Asset, PortfolioBucket, Transaction } from '@/lib/types';

export function Inicio() {
  const navigate = useNavigate();
  const { displayCurrency, hidden } = useUIStore();

  const accounts = useAccounts();
  const assets = useAssets();
  const transactions = useTransactions();
  const holdings = useHoldings();
  const prices = usePriceMap();
  const fx = useFx();
  const portfolio = usePortfolioMetrics();
  const risk = useRiskMetrics();
  const liquidity = useLiquidityMetrics();
  const insights = useInsights();

  const tips = useMemo(
    () => generateTips({ assets, holdings, prices, fx, portfolio, risk, liquidity }),
    [assets, holdings, prices, fx, portfolio, risk, liquidity],
  );

  // VM de filas de activos (top movers).
  const rows = useMemo(() => {
    if (!holdings || !assets || !prices) return undefined;
    return buildAssetRowVMs(holdings, assets, prices, fx, displayCurrency);
  }, [holdings, assets, prices, fx, displayCurrency]);

  // VM de tx recientes — junta cada tx con asset y account.
  const recentTxVMs = useMemo<TxRowVM[] | undefined>(() => {
    if (!transactions || !assets || !accounts) return undefined;
    // Filtramos las "buy" iniciales del seed — no son operaciones reales del
    // usuario, solo materializan el holding.
    const realTxs = transactions.filter((t) => !t.id.startsWith('seed-tx-'));
    return realTxs.slice(0, 4).map((tx) => txToVM(tx, assets, accounts));
  }, [transactions, assets, accounts]);

  // Hay datos de demo cargados (seed-tx-*)? Si sí, mostramos banner para
  // que el usuario sepa que NO son sus datos reales.
  const hasDemoData = transactions?.some((t) => t.id.startsWith('seed-tx-')) ?? false;

  // Sin cuentas reales y sin datos de demo → onboarding
  const showOnboarding = accounts !== undefined && accounts.length === 0 && !hasDemoData;

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Banner de demo — visible solo si hay tx del seed. Lleva a Settings
          para resetear y empezar limpio. */}
      {hasDemoData && (
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/[0.08] px-3 py-2.5 text-left transition-colors hover:bg-warning/[0.12]"
        >
          <Icon name="flame" size={16} color="hsl(var(--warning))" />
          <div className="flex-1 text-[12px] leading-snug text-text-primary">
            <strong>Datos de demostración cargados.</strong>{' '}
            <span className="text-text-secondary">
              Tocá acá para borrar todo y empezar con tus datos reales.
            </span>
          </div>
          <Icon name="arrow-right" size={14} color="hsl(var(--warning))" />
        </button>
      )}

      {/* Banner de onboarding — visible cuando el usuario no tiene cuentas. */}
      {showOnboarding && (
        <div className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] p-4">
          <div className="flex items-center gap-2">
            <Icon name="spark" size={20} color="hsl(var(--accent))" />
            <span className="text-sm font-semibold text-text-primary">
              Bienvenido a tu portfolio
            </span>
          </div>
          <p className="text-[12px] leading-relaxed text-text-secondary">
            Todavía no tenés cuentas cargadas. Creá tu primera cuenta (broker, exchange o wallet)
            y empezá a registrar tus inversiones.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate('/cuentas')}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Icon name="plus" size={13} />
              Crear cuenta
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:bg-bg-elevated"
            >
              Cargar datos demo
            </button>
          </div>
        </div>
      )}

      {/* ─── 1. HERO: capital invertido / valor / ganancia ─── */}
      <Hero
        portfolio={portfolio}
        displayCurrency={displayCurrency}
        fx={fx}
        hidden={hidden}
      />

      {/* ─── 2. Distribución por tipo ─── */}
      {risk && !hidden && (
        <AllocationBar risk={risk} hidden={hidden} />
      )}

      {/* ─── 3. INSIGHTS — "Qué hacer hoy" ─── */}
      {insights && insights.length > 0 && !hidden && (
        <InsightsBlock
          insights={insights}
          onSeeAll={() => navigate('/insights')}
        />
      )}

      {/* ─── 3. Capital Timeline ─── */}
      <CapitalTimelineCard hidden={hidden} />

      {/* ─── 4. FX card ─── */}
      <FxCard />

      {/* ─── 5. Tips carousel ─── */}
      {tips.length > 0 && (
        <section>
          <div className="mb-2.5 px-1">
            <h2 className="text-sm font-semibold tracking-tight text-text-primary">
              Tips e insights
            </h2>
          </div>
          <TipsCarousel tips={tips} />
        </section>
      )}

      {/* ─── 6. Top activos ─── */}
      <section>
        <div className="mb-2.5 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold tracking-tight text-text-primary">
            Mis activos
          </h2>
          <button
            type="button"
            onClick={() => navigate('/carteras')}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline"
          >
            Ver todo <Icon name="arrow-right" size={12} />
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface">
          {rows === undefined && <SkeletonRows count={3} />}
          {rows?.slice(0, 5).map((r, i) => (
            <AssetRow
              key={r.assetId}
              vm={r}
              displayCurrency={displayCurrency}
              hidden={hidden}
              divider={i < Math.min(rows.length, 5) - 1}
              onClick={(id) => navigate(`/asset/${id}`)}
            />
          ))}
        </div>
      </section>

      {/* ─── 6. Operaciones recientes ─── */}
      <section>
        <div className="mb-2.5 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold tracking-tight text-text-primary">
            Operaciones recientes
          </h2>
          <button
            type="button"
            onClick={() => navigate('/operaciones')}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline"
          >
            Ver todo <Icon name="arrow-right" size={12} />
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface">
          {recentTxVMs === undefined && <SkeletonRows count={3} />}
          {recentTxVMs?.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-text-muted">
              Sin operaciones todavía
            </div>
          )}
          {recentTxVMs?.map((tx, i) => (
            <TxRow
              key={tx.id}
              vm={tx}
              hidden={hidden}
              divider={i < (recentTxVMs?.length ?? 0) - 1}
            />
          ))}
        </div>
      </section>

      {/* ─── 7. Acciones rápidas ─── */}
      <QuickActions />
    </div>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────

/**
 * Hero principal del Home. Triplet de cards: "Hoy vale" / "Invertiste" / "Ganancia".
 * Diseño key: la ganancia se SEPARA del valor para que el usuario distinga
 * cuánta plata puso vs cuánta tiene HOY (es la pregunta más frecuente).
 */
function Hero({
  portfolio,
  displayCurrency,
  fx,
  hidden,
}: {
  portfolio: ReturnType<typeof usePortfolioMetrics>;
  displayCurrency: import('@/lib/types').Currency;
  fx: import('@/lib/holdings').FxView;
  hidden: boolean;
}) {
  const valueDisplay = portfolio
    ? metricToDisplay(portfolio.totalValueUSD, displayCurrency, fx)
    : 0;
  const investedDisplay = portfolio
    ? metricToDisplay(portfolio.totalInvestedUSD, displayCurrency, fx)
    : 0;
  const pnlDisplay = portfolio
    ? metricToDisplay(portfolio.totalPnLUSD, displayCurrency, fx)
    : 0;
  const positive = (portfolio?.totalPnLUSD ?? 0) >= 0;

  return (
    <header className="px-1 pt-2">
      {/* Línea de "patrimonio en vivo" — preserva el dot animado */}
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary">
        <span>Patrimonio</span>
        <span
          className="inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-positive"
          style={{ boxShadow: '0 0 8px hsl(var(--positive))' }}
        />
        <span className="text-text-muted normal-case tracking-normal">en vivo</span>
      </div>

      {/* Valor grande */}
      <div className="mb-1 text-[38px] font-semibold tracking-tighter text-text-primary tabular-nums">
        {hidden
          ? '••••••••'
          : portfolio
            ? fmtMoney(valueDisplay, displayCurrency)
            : '—'}
      </div>

      {/* PnL absoluto + % */}
      <div className="mb-3 flex items-center gap-3 text-sm tabular-nums">
        <span
          className={cn('font-semibold', positive ? 'text-positive' : 'text-negative')}
        >
          {hidden || !portfolio
            ? '•••'
            : `${pnlDisplay >= 0 ? '+' : ''}${fmtMoney(pnlDisplay, displayCurrency)}`}
        </span>
        <span
          className={cn('font-medium', positive ? 'text-positive' : 'text-negative')}
        >
          {hidden || !portfolio
            ? '•••'
            : `${portfolio.performancePct >= 0 ? '+' : ''}${portfolio.performancePct.toFixed(2)}%`}
        </span>
        <span className="text-xs text-text-muted">· total</span>
        {portfolio && !portfolio.hasCompleteData && (
          <span className="rounded bg-warning/[0.14] px-1.5 py-0.5 text-[10px] font-semibold text-warning">
            estimado
          </span>
        )}
      </div>

      {/* Triplet: Invertiste / Hoy vale / Ganancia. */}
      <div className="grid grid-cols-3 gap-2">
        <HeroStat
          label="Invertiste"
          value={hidden ? '••••' : fmtMoney(investedDisplay, displayCurrency)}
          tone="neutral"
          hint="Costo base abierto"
        />
        <HeroStat
          label="Hoy vale"
          value={hidden ? '••••' : fmtMoney(valueDisplay, displayCurrency)}
          tone="neutral"
        />
        <HeroStat
          label="Ganancia"
          value={
            hidden || !portfolio
              ? '••••'
              : `${pnlDisplay >= 0 ? '+' : ''}${fmtMoney(pnlDisplay, displayCurrency)}`
          }
          tone={positive ? 'positive' : 'negative'}
        />
      </div>

      {/* Desglose realizado / no realizado — visible solo cuando hay ventas */}
      {portfolio && portfolio.realizedPnLUSD !== 0 && !hidden && (
        <div className="mt-2 flex items-center justify-between rounded-xl border border-border-subtle bg-bg-surface px-3 py-2 text-[11px]">
          <span className="text-text-muted">No realizado</span>
          <span className={cn('font-semibold tabular-nums', portfolio.unrealizedPnLUSD >= 0 ? 'text-positive' : 'text-negative')}>
            {portfolio.unrealizedPnLUSD >= 0 ? '+' : ''}
            {fmtMoney(metricToDisplay(portfolio.unrealizedPnLUSD, displayCurrency, fx), displayCurrency)}
          </span>
          <span className="text-border-subtle">·</span>
          <span className="text-text-muted">Realizado</span>
          <span className={cn('font-semibold tabular-nums', portfolio.realizedPnLUSD >= 0 ? 'text-positive' : 'text-negative')}>
            {portfolio.realizedPnLUSD >= 0 ? '+' : ''}
            {fmtMoney(metricToDisplay(portfolio.realizedPnLUSD, displayCurrency, fx), displayCurrency)}
          </span>
        </div>
      )}
    </header>
  );
}

function HeroStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'positive' | 'negative' | 'accent';
  hint?: string;
}) {
  const toneClass = {
    neutral: 'text-text-primary',
    positive: 'text-positive',
    negative: 'text-negative',
    accent: 'text-accent',
  }[tone];
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface p-2.5" title={hint}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      <div className={cn('mt-0.5 text-[13px] font-semibold tabular-nums', toneClass)}>
        {value}
      </div>
    </div>
  );
}

// ─── Insights block ───────────────────────────────────────────────────────

function InsightsBlock({
  insights,
  onSeeAll,
}: {
  insights: import('@/lib/insights').Insight[];
  onSeeAll?: () => void;
}) {
  const top3 = insights.slice(0, 3);
  const hasMore = insights.length > 3;

  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold tracking-tight text-text-primary">
          Qué hacer hoy
        </h2>
        {hasMore && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-[11px] font-medium text-accent hover:underline"
          >
            Ver todos ({insights.length})
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {top3.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </section>
  );
}

// ─── Quick actions ────────────────────────────────────────────────────────

interface QuickAction {
  icon: IconName;
  label: string;
  to: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: 'plus', label: 'Operar', to: '/chat' },
  { icon: 'spark', label: 'Staking', to: '/staking' },
  { icon: 'sliders', label: 'Simulador', to: '/simulador' },
  { icon: 'list', label: 'Importar', to: '/importar' },
];

function QuickActions() {
  const navigate = useNavigate();
  return (
    <section>
      <div className="mb-2.5 px-1 text-sm font-semibold tracking-tight text-text-primary">
        Acciones rápidas
      </div>
      <div className="grid grid-cols-4 gap-2">
        {QUICK_ACTIONS.map((qa) => (
          <button
            key={qa.to}
            type="button"
            onClick={() => navigate(qa.to)}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border-subtle bg-bg-surface px-2 py-3 transition-colors hover:border-border-hover hover:bg-bg-elevated/50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/[0.14] text-accent">
              <Icon name={qa.icon} size={16} />
            </span>
            <span className="text-[11px] font-medium text-text-primary">
              {qa.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Sub-componentes locales ───────────────────────────────────────────────

/** Tarjeta de cotizaciones USD (Oficial / MEP / CCL / Blue). Live. */
/**
 * Card de Capital Timeline: invested vs value mensual.
 * Limitación honesta: el value pasado se proyecta con precios actuales —
 * el usuario lo lee como "qué hubiera valido tu posición de ese mes hoy".
 */
function CapitalTimelineCard({ hidden }: { hidden: boolean }) {
  const [range, setRange] = useState<TimelineRange>('1Y');
  const series = useCapitalTimeline(range);
  const last = series && series.length > 0 ? series[series.length - 1] : undefined;
  const ranges: TimelineRange[] = ['6M', '1Y', 'All'];

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-surface p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Tu capital en el tiempo
        </div>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                'h-6 rounded-md px-2 text-[10px] font-semibold tracking-wide transition-colors',
                range === r
                  ? 'bg-accent/[0.14] text-accent'
                  : 'text-text-secondary hover:bg-bg-elevated/50',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {series === undefined ? (
        <div className="flex h-[120px] items-center justify-center text-[12px] text-text-muted">
          Cargando…
        </div>
      ) : series.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center px-4 text-center text-[12px] text-text-muted">
          Cargá operaciones para ver tu evolución de capital.
        </div>
      ) : (
        <>
          <TimelineChart points={series} />
          {last && (
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-3">
                <LegendItem color="hsl(var(--text-secondary))" label="Invertido" />
                <LegendItem color="hsl(var(--accent))" label="Valor" />
              </div>
              <div className="text-text-muted">
                {hidden ? '••••' : `Invertido US$ ${fmt(last.investedUSD, 0)}`}
              </div>
            </div>
          )}
          <p className="mt-1.5 px-1 text-[10px] italic text-text-muted">
            ⓘ El valor pasado se proyecta con precios actuales. El invested sí es histórico real.
          </p>
        </>
      )}
    </section>
  );
}

function TimelineChart({ points }: { points: import('@/lib/timeline').CapitalTimelinePoint[] }) {
  const W = 360;
  const height = 120;
  const padTop = 8;
  const padBot = 4;
  if (points.length < 2) return null;

  const maxV = Math.max(
    ...points.map((p) => Math.max(p.investedUSD, p.valueUSD)),
  );
  const minV = 0;
  const range = maxV - minV || 1;
  const innerH = height - padTop - padBot;
  const stepX = W / (points.length - 1);
  const yFor = (v: number) =>
    padTop + innerH - ((v - minV) / range) * innerH;

  const valuePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(2)},${yFor(p.valueUSD).toFixed(2)}`)
    .join(' ');
  const investedPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(2)},${yFor(p.investedUSD).toFixed(2)}`)
    .join(' ');
  const valueArea = `${valuePath} L${W.toFixed(2)},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} aria-hidden="true">
      <defs>
        <linearGradient id="ct-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.25" />
          <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={valueArea} fill="url(#ct-grad)" />
      <path d={investedPath} stroke="hsl(var(--text-secondary))" strokeWidth="1.4" strokeDasharray="4 3" fill="none" />
      <path d={valuePath} stroke="hsl(var(--accent))" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-text-muted">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function FxCard() {
  const fx = useFx();
  const freshness = useFxFreshness();

  const items: Array<{ label: string; value: number }> = [
    { label: 'Oficial', value: fx.oficial ?? 0 },
    { label: 'MEP', value: fx.mep ?? 0 },
    { label: 'CCL', value: fx.ccl },
    { label: 'Blue', value: fx.blue ?? 0 },
  ];

  const updatedLabel = freshness
    ? Date.now() - freshness.getTime() < 120_000
      ? `act. ${fmtTime(freshness)}`
      : `act. ${relTime(freshness)}`
    : 'act. —';

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-surface p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Cotizaciones USD
        </div>
        <div className="font-mono text-[10px] text-text-muted">{updatedLabel}</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {items.map((it) => (
          <div
            key={it.label}
            className="rounded-[10px] border border-border-subtle bg-bg-base px-1.5 py-2 text-center"
          >
            <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
              {it.label}
            </div>
            <div className="text-[13px] font-semibold text-text-primary tabular-nums">
              ${fmt(it.value, 0)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Allocation bar ───────────────────────────────────────────────────────

interface AllocationSegment {
  label: string;
  pct: number;
  color: string;
}

function AllocationBar({ risk, hidden }: { risk: RiskMetrics; hidden: boolean }) {
  const segments: AllocationSegment[] = [
    { label: 'Cripto', pct: risk.cryptoExposurePct, color: '#6366F1' },
    { label: 'Acciones', pct: risk.equityExposurePct, color: '#22D3EE' },
    { label: 'Stables', pct: risk.stableExposurePct, color: '#34D399' },
    { label: 'Bonos', pct: risk.bondExposurePct, color: '#FB923C' },
    { label: 'Efectivo', pct: risk.cashExposurePct, color: '#A78BFA' },
  ].filter((s) => s.pct > 0.5);

  if (segments.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-surface p-3.5">
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        Distribución del portfolio
      </div>
      <div className="mb-2.5 flex h-2.5 overflow-hidden rounded-full bg-bg-elevated">
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${s.pct}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ background: s.color }}
            />
            <span className="text-text-secondary">{s.label}</span>
            <span className="font-semibold tabular-nums text-text-primary">
              {hidden ? '••' : `${s.pct.toFixed(0)}%`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center gap-3 px-3.5 py-3',
            i < count - 1 && 'border-b border-border-subtle',
          )}
        >
          <div className="h-9 w-9 animate-pulse rounded-full bg-bg-elevated" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-24 animate-pulse rounded bg-bg-elevated" />
            <div className="h-2 w-16 animate-pulse rounded bg-bg-elevated" />
          </div>
          <div className="h-3 w-16 animate-pulse rounded bg-bg-elevated" />
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function txToVM(tx: Transaction, assets: Asset[], accounts: Account[]): TxRowVM {
  const asset = assets.find((a) => a.id === tx.assetId);
  const account = accounts.find((a) => a.id === tx.accountId);
  return {
    id: tx.id,
    kind: tx.kind,
    date: tx.date,
    qty: tx.qty,
    unitPrice: tx.kind === 'yield' ? undefined : tx.unitPrice,
    priceCurrency: tx.priceCurrency,
    bucket: bucketFromPortfolioId(tx.portfolioId),
    asset: asset ?? { id: tx.assetId, ticker: '?', type: 'crypto' },
    account: account ?? { name: tx.accountId },
    note: tx.notes,
  };
}

function bucketFromPortfolioId(portfolioId: string): PortfolioBucket {
  const m = portfolioId.match(/^pf-(corto|medio|largo|trade)$/);
  if (m) return m[1] as PortfolioBucket;
  return 'largo';
}
