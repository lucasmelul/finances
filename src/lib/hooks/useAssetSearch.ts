/**
 * Hook con debounce + cancelación para búsqueda global de activos.
 *
 * Comportamiento:
 *  - Debounce de 250ms — evitamos pegar a APIs externas en cada keystroke.
 *  - Cancelación: si el query cambia mientras hay un fetch in-flight, lo
 *    abortamos para que la respuesta vieja no pise la nueva.
 *  - Estado expuesto: `{ results, loading, error }`. La pantalla decide
 *    cómo mostrarlo.
 */

import { useEffect, useState } from 'react';
import { searchAssets, type AssetSearchResult } from '@/lib/api/search';
import type { Asset, AssetType } from '@/lib/types';

interface UseAssetSearchOptions {
  /** Lista de assets ya cargados (para detectar `alreadyInLibrary`). */
  localAssets: Asset[] | undefined;
  /** Filtro opcional por tipo. */
  types?: AssetType[];
  /** Modo offline / tests — solo busca en local. */
  localOnly?: boolean;
  /** Debounce en ms. Default 250. */
  debounceMs?: number;
}

interface UseAssetSearchState {
  results: AssetSearchResult[];
  loading: boolean;
  error: string | null;
}

export function useAssetSearch(
  query: string,
  opts: UseAssetSearchOptions,
): UseAssetSearchState {
  const [state, setState] = useState<UseAssetSearchState>({
    results: [],
    loading: false,
    error: null,
  });
  const debounceMs = opts.debounceMs ?? 250;

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1 || !opts.localAssets) {
      setState({ results: [], loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setState((s) => ({ ...s, loading: true, error: null }));

    const timeout = setTimeout(async () => {
      try {
        const results = await searchAssets(trimmed, {
          localAssets: opts.localAssets!,
          types: opts.types,
          localOnly: opts.localOnly,
          signal: controller.signal,
        });
        if (cancelled) return;
        setState({ results, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        // AbortError es esperable (cambió el query) — no es un error real.
        if (err instanceof Error && err.name === 'AbortError') return;
        setState({
          results: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Error desconocido',
        });
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
    // localAssets es array → useEffect deps usa identity. El caller debería
    // memoizar, pero si no lo hace solo dispara más fetches; nada se rompe.
  }, [query, opts.localAssets, opts.types, opts.localOnly, debounceMs]);

  return state;
}
