/**
 * Oportunidades — lista de activos cuyo precio actual está cerca de soporte
 * o resistencia REAL (computado desde histórico, no del seed).
 *
 * Cómo se decide el signal:
 *  - pos < 0.25 → BUY  (cerca del soporte, "zona de compra")
 *  - pos < 0.45 → WATCH (cerca de soporte pero no ahí)
 *  - pos > 0.85 → SELL (cerca de resistencia, "zona de venta")
 *  - resto → no aparece
 *
 * Solo se clasifican activos que tienen S/R computable (cripto con histórico
 * de CoinGecko). CEDEARs/bonos/fondos quedan fuera hasta que tengamos
 * proveedor de histórico — preferimos no mostrar nada que mostrar números
 * inventados.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAssets } from '@/lib/db/queries';
import { useAutoSRs, useHoldings, usePriceMap } from '@/lib/db/derived';
import {
  OpportunityCard,
  type OpportunityVM,
  type OpportunitySignal,
} from '@/components/composite/OpportunityCard';

type Filter = 'all' | 'mine';
const FILTERS: Array<[Filter, string]> = [
  ['all', 'Todos'],
  ['mine', 'Solo míos'],
];

interface SignalBucket {
  signal: OpportunitySignal;
  label: string;
}

function classifySignal(pos: number): SignalBucket | null {
  if (pos < 0.25) return { signal: 'buy', label: 'EN ZONA DE COMPRA' };
  if (pos < 0.45) return { signal: 'watch', label: 'CERCA DE SOPORTE' };
  if (pos > 0.85) return { signal: 'sell', label: 'EN ZONA DE VENTA' };
  return null;
}

export function Oportunidades() {
  const navigate = useNavigate();
  const assets = useAssets();
  const prices = usePriceMap();
  const holdings = useHoldings();
  const srMap = useAutoSRs(assets);
  const [filter, setFilter] = useState<Filter>('all');

  // Cantidad de assets candidatos a tener SR (los que estamos esperando).
  const cryptoCount = (assets ?? []).filter(
    (a) => a.type === 'crypto' && a.coingeckoId,
  ).length;
  const computedCount = Array.from(srMap.values()).filter(
    (sr) => sr !== null,
  ).length;
  const isLoading = cryptoCount > 0 && srMap.size < (assets?.length ?? 0);

  const opportunities = useMemo<OpportunityVM[]>(() => {
    if (!assets || !prices) return [];
    const heldSet = new Set(holdings?.map((h) => h.assetId));
    const out: OpportunityVM[] = [];
    for (const asset of assets) {
      const sr = srMap.get(asset.id);
      if (!sr) continue; // null o undefined → skip
      const price = prices.get(asset.id);
      if (!price) continue;
      const range = sr.high - sr.low;
      if (range <= 0) continue;
      const pos = (price.price - sr.low) / range;
      const sig = classifySignal(pos);
      if (!sig) continue;
      out.push({
        asset,
        price: price.price,
        currency: price.currency,
        ch24Pct: price.ch24Pct ?? null,
        srLow: sr.low,
        srHigh: sr.high,
        pos,
        signal: sig.signal,
        signalLabel: sig.label,
        heldByUser: heldSet.has(asset.id),
      });
    }
    const order = { buy: 0, watch: 1, sell: 2 } as const;
    return out
      .filter((o) => filter === 'all' || (filter === 'mine' && o.heldByUser))
      .sort((a, b) => order[a.signal] - order[b.signal]);
  }, [assets, prices, holdings, srMap, filter]);

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">
          Oportunidades
        </h1>
      </div>

      {/* Estado del cómputo: si todavía estamos esperando histórico de
          algún cripto, lo decimos. */}
      {isLoading && opportunities.length === 0 && (
        <div className="rounded-2xl border border-border-subtle bg-bg-surface px-4 py-6 text-center text-[13px] text-text-muted">
          Calculando soportes y resistencias desde el histórico…
        </div>
      )}

      {/* Filtro */}
      <div className="flex gap-1.5 self-start rounded-[10px] border border-border-subtle bg-bg-surface p-1">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              'rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors',
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
      {!isLoading && opportunities.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-surface px-4 py-8 text-center text-sm text-text-muted">
          No hay oportunidades activas.
          {computedCount === 0 && (
            <p className="mt-1 text-[11px]">
              Para detectar señales necesitamos histórico de precios — solo
              está disponible para cripto por ahora.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {opportunities.map((o) => (
            <OpportunityCard
              key={o.asset.id}
              vm={o}
              onClick={(id) => navigate(`/asset/${id}`)}
            />
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div className="border-t border-border-subtle px-3 py-3 text-[11px] leading-relaxed text-text-muted">
        Las señales se calculan desde el histórico real (CoinGecko, percentil
        10/90 sobre 90 días). No son recomendación de inversión.
      </div>
    </div>
  );
}
