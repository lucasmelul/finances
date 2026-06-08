/**
 * Reconciliar saldo — actualizá los saldos finales de una cuenta y la app
 * deduce las transacciones (swaps / depósitos / retiros) automáticamente.
 *
 * Flujo:
 *  1. Elegís la cartera (fija para toda la reconciliación) y editás los saldos
 *     reales que tenés ahora en la plataforma.
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
import { useAccounts, useAssets } from '@/lib/db/queries';
import { useFx, useHoldings, usePriceMap } from '@/lib/db/derived';
import { priceInUSD } from '@/lib/holdings';
import { portfolioIdForBucket } from '@/data/portfolios';
import {
  autoPairings,
  buildPlan,
  computeDeltas,
  isStableAsset,
  needsManualPairing,
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

type Step = 'edit' | 'review';

export function Reconciliar() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();

  const accounts = useAccounts();
  const assets = useAssets();
  const holdings = useHoldings();
  const prices = usePriceMap();
  const fx = useFx();

  const [bucket, setBucket] = useState<PortfolioBucket>('largo');
  const [targetById, setTargetById] = useState<Record<string, string>>({});
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [addPick, setAddPick] = useState('');
  const [step, setStep] = useState<Step>('edit');
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const account = accounts?.find((a) => a.id === accountId);
  const assetById = useMemo(
    () => new Map((assets ?? []).map((a) => [a.id, a])),
    [assets],
  );

  // Bucket → su portfolioId default (las carteras del seed usan IDs estáticos).
  const portfolioId = portfolioIdForBucket(bucket);

  // Saldos actuales en el scope (cuenta + cartera elegida).
  const scopeHoldings = useMemo(() => {
    if (!holdings || !accountId) return [];
    return holdings.filter(
      (h) => h.accountId === accountId && h.portfolioId === portfolioId,
    );
  }, [holdings, accountId, portfolioId]);

  // Líneas a mostrar: holdings del scope + activos agregados manualmente.
  const lines: BalanceLine[] = useMemo(() => {
    const out: BalanceLine[] = [];
    const seen = new Set<string>();
    const push = (assetId: string, currentQty: number) => {
      const asset = assetById.get(assetId);
      if (!asset || seen.has(assetId)) return;
      seen.add(assetId);
      const entry = prices?.get(assetId);
      const priceUSD = entry ? priceInUSD(entry, fx) : 0;
      const isStable = isStableAsset(asset.ticker, asset.type);
      const tStr = targetById[assetId];
      const targetQty = tStr !== undefined && tStr !== '' ? Number(tStr) : currentQty;
      out.push({
        assetId,
        ticker: asset.ticker,
        currentQty,
        targetQty: Number.isFinite(targetQty) ? targetQty : currentQty,
        priceUSD,
        isStable,
      });
    };
    for (const h of scopeHoldings) push(h.assetId, h.qty);
    for (const id of addedIds) push(id, 0);
    return out;
  }, [scopeHoldings, addedIds, assetById, prices, fx, targetById]);

  // Activos que se pueden agregar (no están ya en la tabla).
  const addableOptions: SelectOption[] = useMemo(() => {
    const inTable = new Set(lines.map((l) => l.assetId));
    const opts = (assets ?? [])
      .filter((a) => !inTable.has(a.id))
      .map((a) => ({ value: a.id, label: `${a.ticker} — ${a.name}` }));
    return [{ value: '', label: '+ Agregar activo…' }, ...opts];
  }, [assets, lines]);

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
          fromAssetId: sources[i].assetId,
          toAssetId: sinks[i].assetId,
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
            fromQty: m.fromQty,
            fromPriceUSD: m.fromPriceUSD,
            toAssetId: m.toAssetId,
            toQty: m.toQty,
          }
        : { kind: m.kind, assetId: m.assetId, qty: m.qty, priceUSD: m.priceUSD },
    );

    setSubmitting(true);
    try {
      const { reconId } = await createReconciliation({
        accountId,
        bucket,
        moves,
      });
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
          {/* Cartera */}
          <div className="rounded-2xl border border-border-subtle bg-bg-surface p-3.5">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Cartera (fija para esta reconciliación)
            </label>
            <Select
              options={BUCKET_OPTIONS}
              value={bucket}
              onChange={(e) => {
                setBucket(e.target.value as PortfolioBucket);
                setTargetById({});
                setAddedIds([]);
              }}
            />
            <p className="mt-2 text-[11px] text-text-muted">
              Se ajustan los saldos de esta cuenta dentro de la cartera elegida.
            </p>
          </div>

          {/* Tabla de saldos */}
          <section className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface">
            <div className="flex items-center gap-2 border-b border-border-subtle px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              <span className="flex-1">Activo</span>
              <span className="w-24 text-right">Calculado</span>
              <span className="w-28 text-right">Saldo real</span>
            </div>

            {lines.length === 0 && (
              <div className="px-4 py-6 text-center text-[13px] text-text-muted">
                No hay activos en esta cuenta/cartera. Agregá uno abajo.
              </div>
            )}

            {lines.map((l, i) => {
              const changed = Math.abs(l.targetQty - l.currentQty) > 1e-8;
              return (
                <div
                  key={l.assetId}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2.5',
                    i < lines.length - 1 && 'border-b border-border-subtle',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-text-primary">
                      {l.ticker}
                    </div>
                    <div className="text-[10px] text-text-muted">
                      {l.priceUSD > 0 ? fmtMoney(l.priceUSD) : 's/precio'}
                    </div>
                  </div>
                  <div className="w-24 text-right text-[13px] tabular-nums text-text-secondary">
                    {fmt(l.currentQty, l.currentQty < 1 ? 6 : 2)}
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      className={cn('text-right', changed && 'border-accent')}
                      value={targetById[l.assetId] ?? String(l.currentQty)}
                      onChange={(e) =>
                        setTargetById((m) => ({ ...m, [l.assetId]: e.target.value }))
                      }
                    />
                  </div>
                </div>
              );
            })}
          </section>

          {/* Agregar activo */}
          <Select
            options={addableOptions}
            value={addPick}
            onChange={(e) => {
              const id = e.target.value;
              if (id) {
                setAddedIds((ids) => [...ids, id]);
                setAddPick('');
              }
            }}
          />

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
                <div className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                  <span>{fmt(m.fromQty, m.fromQty < 1 ? 6 : 2)} {m.fromTicker}</span>
                  <Icon name="arrow-right" size={14} className="text-text-muted" />
                  <span>{fmt(m.toQty, m.toQty < 1 ? 6 : 2)} {m.toTicker}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-text-secondary">
                  {m.toTicker} @ {fmtMoney(m.impliedPriceUSD)} · valor {fmtMoney(m.valueUSD)}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                  <Icon
                    name={m.kind === 'deposit' ? 'arrow-down' : 'arrow-up'}
                    size={14}
                    className={m.kind === 'deposit' ? 'text-positive' : 'text-text-muted'}
                  />
                  <span>
                    {m.kind === 'deposit' ? 'Ingreso' : 'Egreso'} de{' '}
                    {fmt(m.qty, m.qty < 1 ? 6 : 2)} {m.ticker}
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
    value: s.assetId,
    label: `${s.ticker} (−${fmt(s.qty, s.qty < 1 ? 6 : 2)})`,
  }));
  const sinkOptions: SelectOption[] = sinks.map((s) => ({
    value: s.assetId,
    label: `${s.ticker} (+${fmt(s.qty, s.qty < 1 ? 6 : 2)})`,
  }));

  const update = (i: number, patch: Partial<Pairing>) => {
    setPairings(pairings.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  };
  const remove = (i: number) => setPairings(pairings.filter((_, j) => j !== i));
  const add = () =>
    setPairings([
      ...pairings,
      {
        fromAssetId: sources[0]?.assetId ?? '',
        toAssetId: sinks[0]?.assetId ?? '',
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
                value={p.fromAssetId}
                onChange={(e) => update(i, { fromAssetId: e.target.value })}
              />
              <Select
                options={sinkOptions}
                value={p.toAssetId}
                onChange={(e) => update(i, { toAssetId: e.target.value })}
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
