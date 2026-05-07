/**
 * Hook para histórico de precios — alimenta los charts de Asset detail.
 *
 * Estrategia:
 *  - Cripto → CoinGecko `/coins/{id}/market_chart` (con cache IndexedDB)
 *  - CEDEAR / ETF / stock → TODO Phase 2 con stooq o Yahoo proxy
 *  - Bono / fondo → no soportado por API pública confiable, devolvemos null
 *
 * Cache de dos capas:
 *  - TanStack en memoria (staleTime 6h, gcTime 24h)
 *  - IndexedDB en `historyCache.ts` (TTL 6h, sobrevive reload)
 *
 * Si CoinGecko falla por rate limit, devolvemos cache stale (mejor un
 * histórico de hace 12h que no mostrar nada).
 */

import { useQuery } from '@tanstack/react-query';
import type { ChartPeriod, PriceHistoryPoint } from './coingecko';
import { fetchAndCacheHistory } from '@/lib/db/historyCache';
import type { Asset } from '@/lib/types';

export type { ChartPeriod, PriceHistoryPoint };

/**
 * Carga el histórico del activo para el período. Devuelve `data: undefined`
 * mientras carga, `data: null` si el tipo de activo no es soportable hoy
 * (CEDEAR/bono/fondo sin API pública).
 */
export function usePriceHistory(asset: Asset | undefined, period: ChartPeriod) {
  return useQuery<PriceHistoryPoint[] | null>({
    queryKey: ['price-history', asset?.id, period],
    enabled: !!asset,
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    queryFn: async () => {
      if (!asset) return null;
      if (asset.type === 'crypto' && asset.coingeckoId) {
        return fetchAndCacheHistory(asset.id, asset.coingeckoId, period);
      }
      // TODO Phase 2: CEDEAR/ETF/stock vía stooq o proxy de Yahoo
      // TODO Phase 3: bonos AR vía data912 / IAMC
      // TODO Phase 3: FCI vía CAFCI
      return null;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}
