/**
 * Reconciliar saldo — actualizá los saldos finales de una cuenta y la app
 * deduce las transacciones (swaps / depósitos / retiros) automáticamente.
 *
 * Multi-cartera: una reconciliación es por CUENTA y abarca TODAS sus carteras.
 * Cada fila es un scope `(asset, cartera)` — el mismo activo puede aparecer en
 * `corto` y `medio` a la vez. Un swap puede cruzar carteras (vendés USDC de
 * `corto`, el BTC entra a `medio`): el valor se conserva igual.
 *
 * Flujo:
 *  1. Editás los saldos reales que tenés ahora en la plataforma (por cartera).
 *  2. "Revisar" calcula los deltas y arma un plan (ver `lib/reconcile.ts`):
 *     - 1 baja + 1 suba → swap con precio implícito exacto.
 *     - varios pares ambiguos → paso de emparejamiento manual.
 *  3. "Confirmar" persiste todo atómico, con opción de deshacer.
 *
 * El valor se deduce de los saldos (no del precio de cache), así el DCA y el
 * PnL siguen siendo correctos. El cache solo se usa como ancla/guardrail.
 */

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fmt, fmtMoney } from '@/lib/format';
import { useAccounts, useAssets, usePortfolios } from '@/lib/db/queries';
import { useFx, useHoldings, usePriceMap } from '@/lib/db/derived';
import { priceInUSD } from '@/lib/holdings';
import { portfolioIdForBucket } from '@/data/portfolios';
import {
  autoPairings,
  buildPlan,
  computeDeltas,
  isStableAsset,
  needsManualPairing,
  scopeKey,
  type BalanceLine,
  type Pairing,
} from '@/lib/reconcile';
import {
  createReconciliation,
  deleteReconciliation,
  type ReconcileMoveInput,
} from '@/lib/db/mutations';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Icon } from '@/components/ui/Icon';
import type { PortfolioBucket } from '@/lib/types';

const BUCKET_OPTIONS: SelectOption[] = [
  { value: 'largo', label: 'Largo plazo' },
  { value: 'medio', label: 'Mediano' },
  { value: 'corto', label: 'Corto plazo' },
  { value: 'trade', label: 'Trade' },
];

const BUCKET_SHORT: Record<string, string> = {
  largo: 'Largo',
  medio: 'Mediano',
  corto: 'Corto',
  trade: 'Trade',
};

type Step = 'edit' | 'review';

export function Reconciliar() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();

  const accounts = useAccounts();
  const assets = useAssets();
  const portfolios = usePortfolios();
  const holdings = useHoldings();
  const prices = usePriceMap();
  const fx = useFx();

  // targetById keyed por scope `(asset, cartera)`.
  const [targetById, setTargetById] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Array<{ assetId: string; portfolioId: string }>>([]);
  const [addAsset, setAddAsset] = useState('');
  const [addBucket, setAddBucket] = useState<PortfolioBucket>('largo');
  const [step, setStep] = useState<Step>('edit');
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const account = accounts?.find((a) => a.id === accountId);
  const assetById = useMemo(
    () => new Map((assets ?? []).map((a) => [a.id, a])),
    [assets],
  );
  // portfolioId → bucket (para etiquetar la cartera de cada fila).
  const bucketByPf = useMemo(
    () => new Map((portfolios ?? []).map((p) => [p.id, p.bucket])),
    [portfolios],
  );
  const bucketLabel = (portfolioId: string) => {
    const b = bucketByPf.get(portfolioId);
    return b ? BUCKET_SHORT[b] ?? b : portfolioId;
  };

  // Saldos actuales de la cuenta en TODAS sus carteras.
  const scopeHoldings = useMemo(() => {
    if (!holdings || !accountId) return [];
    return holdings.filter((h) => h.accountId === accountId);
  }, [holdings, accountId]);

  // Líneas a mostrar: holdings (asset×cartera) + scopes agregados manualmente.
  const lines: BalanceLine[] = useMemo(() => {
    const out: BalanceLine[] = [];
    const seen = new Set<string>();
    const push = (assetId: string, portfolioId: string, currentQty: number) => {
      const asset = assetById.get(assetId);
      const key = scopeKey(assetId, portfolioId);
      if (!asset || seen.has(key)) return;
      seen.add(key);
      const entry = prices?.get(assetId);
      const priceUSD = entry ? priceInUSD(entry, fx) : 0;
      const isStable = isStableAsset(asset.ticker, asset.type);
      const tStr = targetById[key];
      const targetQty = tStr !== undefined && tStr !== '' ? Number(tStr) : currentQty;
      out.push({
        key,
        assetId,
        ticker: asset.ticker,
        portfolioId,
        bucketLabel: bucketLabel(portfolioId),
        currentQty,
        targetQty: Number.isFinite(targetQty) ? targetQty : currentQty,
        priceUSD,
        isStable,
      });
    };
    for (const h of scopeHoldings) push(h.assetId, h.portfolioId, h.qty);
    for (const a of added) push(a.assetId, a.portfolioId, 0);
    // Orden estable: por ticker, luego cartera.
    return out.sort(
      (a, b) => a.ticker.localeCompare(b.ticker) || a.bucketLabel.localeCompare(b.bucketLabel),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeHoldings, added, assetById, prices, fx, targetById, bucketByPf]);

  // Opciones para "agregar activo" (todos los assets; el scope lo define el
  // par asset+cartera, así que no filtramos por los ya presentes).
  const addableOptions: SelectOption[] = useMemo(() => {
    const opts = (assets ?? []).map((a) => ({
      value: a.id,
      label: `${a.ticker} — ${a.name}`,
    }));
    return [{ value: '', label: '— Elegir activo —' }, ...opts];
  }, [assets]);

  function handleAdd() {
    if (!addAsset) return;
    const portfolioId = portfolioIdForBucket(addBucket);
    const key = scopeKey(addAsset, portfolioId);
    if (lines.some((l) => l.key === key)) {
      toast.info('Ese activo ya está en esa cartera.');
      return;
    }
    setAdded((a) => [...a, { assetId: addAsset, portfolioId }]);
    setAddAsset('');
  }

  // ─── Plan derivado (en step review) ────────────────────────────────────────

  const { sources, sinks } = useMemo(() => computeDeltas(lines), [lines]);
  const manual = needsManualPairing(sources, sinks);

  const plan = useMemo(() => {
    if (step !== 'review') return null;
    const pr = manual ? pairings : (autoPairings(sources, sinks) ?? []);
    return buildPlan(sources, sinks, pr);
  }, [step, manual, pairings, sources, sinks]);

  // ─── Acciones ──────────────────────────────────────────────────────────────

  function handleReview() {
    if (sources.length === 0 && sinks.length === 0) {
      toast.info('No hay cambios de saldo para reconciliar.');
      return;
    }
    // Pre-llenar emparejamientos con una sugerencia razonable para el caso manual.
    if (needsManualPairing(sources, sinks)) {
      const n = Math.min(sources.length, sinks.length);
      const seed: Pairing[] = [];
      for (let i = 0; i < n; i++) {
        seed.push({
          fromKey: sources[i].key,
          toKey: sinks[i].key,
          fromQty: sources[i].qty,
          toQty: sinks[i].qty,
        });
      }
      setPairings(seed);
    }
    setStep('review');
  }

  async function handleConfirm() {
    if (!plan || !accountId) return;
    const moves: ReconcileMoveInput[] = plan.moves.map((m) =>
      m.kind === 'swap'
        ? {
            kind: 'swap',
            fromAssetId: m.fromAssetId,
            fromPortfolioId: m.fromPortfolioId,
            fromQty: m.fromQty,
            fromPriceUSD: m.fromPriceUSD,
            toAssetId: m.toAssetId,
            toPortfolioId: m.toPortfolioId,
            toQty: m.toQty,
          }
        : {
            kind: m.kind,
            assetId: m.assetId,
            portfolioId: m.portfolioId,
            qty: m.qty,
            priceUSD: m.priceUSD,
          },
    );

    setSubmitting(true);
    try {
      const { reconId } = await createReconciliation({ accountId, moves });
      toast.success('Saldos reconciliados', {
        description: `${plan.moves.length} ${plan.moves.length === 1 ? 'movimiento' : 'movimientos'} registrados.`,
        action: {
          label: 'Deshacer',
          onClick: () => {
            deleteReconciliation(reconId).then(() =>
              toast.success('Reconciliación deshecha'),
            );
          },
        },
        duration: 8000,
      });
      navigate('/cuentas');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reconciliar');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Guards ──────────────────────────────────────────────────────────────

  // Entrada desde el menú (sin cuenta en la URL): elegí qué cuenta reconciliar.
  if (!accountId) {
    return (
      <div className="flex flex-col gap-3.5 pb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">
            Reconciliar saldo
          </h1>
          <p className="text-[12px] text-text-secondary">
            Elegí la cuenta cuyos saldos querés actualizar.
          </p>
        </div>
        <section className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface">
          {accounts?.filter((a) => !a.archivedAt).length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-text-muted">
              No tenés cuentas todavía. Creá una desde Cuentas.
            </div>
          )}
          {accounts
            ?.filter((a) => !a.archivedAt)
            .map((a, i, arr) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/reconciliar/${a.id}`)}
                className={cn(
                  'flex w-full items-center gap-3 px-3.5 py-3.5 text-left transition-colors hover:bg-bg-elevated',
                  i < arr.length - 1 && 'border-b border-border-subtle',
                )}
              >
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]',
                    a.tag === 'A' ? 'bg-info/[0.14] text-info' : 'bg-warning/[0.14] text-warning',
                  )}
                >
                  <Icon name="wallet" size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-text-primary">{a.name}</div>
                  <div className="mt-0.5 text-[11px] capitalize text-text-secondary">{a.kind}</div>
                </div>
                <Icon name="arrow-right" size={16} className="text-text-muted" />
              </button>
            ))}
        </section>
      </div>
    );
  }

  if (accounts && !account) {
    return (
      <div className="py-10 text-center text-sm text-text-muted">
        Cuenta no encontrada.
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/cuentas')}>
            Volver a Cuentas
          </Button>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3.5 pb-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Volver"
          onClick={() => (step === 'review' ? setStep('edit') : navigate('/cuentas'))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        >
          <Icon name="arrow-right" size={16} className="rotate-180" />
        </button>
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">
            Reconciliar saldo
          </h1>
          <p className="text-[12px] text-text-secondary">
            {account?.name ?? '…'} · poné los saldos reales y la app calcula las operaciones
          </p>
        </div>
      </div>

      {step === 'edit' ? (
        <>
          {/* Tabla de saldos */}
          <section className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface">
            <div className="flex items-center gap-2 border-b border-border-subtle px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              <span className="flex-1">Activo · cartera</span>
              <span className="w-20 text-right">Calculado</span>
              <span className="w-28 text-right">Saldo real</span>
            </div>

            {lines.length === 0 && (
              <div className="px-4 py-6 text-center text-[13px] text-text-muted">
                Esta cuenta no tiene activos. Agregá uno abajo.
              </div>
            )}

            {lines.map((l, i) => {
              const changed = Math.abs(l.targetQty - l.currentQty) > 1e-8;
              return (
                <div
                  key={l.key}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2.5',
                    i < lines.length - 1 && 'border-b border-border-subtle',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-text-primary">{l.ticker}</span>
                      <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                        {l.bucketLabel}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-text-muted">
                      {l.priceUSD > 0 ? fmtMoney(l.priceUSD) : 's/precio'}
                    </div>
                  </div>
                  <div className="w-20 text-right text-[13px] tabular-nums text-text-secondary">
                    {fmt(l.currentQty, l.currentQty < 1 ? 6 : 2)}
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      className={cn('text-right', changed && 'border-accent')}
                      value={targetById[l.key] ?? String(l.currentQty)}
                      onChange={(e) =>
                        setTargetById((m) => ({ ...m, [l.key]: e.target.value }))
                      }
                    />
                  </div>
                </div>
              );
            })}
          </section>

          {/* Agregar activo (eligiendo cartera) */}
          <section className="rounded-2xl border border-border-subtle bg-bg-surface p-3.5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Agregar activo
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select
                options={addableOptions}
                value={addAsset}
                onChange={(e) => setAddAsset(e.target.value)}
              />
              <Select
                options={BUCKET_OPTIONS}
                value={addBucket}
                onChange={(e) => setAddBucket(e.target.value as PortfolioBucket)}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              leftIcon="plus"
              className="mt-2.5"
              onClick={handleAdd}
              disabled={!addAsset}
            >
              Agregar a la tabla
            </Button>
          </section>

          <Button variant="primary" size="lg" full leftIcon="check" onClick={handleReview}>
            Revisar cambios
          </Button>
        </>
      ) : (
        <ReviewStep
          plan={plan}
          manual={manual}
          sources={sources}
          sinks={sinks}
          pairings={pairings}
          setPairings={setPairings}
          submitting={submitting}
          onConfirm={handleConfirm}
          onBack={() => setStep('edit')}
        />
      )}
    </div>
  );
}

// ─── Review / confirm ─────────────────────────────────────────────────────────

function ReviewStep({
  plan,
  manual,
  sources,
  sinks,
  pairings,
  setPairings,
  submitting,
  onConfirm,
  onBack,
}: {
  plan: ReturnType<typeof buildPlan> | null;
  manual: boolean;
  sources: ReturnType<typeof computeDeltas>['sources'];
  sinks: ReturnType<typeof computeDeltas>['sinks'];
  pairings: Pairing[];
  setPairings: (p: Pairing[]) => void;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  if (!plan) return null;

  return (
    <>
      {manual && (
        <PairingEditor
          sources={sources}
          sinks={sinks}
          pairings={pairings}
          setPairings={setPairings}
        />
      )}

      {/* Preview de movimientos */}
      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface">
        <div className="border-b border-border-subtle px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Se van a registrar
        </div>
        {plan.moves.length === 0 && (
          <div className="px-4 py-6 text-center text-[13px] text-text-muted">
            Nada para registrar todavía.
          </div>
        )}
        {plan.moves.map((m, i) => (
          <div
            key={i}
            className={cn(
              'px-3.5 py-3',
              i < plan.moves.length - 1 && 'border-b border-border-subtle',
            )}
          >
            {m.kind === 'swap' ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-text-primary">
                  <span>{fmt(m.fromQty, m.fromQty < 1 ? 6 : 2)} {m.fromTicker}</span>
                  <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                    {m.fromBucketLabel}
                  </span>
                  <Icon name="arrow-right" size={14} className="text-text-muted" />
                  <span>{fmt(m.toQty, m.toQty < 1 ? 6 : 2)} {m.toTicker}</span>
                  <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                    {m.toBucketLabel}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-text-secondary">
                  {m.toTicker} @ {fmtMoney(m.impliedPriceUSD)} · valor {fmtMoney(m.valueUSD)}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-text-primary">
                  <Icon
                    name={m.kind === 'deposit' ? 'arrow-down' : 'arrow-up'}
                    size={14}
                    className={m.kind === 'deposit' ? 'text-positive' : 'text-text-muted'}
                  />
                  <span>
                    {m.kind === 'deposit' ? 'Ingreso' : 'Egreso'} de{' '}
                    {fmt(m.qty, m.qty < 1 ? 6 : 2)} {m.ticker}
                  </span>
                  <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                    {m.bucketLabel}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-text-secondary">
                  {m.valueUSD > 0 ? `valor ${fmtMoney(m.valueUSD)}` : 'sin precio de mercado'}
                </div>
              </>
            )}
          </div>
        ))}
      </section>

      {/* Warnings */}
      {plan.warnings.map((w, i) => (
        <div
          key={i}
          className="rounded-xl bg-warning/[0.12] px-3.5 py-2.5 text-[12px] text-warning"
        >
          {w.message}
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <Button variant="ghost" size="lg" full onClick={onBack}>
          Volver
        </Button>
        <Button
          variant="primary"
          size="lg"
          full
          leftIcon="check"
          disabled={submitting || plan.moves.length === 0}
          onClick={onConfirm}
        >
          {submitting ? 'Guardando…' : 'Confirmar'}
        </Button>
      </div>
    </>
  );
}

// ─── Emparejamiento manual (caso N×M ambiguo) ────────────────────────────────

function PairingEditor({
  sources,
  sinks,
  pairings,
  setPairings,
}: {
  sources: ReturnType<typeof computeDeltas>['sources'];
  sinks: ReturnType<typeof computeDeltas>['sinks'];
  pairings: Pairing[];
  setPairings: (p: Pairing[]) => void;
}) {
  const srcOptions: SelectOption[] = sources.map((s) => ({
    value: s.key,
    label: `${s.ticker} · ${s.bucketLabel} (−${fmt(s.qty, s.qty < 1 ? 6 : 2)})`,
  }));
  const sinkOptions: SelectOption[] = sinks.map((s) => ({
    value: s.key,
    label: `${s.ticker} · ${s.bucketLabel} (+${fmt(s.qty, s.qty < 1 ? 6 : 2)})`,
  }));

  const update = (i: number, patch: Partial<Pairing>) => {
    setPairings(pairings.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  };
  const remove = (i: number) => setPairings(pairings.filter((_, j) => j !== i));
  const add = () =>
    setPairings([
      ...pairings,
      {
        fromKey: sources[0]?.key ?? '',
        toKey: sinks[0]?.key ?? '',
        fromQty: 0,
        toQty: 0,
      },
    ]);

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-surface p-3.5">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        Emparejar conversiones
      </div>
      <p className="mb-3 text-[11px] text-text-muted">
        Hay varios movimientos en distintos pares. Decí qué se convirtió en qué y
        cuánto de cada lado.
      </p>

      <div className="space-y-2.5">
        {pairings.map((p, i) => (
          <div key={i} className="rounded-xl border border-border-subtle bg-bg-base p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <Select
                options={srcOptions}
                value={p.fromKey}
                onChange={(e) => update(i, { fromKey: e.target.value })}
              />
              <Select
                options={sinkOptions}
                value={p.toKey}
                onChange={(e) => update(i, { toKey: e.target.value })}
              />
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="entregado"
                value={p.fromQty || ''}
                onChange={(e) => update(i, { fromQty: Number(e.target.value) })}
              />
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="recibido"
                value={p.toQty || ''}
                onChange={(e) => update(i, { toQty: Number(e.target.value) })}
              />
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              className="mt-2 text-[11px] text-text-muted hover:text-negative"
            >
              Quitar
            </button>
          </div>
        ))}
      </div>

      <Button variant="ghost" size="sm" leftIcon="plus" className="mt-2.5" onClick={add}>
        Agregar par
      </Button>
    </section>
  );
}
