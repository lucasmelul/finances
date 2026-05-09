/**
 * Pantalla "Simulador" — proyección DCA hacia adelante.
 *
 * Layout:
 *  1. Inputs compactos (capital inicial, aporte mensual, duración, retorno)
 *  2. Cards de resultado (valor final, total aportado, ganancia, CAGR)
 *  3. Chart línea: capital vs aportado (relleno = ganancia)
 *  4. Comparativa con presets (Conservador / Medio / Agresivo / Crypto-bull)
 *
 * Política: lo más simple posible. No requiere portfolio cargado — abre y
 * funciona. Inputs persisten en Zustand para que vuelvas a la pantalla y
 * tu última simulación esté ahí.
 */

import { useMemo, useState } from 'react';
import { fmtMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  runScenarioComparison,
  runSimulation,
  type ScenarioPreset,
  type SimulationResult,
} from '@/lib/simulator';
import {
  SCENARIO_PRESETS,
  simulateWhatIf,
  type WhatIfResult,
} from '@/lib/whatif';
import { useAssets } from '@/lib/db/queries';
import { useFx, useHoldings, usePriceMap } from '@/lib/db/derived';
import { Input } from '@/components/ui/Input';

// ─── Helpers numéricos ─────────────────────────────────────────────────────

/** Parsea el value de un input numérico, devolviendo NaN-safe 0. */
function parseNum(v: string): number {
  const n = parseFloat(v.replace(',', '.'));
  return isFinite(n) ? n : 0;
}

// ─── Pantalla ──────────────────────────────────────────────────────────────

const TABS = ['proyeccion', 'portfolio'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  proyeccion: 'Proyección',
  portfolio: 'Sobre mi portfolio',
};

export function Simulador() {
  const [tab, setTab] = useState<Tab>('proyeccion');
  return (
    <div className="flex flex-col gap-4 pb-6">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">
          Simulador
        </h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          {tab === 'proyeccion'
            ? 'Proyectá tu capital con aportes mensuales y un retorno esperado.'
            : 'Aplicá shocks al portfolio actual y mirá qué pasa.'}
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 rounded-[10px] border border-border-subtle bg-bg-surface p-1 self-start">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors',
              tab === t
                ? 'bg-bg-elevated text-text-primary'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'proyeccion' ? <ProjectionTab /> : <WhatIfTab />}
    </div>
  );
}

// ─── Tab 1: Proyección DCA forward ─────────────────────────────────────────

function ProjectionTab() {
  const [initial, setInitial] = useState('5000');
  const [monthly, setMonthly] = useState('500');
  const [years, setYears] = useState('10');
  const [returnPct, setReturnPct] = useState('8');

  const input = useMemo(
    () => ({
      initialCapitalUSD: parseNum(initial),
      monthlyContributionUSD: parseNum(monthly),
      durationMonths: Math.round(parseNum(years) * 12),
      expectedAnnualReturnPct: parseNum(returnPct),
    }),
    [initial, monthly, years, returnPct],
  );

  const result = useMemo(() => runSimulation(input), [input]);
  const comparison = useMemo(
    () =>
      runScenarioComparison({
        initialCapitalUSD: input.initialCapitalUSD,
        monthlyContributionUSD: input.monthlyContributionUSD,
        durationMonths: input.durationMonths,
      }),
    [input.initialCapitalUSD, input.monthlyContributionUSD, input.durationMonths],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Inputs */}
      <section className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
        <div className="grid grid-cols-2 gap-3">
          <NumField
            label="Capital inicial (USD)"
            value={initial}
            onChange={setInitial}
          />
          <NumField
            label="Aporte mensual (USD)"
            value={monthly}
            onChange={setMonthly}
          />
          <NumField
            label="Duración (años)"
            value={years}
            onChange={setYears}
          />
          <NumField
            label="Retorno anual (%)"
            value={returnPct}
            onChange={setReturnPct}
          />
        </div>
      </section>

      {/* Resultado principal */}
      <ResultCards result={result} />

      {/* Chart */}
      <section className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Evolución mensual
        </div>
        <SimChart result={result} />
        <div className="mt-2 flex items-center gap-3 text-[10px] text-text-muted">
          <LegendDot color="hsl(var(--text-secondary))" />
          <span>Aportado</span>
          <LegendDot color="hsl(var(--accent))" />
          <span>Capital con retorno</span>
        </div>
      </section>

      {/* Comparativa de presets */}
      <section>
        <div className="mb-2.5 px-1 text-sm font-semibold tracking-tight text-text-primary">
          Comparativa de escenarios
        </div>
        <div className="flex flex-col gap-2">
          {comparison.map((c) => (
            <ScenarioCard
              key={c.preset.id}
              preset={c.preset}
              result={c.result}
              isCurrent={
                Math.abs(c.preset.annualReturnPct - input.expectedAnnualReturnPct) <
                0.01
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Tab 2: What-if sobre portfolio actual ─────────────────────────────────

function WhatIfTab() {
  const assets = useAssets();
  const holdings = useHoldings();
  const prices = usePriceMap();
  const fx = useFx();
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const result: WhatIfResult | null = useMemo(() => {
    if (!assets || !holdings || !prices || !activePreset) return null;
    const preset = SCENARIO_PRESETS.find((p) => p.id === activePreset);
    if (!preset) return null;
    return simulateWhatIf({
      holdings,
      assets,
      prices,
      fx,
      shocks: preset.shocks,
    });
  }, [assets, holdings, prices, fx, activePreset]);

  const noPortfolio =
    holdings && holdings.length === 0 && assets && assets.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {noPortfolio ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-surface px-4 py-6 text-center text-[13px] text-text-muted">
          Cargá operaciones primero para usar el what-if sobre tu portfolio.
        </div>
      ) : (
        <>
          {/* Lista de presets */}
          <section>
            <div className="mb-2.5 px-1 text-sm font-semibold tracking-tight text-text-primary">
              Escenarios
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SCENARIO_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setActivePreset(preset.id)}
                  className={cn(
                    'rounded-xl border bg-bg-surface px-3 py-2.5 text-left transition-colors',
                    activePreset === preset.id
                      ? 'border-accent bg-accent/[0.08]'
                      : 'border-border-subtle hover:border-border-hover',
                  )}
                >
                  <div className="text-[13px] font-semibold text-text-primary">
                    {preset.label}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-text-muted">
                    {preset.description}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Resultado */}
          {result && <WhatIfResultBlock result={result} />}
          {!activePreset && (
            <div className="rounded-2xl border border-border-subtle bg-bg-surface px-4 py-6 text-center text-[13px] text-text-muted">
              Elegí un escenario para ver el impacto.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function WhatIfResultBlock({ result }: { result: WhatIfResult }) {
  if (!result.hasImpact) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-surface px-4 py-6 text-center text-[13px] text-text-muted">
        Este escenario no afecta a ningún activo de tu portfolio.
      </div>
    );
  }
  const positive = result.totalDeltaUSD >= 0;
  return (
    <div className="flex flex-col gap-3">
      {/* Card grande con el delta */}
      <section
        className={cn(
          'rounded-2xl border p-4',
          positive
            ? 'border-positive/30 bg-positive/[0.06]'
            : 'border-negative/30 bg-negative/[0.06]',
        )}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Tu portfolio pasaría de
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="text-[20px] font-semibold tabular-nums text-text-primary">
            {fmtMoney(result.currentTotalUSD, 'USD')}
          </span>
          <span className="text-text-muted">→</span>
          <span
            className={cn(
              'text-[24px] font-semibold tabular-nums',
              positive ? 'text-positive' : 'text-negative',
            )}
          >
            {fmtMoney(result.simulatedTotalUSD, 'USD')}
          </span>
        </div>
        <div
          className={cn(
            'mt-1.5 text-[13px] font-medium tabular-nums',
            positive ? 'text-positive' : 'text-negative',
          )}
        >
          {positive ? '+' : ''}
          {fmtMoney(result.totalDeltaUSD, 'USD')} ({positive ? '+' : ''}
          {result.totalDeltaPct.toFixed(2)}%)
        </div>
        {result.stableExcluded && (
          <div className="mt-2 text-[11px] italic text-text-muted">
            Stablecoins excluidas — mantienen su valor.
          </div>
        )}
      </section>

      {/* Top contributors */}
      <section className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Activos que más mueven
        </div>
        <ul className="flex flex-col gap-1.5">
          {result.topContributors.map((row) => {
            const pos = row.deltaUSD >= 0;
            return (
              <li
                key={row.assetId}
                className="flex items-center justify-between text-[13px]"
              >
                <span className="font-semibold text-text-primary">{row.ticker}</span>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="text-text-muted">
                    {fmtMoney(row.currentUSD, 'USD')} →{' '}
                    {fmtMoney(row.simulatedUSD, 'USD')}
                  </span>
                  <span
                    className={cn(
                      'min-w-[60px] text-right font-semibold',
                      pos ? 'text-positive' : 'text-negative',
                    )}
                  >
                    {pos ? '+' : ''}
                    {row.deltaPct.toFixed(1)}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="px-2 text-[10px] italic text-text-muted">
        Simulación: tus precios y cantidades reales con shocks aplicados. No
        modifica ninguna operación cargada.
      </p>
    </div>
  );
}

// ─── Sub-componentes ───────────────────────────────────────────────────────

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </label>
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ResultCards({ result }: { result: SimulationResult }) {
  const positive = result.totalReturnUSD >= 0;
  return (
    <section className="grid grid-cols-2 gap-2">
      <ResultCard
        label="Valor final"
        value={fmtMoney(result.finalValueUSD, 'USD')}
        tone="accent"
      />
      <ResultCard
        label="Total aportado"
        value={fmtMoney(result.totalInvestedUSD, 'USD')}
      />
      <ResultCard
        label="Ganancia"
        value={`${positive ? '+' : ''}${fmtMoney(result.totalReturnUSD, 'USD')}`}
        sub={`${positive ? '+' : ''}${result.returnPct.toFixed(1)}% total`}
        tone={positive ? 'positive' : 'negative'}
      />
      <ResultCard
        label="TIR anualizada"
        value={`${result.cagrPct.toFixed(2)}%`}
        sub="retorno efectivo real"
      />
    </section>
  );
}

function ResultCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'accent' | 'positive' | 'negative';
}) {
  const valueClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'positive'
        ? 'text-positive'
        : tone === 'negative'
          ? 'text-negative'
          : 'text-text-primary';
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      <div className={cn('mt-0.5 text-base font-semibold tabular-nums', valueClass)}>
        {value}
      </div>
      {sub && <div className="mt-px text-[10px] text-text-muted">{sub}</div>}
    </div>
  );
}

function ScenarioCard({
  preset,
  result,
  isCurrent,
}: {
  preset: ScenarioPreset;
  result: SimulationResult;
  isCurrent: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-xl border bg-bg-surface px-3.5 py-3 transition-colors',
        isCurrent ? 'border-accent/40 bg-accent/[0.06]' : 'border-border-subtle',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: preset.color }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-text-primary">
              {preset.label}
            </span>
            <span className="text-[11px] tabular-nums text-text-muted">
              {preset.annualReturnPct}% anual
            </span>
            {isCurrent && (
              <span className="rounded bg-accent/[0.14] px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-accent">
                tu input
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-text-secondary">
            {preset.description}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold text-text-primary tabular-nums">
          {fmtMoney(result.finalValueUSD, 'USD')}
        </div>
        <div
          className={cn(
            'mt-0.5 text-[11px] tabular-nums',
            result.totalReturnUSD >= 0 ? 'text-positive' : 'text-negative',
          )}
        >
          {result.totalReturnUSD >= 0 ? '+' : ''}
          {result.returnPct.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

// ─── Mini chart de la simulación ──────────────────────────────────────────

function SimChart({ result }: { result: SimulationResult }) {
  const width = 360;
  const height = 140;
  const padTop = 12;
  const padBot = 8;

  const series = result.series;
  if (series.length < 2) return null;

  const maxVal = Math.max(...series.map((p) => p.capitalUSD));
  const minVal = 0;
  const range = maxVal - minVal || 1;
  const innerH = height - padTop - padBot;
  const stepX = width / (series.length - 1);
  const yFor = (v: number) =>
    padTop + innerH - ((v - minVal) / range) * innerH;

  const capitalPath = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(2)},${yFor(p.capitalUSD).toFixed(2)}`)
    .join(' ');
  const investedPath = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(2)},${yFor(p.contributedUSD).toFixed(2)}`)
    .join(' ');

  // Área entre las dos curvas (la "ganancia")
  const gainArea = `${capitalPath} L${(width).toFixed(2)},${yFor(series[series.length - 1].contributedUSD).toFixed(2)} ${[...series]
    .reverse()
    .map((p, i) => {
      const x = ((series.length - 1 - i) * stepX).toFixed(2);
      return `L${x},${yFor(p.contributedUSD).toFixed(2)}`;
    })
    .join(' ')} Z`;

  return (
    <svg width={width} height={height} aria-hidden="true">
      <defs>
        <linearGradient id="sim-gain" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.30" />
          <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={gainArea} fill="url(#sim-gain)" />
      <path
        d={investedPath}
        stroke="hsl(var(--text-secondary))"
        strokeWidth="1.4"
        strokeDasharray="4 3"
        fill="none"
      />
      <path
        d={capitalPath}
        stroke="hsl(var(--accent))"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LegendDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: color }}
    />
  );
}
