/**
 * Detalle de un activo: header, precio + chart con S/R, tabs (Precio /
 * Holdings / Operaciones / Info), y card especial CEDEAR cuando aplica.
 *
 * Política UX: el chart respeta la moneda nativa del activo (cripto en USD,
 * CEDEAR en ARS) — convertir el eje del chart al display currency confunde
 * al lector que ya tiene en la cabeza el precio "real" del ticker.
 */

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { fmt, fmtMoney } from '@/lib/format';
import { useUIStore } from '@/lib/store';
import {
  useAccounts,
  useAssets,
  useTransactionsByAsset,
} from '@/lib/db/queries';
import {
  useAutoSR,
  useCedearBreakdown,
  useDCA,
  useFx,
  useHoldings,
  usePriceMap,
} from '@/lib/db/derived';
import { describeCedearDriver } from '@/lib/cedear';
import { convertUSD, priceInUSD } from '@/lib/holdings';
import { usePriceHistory, type ChartPeriod } from '@/lib/api/history';
import { AssetLogo } from '@/components/ui/AssetLogo';
import { TagBadge } from '@/components/ui/TagBadge';
import { BucketChip } from '@/components/ui/BucketChip';
import { Button } from '@/components/ui/Button';
import { LineChart } from '@/components/charts/LineChart';
import { TxRow, type TxRowVM } from '@/components/composite/TxRow';
// SEED_SR fue eliminado de la UI: los niveles del seed eran inventados del
// diseño y se mostraban como S/R reales. Ahora usamos `useAutoSR` que computa
// desde el histórico real de CoinGecko (cripto). Para CEDEAR/bono/etf
// devuelve null → no mostramos bandas en lugar de inventar.
import type { PortfolioBucket, Transaction, Account, Asset } from '@/lib/types';

const TABS = ['precio', 'holdings', 'operaciones', 'info'] as const;
type Tab = (typeof TABS)[number];

const PERIODS: readonly ChartPeriod[] = ['1D', '1W', '1M', '3M', '1Y', 'All'] as const;

export function AssetDetail() {
  const navigate = useNavigate();
  const { assetId } = useParams<{ assetId: string }>();
  const { displayCurrency, hidden } = useUIStore();

  const assets = useAssets();
  const accounts = useAccounts();
  const holdings = useHoldings();
  const prices = usePriceMap();
  const txs = useTransactionsByAsset(assetId);
  const fx = useFx();
  const [tab, setTab] = useState<Tab>('precio');
  const [period, setPeriod] = useState<ChartPeriod>('1M');

  const asset = useMemo(
    () => assets?.find((a) => a.id === assetId),
    [assets, assetId],
  );

  const priceEntry = assetId ? prices?.get(assetId) : undefined;
  // S/R real desde histórico (no más SEED_SR inventado).
  // Es `undefined` mientras carga, `null` si no se puede calcular (CEDEARs/bonos
  // sin histórico) o un objeto `{low, high, sampleSize}` si está listo.
  const autoSR = useAutoSR(assetId);
  const sr = autoSR ?? undefined;
  const dca = useDCA(assetId);
  const breakdown = useCedearBreakdown(assetId);
  const history = usePriceHistory(asset, period);

  const assetHoldings = useMemo(
    () => holdings?.filter((h) => h.assetId === assetId) ?? [],
    [holdings, assetId],
  );

  // Totales del activo (todas las cuentas / buckets)
  const totals = useMemo(() => {
    if (!assetHoldings.length || !priceEntry) return undefined;
    const qty = assetHoldings.reduce((s, h) => s + h.qty, 0);
    const usdPrice = priceInUSD(priceEntry, fx);
    const valueUSD = qty * usdPrice;
    const costUSD = assetHoldings.reduce((s, h) => s + h.totalCostUSD, 0);
    const pnlUSD = valueUSD - costUSD;
    const pnlPct = costUSD > 0 ? (pnlUSD / costUSD) * 100 : 0;
    return { qty, valueUSD, costUSD, pnlUSD, pnlPct };
  }, [assetHoldings, priceEntry, fx]);

  if (!asset || !accounts) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        {asset === undefined ? 'Cargando…' : 'Activo no encontrado'}
      </div>
    );
  }

  const positive = (priceEntry?.ch24Pct ?? 0) >= 0;
  const sparkColor = positive ? 'hsl(var(--positive))' : 'hsl(var(--negative))';
  const priceShown = priceEntry?.price ?? 0;
  const nativeCurrency = priceEntry?.currency ?? asset.currency;

  return (
    <div className="flex flex-col gap-3.5 pb-6">
      {/* Header */}
      <header className="flex items-center gap-3">
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
        <AssetLogo asset={asset} size={40} />
        <div className="flex-1">
          <div className="text-base font-semibold tracking-tight text-text-primary">
            {asset.ticker}
          </div>
          <div className="mt-0.5 text-[11px] text-text-secondary">{asset.name}</div>
        </div>
        <span className="rounded border border-border-subtle bg-bg-surface px-1.5 py-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
          {asset.type}
        </span>
      </header>

      {/* Precio */}
      <div>
        <div className="text-[32px] font-semibold tracking-tight text-text-primary tabular-nums">
          {hidden ? '••••••' : fmtMoney(priceShown, nativeCurrency)}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[13px] tabular-nums">
          <span className={cn('font-semibold', positive ? 'text-positive' : 'text-negative')}>
            {hidden || priceEntry?.ch24Pct == null
              ? '•••'
              : `${positive ? '+' : ''}${priceEntry.ch24Pct.toFixed(2)}%`}
          </span>
          <span className="text-[11px] text-text-muted">24h</span>
        </div>
      </div>

      {/* Chart con S/R. Solo mostramos bandas cuando tenemos histórico real
          (las del seed eran números inventados del diseño). Para activos sin
          histórico (CEDEARs/bonos/fondos), mostramos solo la línea de precio. */}
      <section className="rounded-2xl border border-border-subtle bg-bg-surface p-3.5">
        {(() => {
          const realPrices = history.data?.map((p) => p.price);
          const hasRealHistory = !!(realPrices && realPrices.length > 0);
          const chartData = hasRealHistory ? realPrices! : (priceEntry?.spark ?? []);
          // Solo mostramos S/R bandas si:
          //   1. Tenemos histórico real (no spark del seed)
          //   2. El cómputo de SR devolvió un resultado válido (no null)
          // En el resto de casos, no inventamos.
          const showSR = hasRealHistory && !!sr;
          return (
            <>
              <div className="relative">
                <LineChart
                  data={chartData}
                  color={sparkColor}
                  width={360}
                  height={140}
                  srLow={showSR ? sr?.low : undefined}
                  srHigh={showSR ? sr?.high : undefined}
                />
                {history.isFetching && (
                  <div className="absolute inset-0 flex items-center justify-center bg-bg-surface/50 text-[11px] text-text-muted">
                    Cargando…
                  </div>
                )}
              </div>
              {history.data === null && asset.type !== 'crypto' && (
                <div className="mt-1 text-[10px] italic text-text-muted">
                  Histórico real no disponible para este tipo de activo aún.
                </div>
              )}
            </>
          );
        })()}
        <div className="mt-2 flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                'h-7 flex-1 rounded-lg text-[11px] font-semibold transition-colors',
                period === p
                  ? 'bg-accent/[0.14] text-accent'
                  : 'text-text-secondary hover:bg-bg-elevated/50',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </section>

      {/* DCA card — siempre visible cuando hay compras del usuario */}
      {dca && dca.qtyBought > 0 && priceEntry && (
        <DCACard
          dca={dca}
          currentPriceUSD={priceInUSD(priceEntry, fx)}
          currentPriceNative={priceEntry.price}
          ticker={asset.ticker}
          assetType={asset.type}
          hidden={hidden}
        />
      )}

      {/* CEDEAR info card (solo cuando aplica) */}
      {asset.type === 'cedear' && asset.cedearRatio && totals && (() => {
        const efectivoUSD = priceEntry
          ? (priceEntry.price * asset.cedearRatio) / fx.ccl
          : 0;
        // Si tenemos el precio real del subyacente (de Twelve Data), calculamos
        // la prima/descuento — la métrica más útil del módulo CEDEAR.
        const realUSD = priceEntry?.underlyingUSD;
        const primaPct =
          realUSD && efectivoUSD > 0
            ? ((efectivoUSD - realUSD) / realUSD) * 100
            : null;
        const primaPositive = (primaPct ?? 0) > 0;
        return (
          <section className="rounded-xl border border-accent/20 bg-accent/[0.14] p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                CEDEAR · ratio {asset.cedearRatio}:1
              </div>
              {primaPct != null && (
                <div
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-bold',
                    Math.abs(primaPct) < 0.5
                      ? 'bg-text-muted/15 text-text-secondary'
                      : primaPositive
                        ? 'bg-negative/[0.14] text-negative'
                        : 'bg-positive/[0.12] text-positive',
                  )}
                >
                  {primaPositive ? 'PRIMA' : 'DESCUENTO'}{' '}
                  {primaPositive ? '+' : ''}
                  {primaPct.toFixed(2)}%
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CedearStat
                label="Tus CEDEARs"
                value={hidden ? '••' : fmt(totals.qty, 0)}
              />
              <CedearStat
                label="Acciones equivalentes"
                value={hidden ? '••' : fmt(totals.qty / asset.cedearRatio, 2)}
              />
              <CedearStat
                label="Precio efectivo (USD)"
                value={efectivoUSD > 0 ? `US$ ${fmt(efectivoUSD, 2)}` : '—'}
                hint="lo que pagás vía CEDEAR"
              />
              <CedearStat
                label={realUSD ? `${asset.underlyingTicker ?? 'NASDAQ'} (USD)` : 'Costo en USD'}
                value={
                  realUSD
                    ? `US$ ${fmt(realUSD, 2)}`
                    : hidden
                      ? '••'
                      : `US$ ${fmt(totals.costUSD, 2)}`
                }
                hint={realUSD ? 'precio actual NASDAQ/NYSE' : 'snapshot al comprar'}
              />
            </div>
            {!realUSD && (
              <p className="mt-2 text-[10px] leading-snug text-text-muted">
                ⓘ Esperando precio del subyacente (Twelve Data). Si no llega,
                configurá <code>VITE_TWELVEDATA_KEY</code> con tu API key.
              </p>
            )}
          </section>
        );
      })()}

      {/* CEDEAR breakdown: ¿gané por la acción o por el dólar? */}
      {asset.type === 'cedear' && breakdown && !hidden && (
        <section className="rounded-2xl border border-border-subtle bg-bg-surface p-3.5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            ¿De dónde vino el resultado?
          </div>
          <div className="grid grid-cols-3 gap-2">
            <BreakdownStat
              label="Acción"
              valuePct={breakdown.underlyingReturnPct}
              dominant={breakdown.dominantDriver === 'underlying'}
            />
            <BreakdownStat
              label="Dólar (CCL)"
              valuePct={breakdown.fxImpactPct}
              dominant={breakdown.dominantDriver === 'fx'}
            />
            <BreakdownStat
              label="Total ARS"
              valuePct={breakdown.totalReturnPct}
              dominant={false}
              accent
            />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-text-secondary">
            {describeCedearDriver(breakdown)}
          </p>
        </section>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-subtle">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'border-b-2 px-3.5 py-2.5 text-[13px] font-semibold capitalize transition-colors',
              tab === t
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'precio' && (
        <section className="grid grid-cols-2 gap-3.5 rounded-2xl border border-border-subtle bg-bg-surface p-3.5">
          <PriceStat
            label="Soporte"
            value={sr ? fmtMoney(sr.low, nativeCurrency) : '—'}
            tone="positive"
          />
          <PriceStat
            label="Resistencia"
            value={sr ? fmtMoney(sr.high, nativeCurrency) : '—'}
            tone="negative"
          />
          <PriceStat
            label="Tu valor"
            value={
              hidden || !totals
                ? '••'
                : fmtMoney(convertUSD(totals.valueUSD, displayCurrency, fx), displayCurrency)
            }
          />
          <PriceStat
            label="PnL"
            value={
              hidden || !totals
                ? '••'
                : `${totals.pnlUSD >= 0 ? '+' : ''}${totals.pnlPct.toFixed(2)}%`
            }
            tone={totals && totals.pnlUSD >= 0 ? 'positive' : 'negative'}
          />
        </section>
      )}

      {tab === 'holdings' && (
        <section className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface">
          {assetHoldings.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-text-muted">
              Sin holdings
            </div>
          )}
          {assetHoldings.map((h, i) => {
            const acc = accounts.find((a) => a.id === h.accountId);
            if (!acc) return null;
            const usdPrice = priceEntry ? priceInUSD(priceEntry, fx) : 0;
            const v = h.qty * usdPrice;
            const c = h.totalCostUSD;
            const p = c > 0 ? ((v - c) / c) * 100 : 0;
            return (
              <div
                key={`${h.assetId}-${h.accountId}-${h.portfolioId}`}
                className={cn(
                  'px-3.5 py-3',
                  i < assetHoldings.length - 1 && 'border-b border-border-subtle',
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-text-primary">
                      {acc.name}
                    </span>
                    <TagBadge tag={acc.tag} />
                    <BucketChip bucket={bucketFromPortfolioId(h.portfolioId)} small />
                  </div>
                  <span className="text-[13px] font-semibold text-text-primary tabular-nums">
                    {hidden
                      ? '••'
                      : fmtMoney(convertUSD(v, displayCurrency, fx), displayCurrency)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-text-secondary tabular-nums">
                  <span>
                    {hidden ? '••' : fmt(h.qty, asset.type === 'crypto' ? 4 : 0)}{' '}
                    {asset.ticker} · avg US${fmt(h.avgCostUSD, 2)}
                  </span>
                  <span
                    className={cn(
                      'font-medium',
                      p >= 0 ? 'text-positive' : 'text-negative',
                    )}
                  >
                    {hidden ? '••' : `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`}
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {tab === 'operaciones' && (
        <section className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface">
          {(() => {
            const realTxs = txs?.filter((t) => !t.id.startsWith('seed-tx-')) ?? [];
            if (!realTxs.length) {
              return (
                <div className="px-4 py-6 text-center text-[13px] text-text-muted">
                  Sin operaciones
                </div>
              );
            }
            return realTxs.map((tx, i) => (
              <TxRow
                key={tx.id}
                vm={txToVM(tx, asset, accounts)}
                hidden={hidden}
                divider={i < realTxs.length - 1}
              />
            ));
          })()}
        </section>
      )}

      {tab === 'info' && (
        <section className="rounded-2xl border border-border-subtle bg-bg-surface p-3.5 text-xs leading-relaxed text-text-secondary">
          <p>
            <strong className="text-text-primary">{asset.name}</strong> ({asset.ticker})
            —{' '}
            {asset.type === 'cedear'
              ? `Certificado argentino que representa una fracción de ${asset.name}. Cotiza en ARS en BYMA.`
              : asset.type === 'crypto'
                ? 'Activo cripto, cotizado en USD/USDT.'
                : asset.type === 'bono'
                  ? 'Bono soberano, cotiza en dólares.'
                  : 'Instrumento financiero.'}
          </p>
        </section>
      )}

      <Button
        variant="primary"
        size="lg"
        full
        leftIcon="plus"
        onClick={() => navigate('/chat', { state: { prefill: asset.ticker } })}
      >
        Operar {asset.ticker}
      </Button>
    </div>
  );
}

// ─── Sub-componentes locales ───────────────────────────────────────────────

function CedearStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-text-secondary">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-text-primary tabular-nums">
        {value}
      </div>
      {hint && <div className="mt-px text-[9px] text-text-muted">{hint}</div>}
    </div>
  );
}

/**
 * Card chiquita del breakdown CEDEAR (acción / dólar / total). El driver
 * dominante se marca con `dominant=true` (border accent + bg) para que
 * salte a la vista cuál pesó.
 */
function BreakdownStat({
  label,
  valuePct,
  dominant,
  accent,
}: {
  label: string;
  valuePct: number;
  dominant: boolean;
  accent?: boolean;
}) {
  const positive = valuePct >= 0;
  const sign = positive ? '+' : '';
  return (
    <div
      className={cn(
        'rounded-lg border bg-bg-base px-2 py-2 text-center',
        accent
          ? 'border-accent/40 bg-accent/[0.08]'
          : dominant
            ? 'border-text-secondary/40'
            : 'border-border-subtle',
      )}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 text-[13px] font-semibold tabular-nums',
          positive ? 'text-positive' : 'text-negative',
        )}
      >
        {sign}
        {valuePct.toFixed(1)}%
      </div>
    </div>
  );
}

/**
 * Card destacada con el DCA del activo. Muestra:
 *  - DCA en moneda nativa (preferido) o USD si las compras fueron mixtas
 *  - DCA en USD (siempre — es la métrica estable)
 *  - Δ vs precio actual con color verde/rojo
 *  - Cantidad de compras y total invertido
 *
 * Visualmente prominente: borde de acento, padding cómodo. La idea es que
 * sea "lo primero que ves" al abrir un activo después del precio.
 */
function DCACard({
  dca,
  currentPriceUSD,
  currentPriceNative,
  ticker,
  assetType,
  hidden,
}: {
  dca: import('@/lib/holdings').DCAResult;
  currentPriceUSD: number;
  currentPriceNative: number;
  ticker: string;
  assetType: import('@/lib/types').AssetType;
  hidden: boolean;
}) {
  // Δ% en la moneda en que se muestra el DCA (preferimos nativa si existe)
  const deltaUSDPct =
    dca.dcaUSD > 0 ? ((currentPriceUSD - dca.dcaUSD) / dca.dcaUSD) * 100 : 0;
  const deltaNativePct =
    dca.dcaNative && dca.dcaNative.value > 0
      ? ((currentPriceNative - dca.dcaNative.value) / dca.dcaNative.value) * 100
      : null;
  const positive = deltaUSDPct >= 0;
  const decimals = assetType === 'crypto' ? 4 : 2;

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          DCA · Tu costo promedio
        </div>
        <div className="font-mono text-[10px] text-text-muted">
          {dca.txCount} {dca.txCount === 1 ? 'compra' : 'compras'}
        </div>
      </div>
      <div className="flex items-baseline gap-3">
        {/* DCA principal — nativa si todas las compras fueron en una moneda */}
        <div className="text-[22px] font-semibold tracking-tight text-text-primary tabular-nums">
          {hidden
            ? '••••'
            : dca.dcaNative
              ? fmtMoney(dca.dcaNative.value, dca.dcaNative.currency)
              : fmtMoney(dca.dcaUSD, 'USD')}
        </div>
        <div
          className={cn(
            'text-sm font-semibold tabular-nums',
            positive ? 'text-positive' : 'text-negative',
          )}
        >
          {hidden ? '•••' : `${positive ? '+' : ''}${deltaUSDPct.toFixed(2)}%`}
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-text-muted">
        <span>
          {dca.dcaNative ? (
            <>
              ≈ {fmtMoney(dca.dcaUSD, 'USD')} en USD
              {deltaNativePct != null && Math.abs(deltaNativePct - deltaUSDPct) > 0.5 && (
                <span className="ml-1">
                  · nativa {deltaNativePct >= 0 ? '+' : ''}
                  {deltaNativePct.toFixed(2)}%
                </span>
              )}
            </>
          ) : (
            <>compras en monedas mixtas</>
          )}
        </span>
        <span>
          {hidden ? '••' : `${fmt(dca.qtyBought, decimals)} ${ticker} comprados`}
        </span>
      </div>
      <div className="mt-2 border-t border-border-subtle pt-2 text-[11px] text-text-secondary">
        <span className="text-text-muted">Total invertido: </span>
        <span className="font-medium text-text-primary tabular-nums">
          {hidden ? '••••' : fmtMoney(dca.totalCostUSD, 'USD')}
        </span>
        <span className="ml-2 text-text-muted">·</span>
        <span className="ml-2 text-text-muted">vs precio actual: </span>
        <span className="font-medium tabular-nums">
          {fmtMoney(currentPriceUSD, 'USD')}
        </span>
      </div>
    </section>
  );
}

function PriceStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
}) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 text-sm font-semibold tabular-nums',
          tone === 'positive' && 'text-positive',
          tone === 'negative' && 'text-negative',
          !tone && 'text-text-primary',
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function txToVM(tx: Transaction, asset: Asset, accounts: Account[]): TxRowVM {
  const account = accounts.find((a) => a.id === tx.accountId);
  return {
    id: tx.id,
    kind: tx.kind,
    date: tx.date,
    qty: tx.qty,
    unitPrice: tx.kind === 'yield' ? undefined : tx.unitPrice,
    priceCurrency: tx.priceCurrency,
    bucket: bucketFromPortfolioId(tx.portfolioId),
    asset,
    account: account ?? { name: tx.accountId },
    note: tx.notes,
  };
}

function bucketFromPortfolioId(portfolioId: string): PortfolioBucket {
  const m = portfolioId.match(/^pf-(corto|medio|largo|trade)$/);
  if (m) return m[1] as PortfolioBucket;
  return 'largo';
}
