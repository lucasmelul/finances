/**
 * Hook para histórico de precios — alimenta los charts de Asset detail.
 *
 * Estrategia:
 *  - Cripto → CoinGecko `/coins/{id}/market_chart`
 *  - CEDEAR / ETF / stock → TODO Phase 2 con stooq o Yahoo proxy
 *  - Bono / fondo → no soportado por API pública confiable, devolvemos null
 *
 * El cache de TanStack vive 5 minutos (los charts no cambian segundo a
 * segundo, no vale gastar req/min en re-fetchear lo mismo). Si el usuario
 * vuelve al mismo activo+período en <5min, hit del cache.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchCryptoHistory, type ChartPeriod, type PriceHistoryPoint } from './coingecko';
import type { Asset } from '@/lib/types';

export type { ChartPeriod, PriceHistoryPoint };

const STALE_MS = 5 * 60_000;

/**
 * Carga el histórico del activo para el período. Devuelve `data: undefined`
 * mientras carga, `data: null` si el tipo de activo no es soportable hoy
 * (CEDEAR/bono/fondo sin API pública).
 */
export function usePriceHistory(asset: Asset | undefined, period: ChartPeriod) {
  return useQuery<PriceHistoryPoint[] | null>({
    queryKey: ['price-history', asset?.id, period],
    enabled: !!asset,
    staleTime: STALE_MS,
    queryFn: async () => {
      if (!asset) return null;
      // Crypto via CoinGecko
      if (asset.type === 'crypto' && asset.coingeckoId) {
        return fetchCryptoHistory(asset.coingeckoId, period);
      }
      // TODO Phase 2: CEDEAR/ETF/stock vía stooq o proxy de Yahoo
      // TODO Phase 3: bonos AR vía data912 / IAMC
      // TODO Phase 3: FCI vía CAFCI
      return null;
    },
    retry: 1,
  });
}
