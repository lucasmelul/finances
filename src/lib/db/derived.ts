/**
 * Hooks derivados que cruzan tablas. Los ponemos separados de `queries.ts`
 * para distinguir lecturas crudas (1 tabla) de lecturas computadas (joins).
 */

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Currency } from '@/lib/types';
import {
  computeDCA,
  computeHoldings,
  type DCAResult,
  type FxView,
  type HoldingAggregate,
  type PriceLookup,
} from '@/lib/holdings';
import {
  computeLiquidityMetrics,
  computePortfolioMetrics,
  computeRiskMetrics,
  type LiquidityMetrics,
  type PortfolioMetrics,
  type RiskMetrics,
} from '@/lib/metrics';
import { generateInsights, type Insight } from '@/lib/insights';
import { computeCedearBreakdown, type CedearBreakdown } from '@/lib/cedear';
import {
  computeCapitalTimeline,
  type CapitalTimelinePoint,
  type TimelineRange,
} from '@/lib/timeline';
import { computeStakingSummary, type StakingSummary } from '@/lib/staking';
import { computeSRFromPrices, type SRLevels } from '@/lib/sr';
import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchCryptoHistory } from '@/lib/api/coingecko';
import type { Asset } from '@/lib/types';
import { useUIStore } from '@/lib/store';
// SEED_SR (niveles inventados del diseño) ya no se usa — reemplazado por
// `useAutoSR` / `useAutoSRs` que computa desde el histórico real.
import { SEED_FX } from '@/data/seed';
import { db } from './schema';
import {
  useAssets,
  usePriceCache,
  useStakingRules,
  useTransactions,
  useTransactionsByAsset,
} from './queries';

/**
 * Snapshot FX en uso. Estrategia "cache + fallback":
 *  1. Consulta `db.fxRateCache` (poblado por `usePollFx()` cada 60s).
 *  2. Si la tabla está vacía (primer arranque, sin internet), usa `SEED_FX`.
 *
 * Convención: usamos el `sell` (precio al que comprás divisa) — es el más
 * conservador para valuar el portfolio en USD. Para vender USD usaríamos
 * `buy`; eso quedará para Phase 2 cuando agreguemos modo "real" vs "mid".
 */
export function useFx(): FxView {
  const rows = useLiveQuery(() => db.fxRateCache.toArray(), []);

  return useMemo(() => {
    if (!rows || rows.length === 0) {
      // Fallback al seed — sucede en primer arranque antes de que el poller
      // escriba, o si no hay internet.
      return {
        ccl: SEED_FX.ccl,
        mep: SEED_FX.mep,
        blue: SEED_FX.blue,
        oficial: SEED_FX.oficial,
      };
    }
    // Tomamos `sell` por convención (ver doc del export).
    const byKind = new Map(rows.map((r) => [r.kind, r.sell]));
    return {
      ccl: byKind.get('ccl') ?? SEED_FX.ccl,
      mep: byKind.get('mep') ?? SEED_FX.mep,
      blue: byKind.get('blue') ?? SEED_FX.blue,
      oficial: byKind.get('oficial') ?? SEED_FX.oficial,
    };
  }, [rows]);
}

/**
 * Marca de tiempo del FX más reciente en cache. Útil para mostrar
 * "actualizado hace Xm" en la UI.
 */
export function useFxFreshness(): Date | undefined {
  const rows = useLiveQuery(() => db.fxRateCache.toArray(), []);
  return useMemo(() => {
    if (!rows || rows.length === 0) return undefined;
    const latest = rows.reduce((acc, r) =>
      new Date(r.fetchedAt) > new Date(acc.fetchedAt) ? r : acc,
    );
    return new Date(latest.fetchedAt);
  }, [rows]);
}

/**
 * Mapa precio-por-asset para lookups O(1). Combina la moneda nativa del cache
 * con el sparkline para que las pantallas no tengan que volver a indexar.
 */
export interface PriceEntry extends PriceLookup {
  ch24Pct?: number;
  spark?: number[];
  /** Precio del subyacente USD (solo CEDEARs/ETFs polleados de Twelve Data). */
  underlyingUSD?: number;
}

export function usePriceMap(): Map<string, PriceEntry> | undefined {
  const cache = usePriceCache();
  return useMemo(() => {
    if (!cache) return undefined;
    const m = new Map<string, PriceEntry>();
    for (const row of cache) {
      m.set(row.assetId, {
        price: row.price,
        currency: row.currency as Currency,
        ch24Pct: row.ch24Pct,
        spark: row.spark,
        underlyingUSD: row.underlyingUSD,
      });
    }
    return m;
  }, [cache]);
}

/**
 * Holdings computados desde todas las transactions + FX. Recalcula cuando
 * cambia cualquier tx (vía `useLiveQuery` aguas abajo).
 */
export function useHoldings(): HoldingAggregate[] | undefined {
  const txs = useTransactions();
  const fx = useFx();
  return useMemo(() => {
    if (!txs) return undefined;
    return computeHoldings(txs, fx);
  }, [txs, fx]);
}

/**
 * DCA del activo indicado. Trae todas las txs del asset (vía índice de Dexie)
 * y aplica `computeDCA`. `undefined` mientras carga.
 */
export function useDCA(assetId: string | undefined): DCAResult | undefined {
  const txs = useTransactionsByAsset(assetId);
  const fx = useFx();
  return useMemo(() => {
    if (!txs) return undefined;
    return computeDCA(txs, fx);
  }, [txs, fx]);
}

/**
 * Breakdown de un CEDEAR: descompone el return en "subió la acción" vs
 * "subió el dólar". Devuelve `null` cuando:
 *  - el asset no es CEDEAR
 *  - no hay compras
 *  - no hay datos suficientes (ningún fxSnapshot en las txs)
 *
 * El precio del subyacente USD viene del polling de Twelve Data
 * (`PriceCache.underlyingUSD`); si aún no llegó, se deriva del CEDEAR ARS
 * asumiendo eficiencia BYMA.
 */
export function useCedearBreakdown(assetId: string | undefined): CedearBreakdown | null | undefined {
  const txs = useTransactionsByAsset(assetId);
  const assets = useAssets();
  const prices = usePriceMap();
  const fx = useFx();

  return useMemo(() => {
    if (!assetId || !txs || !assets || !prices) return undefined;
    const asset = assets.find((a) => a.id === assetId);
    if (!asset || asset.type !== 'cedear') return null;

    const buyTxs = txs.filter((t) => t.kind === 'buy' || t.kind === 'transfer_in');
    const priceEntry = prices.get(assetId);
    if (!priceEntry) return null;

    return computeCedearBreakdown({
      asset,
      buyTxs,
      currentPriceARS: priceEntry.price,
      // El priceCache puede traer underlyingUSD del polling. Si no llegó,
      // computeCedearBreakdown lo deriva del precio ARS / CCL.
      currentUnderlyingUSD: priceEntry.underlyingUSD,
      currentCCL: fx.ccl,
    });
  }, [assetId, txs, assets, prices, fx]);
}

// ─── Métricas globales (Spec V2 §1-3) ──────────────────────────────────────

/**
 * Portfolio metrics: invested / value / PnL / yield / performance.
 * Se recompone cuando cambian txs, holdings, prices o fx.
 */
export function usePortfolioMetrics(): PortfolioMetrics | undefined {
  const txs = useTransactions();
  const holdings = useHoldings();
  const prices = usePriceMap();
  const fx = useFx();
  return useMemo(() => {
    if (!txs || !holdings || !prices) return undefined;
    return computePortfolioMetrics(txs, holdings, prices, fx);
  }, [txs, holdings, prices, fx]);
}

/**
 * Liquidity metrics: cuánto del portfolio está ocioso.
 * Considera cash + stables sin staking. Necesita las staking rules para
 * detectar las stables que SÍ están produciendo.
 */
export function useLiquidityMetrics(): LiquidityMetrics | undefined {
  const holdings = useHoldings();
  const assets = useAssets();
  const prices = usePriceMap();
  const fx = useFx();
  const stakingRules = useLiveQuery(() => db.stakingRules.toArray(), []);
  const portfolio = usePortfolioMetrics();
  return useMemo(() => {
    if (!holdings || !assets || !prices || !portfolio || !stakingRules) {
      return undefined;
    }
    return computeLiquidityMetrics(
      holdings,
      assets,
      prices,
      fx,
      portfolio.totalValueUSD,
      stakingRules,
    );
  }, [holdings, assets, prices, fx, portfolio, stakingRules]);
}

/**
 * Risk metrics: exposición por tipo + concentración top1/top3.
 */
export function useRiskMetrics(): RiskMetrics | undefined {
  const holdings = useHoldings();
  const assets = useAssets();
  const prices = usePriceMap();
  const fx = useFx();
  return useMemo(() => {
    if (!holdings || !assets || !prices) return undefined;
    return computeRiskMetrics(holdings, assets, prices, fx);
  }, [holdings, assets, prices, fx]);
}

/**
 * Insights generados desde las métricas. El número de oportunidades en zona
 * de compra se computa acá (precio actual vs soporte del seed) — cuando
 * tengamos S/R automáticos (Phase 2) usamos esos en su lugar.
 */
export function useInsights(): Insight[] | undefined {
  const portfolio = usePortfolioMetrics();
  const liquidity = useLiquidityMetrics();
  const risk = useRiskMetrics();
  const prices = usePriceMap();
  const cache = usePriceCache();
  const fxFreshness = useFxFreshness();
  const staking = useStakingSummary();
  const assets = useAssets();
  const srMap = useAutoSRs(assets);
  const dismissedIds = useUIStore((s) => s.dismissedInsightIds);

  return useMemo(() => {
    if (!portfolio || !liquidity || !risk) return undefined;

    // Conteo de oportunidades en zona de compra usando S/R real (no del seed).
    // Solo cuenta los activos con SR computable (cripto con histórico).
    let opportunitiesInBuyZone = 0;
    if (prices) {
      for (const [assetId, price] of prices) {
        const sr = srMap.get(assetId);
        if (!sr) continue;
        const range = sr.high - sr.low;
        if (range <= 0) continue;
        const pos = (price.price - sr.low) / range;
        if (pos < 0.25) opportunitiesInBuyZone += 1;
      }
    }

    // Edad del FX más reciente.
    const fxAgeSeconds = fxFreshness
      ? Math.max(0, (Date.now() - fxFreshness.getTime()) / 1000)
      : undefined;

    // Edad del precio más reciente.
    let pricesAgeSeconds: number | undefined;
    if (cache && cache.length > 0) {
      const latest = cache.reduce((acc, r) =>
        new Date(r.fetchedAt) > new Date(acc.fetchedAt) ? r : acc,
      );
      pricesAgeSeconds = Math.max(
        0,
        (Date.now() - new Date(latest.fetchedAt).getTime()) / 1000,
      );
    }

    const all = generateInsights({
      portfolio,
      liquidity,
      risk,
      opportunitiesInBuyZone,
      fxAgeSeconds,
      pricesAgeSeconds,
      staking,
    });
    // Filtramos los que el usuario descartó esta sesión.
    const dismissed = new Set(dismissedIds);
    return all.filter((i) => !dismissed.has(i.id));
  }, [portfolio, liquidity, risk, prices, cache, fxFreshness, staking, srMap, dismissedIds]);
}

/**
 * Capital Timeline mensual: invested vs value vs pnl. La valuación pasada
 * es una proyección con precios actuales (limitación documentada en
 * `lib/timeline.ts`). El invested SÍ es histórico real.
 */
export function useCapitalTimeline(range: TimelineRange = '1Y'): CapitalTimelinePoint[] | undefined {
  const txs = useTransactions();
  const assets = useAssets();
  const prices = usePriceMap();
  const fx = useFx();
  return useMemo(() => {
    if (!txs || !assets || !prices) return undefined;
    return computeCapitalTimeline({ transactions: txs, assets, prices, fx, range });
  }, [txs, assets, prices, fx, range]);
}

/**
 * Soporte / Resistencia computados desde el histórico de precios real.
 *
 * Solo funciona para criptos (CoinGecko market_chart). Para CEDEARs / ETFs /
 * bonos hoy devuelve `null` porque no tenemos histórico de calidad sin
 * proxies pagos. La UI tiene que respetar el null y NO mostrar bandas ni
 * clasificación — mejor mostrar "—" que un número inventado.
 *
 * Cache de TanStack: 30 min (los SR no se mueven segundo a segundo).
 */
export function useAutoSR(assetId: string | undefined): SRLevels | null | undefined {
  const assets = useAssets();
  const asset = assets?.find((a) => a.id === assetId);

  const { data: history } = useQuery({
    queryKey: ['sr-history', asset?.id],
    enabled: !!(asset && asset.type === 'crypto' && asset.coingeckoId),
    // Mismo rationale que `useAutoSRs`: cache agresivo para no superar
    // rate limit de CoinGecko free tier.
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    queryFn: async () => {
      if (!asset?.coingeckoId) return null;
      // 90 días de histórico → ~90 puntos diarios = sample suficiente.
      return fetchCryptoHistory(asset.coingeckoId, '3M');
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return useMemo(() => {
    if (!asset) return undefined;
    // Tipos sin histórico real → no podemos calcular S/R
    if (asset.type !== 'crypto') return null;
    if (!history) return undefined; // cargando
    if (history.length === 0) return null;
    return computeSRFromPrices(history.map((p) => p.price));
  }, [asset, history]);
}

/**
 * Variante batch: SR para una lista de assets, en paralelo. Útil para la
 * pantalla Oportunidades que necesita clasificar TODOS los activos.
 *
 * Solo lanza queries para assets de tipo cripto con `coingeckoId`. El resto
 * mapea a `null` directo (no hay histórico disponible).
 *
 * Devuelve `Map<assetId, SRLevels | null>`. Mientras carga, los assets que
 * todavía no resolvieron NO aparecen en el map — el caller hace `.get(id)`
 * y maneja `undefined` como "loading".
 */
export function useAutoSRs(
  assets: Asset[] | undefined,
): Map<string, SRLevels | null> {
  const cryptoAssets = (assets ?? []).filter(
    (a) => a.type === 'crypto' && a.coingeckoId,
  );

  // Configuración pensada para evitar rate-limit de CoinGecko free tier:
  //  - staleTime 6h: el percentile 10/90 sobre 90 días casi no cambia hora a hora.
  //  - gcTime 24h: si el user vuelve más tarde, NO refetch.
  //  - retry false: si falla, no insistir (CoinGecko 429 → backoff por sí solo).
  //  - refetchOnWindowFocus/Mount false: evitar burst de calls al volver al tab.
  const queries = useQueries({
    queries: cryptoAssets.map((a) => ({
      queryKey: ['sr-history', a.id],
      staleTime: 6 * 60 * 60_000,
      gcTime: 24 * 60 * 60_000,
      queryFn: () => fetchCryptoHistory(a.coingeckoId!, '3M'),
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    })),
  });

  return useMemo(() => {
    const m = new Map<string, SRLevels | null>();
    cryptoAssets.forEach((a, i) => {
      const q = queries[i];
      if (q.isLoading) return; // skip — el caller verá undefined
      const data = q.data;
      if (!data || data.length === 0) {
        m.set(a.id, null);
        return;
      }
      m.set(a.id, computeSRFromPrices(data.map((p) => p.price)));
    });
    // Para assets sin histórico (cedear/bono/etf/etc) → null explícito.
    for (const a of assets ?? []) {
      if (!cryptoAssets.includes(a)) m.set(a.id, null);
    }
    return m;
  }, [assets, cryptoAssets, queries]);
}

/**
 * Performance de staking: agregada por activo + por regla. Mide
 * `actual / expected` en USD para que la card del Home muestre un
 * solo número global.
 */
export function useStakingSummary(): StakingSummary | undefined {
  const rules = useStakingRules();
  const txs = useTransactions();
  const assets = useAssets();
  const prices = usePriceMap();
  const fx = useFx();
  return useMemo(() => {
    if (!rules || !txs || !assets || !prices) return undefined;
    return computeStakingSummary({ rules, txs, assets, prices, fx });
  }, [rules, txs, assets, prices, fx]);
}
