/**
 * Dialog de búsqueda global. Se invoca desde la lupita del top-bar y
 * desde cualquier "Buscar activo" en la app.
 *
 * Comportamiento:
 *  - Input al tope con autofocus.
 *  - Lista de resultados scrollable abajo.
 *  - Al clickear un resultado:
 *    - Si es local → navega a `/asset/:id`
 *    - Si es externo → ofrece "Agregar a la biblioteca" (Phase 2 — por ahora
 *      navegamos a la search externa con un toast de "no implementado").
 *  - Esc / X → cierra (lo maneja Radix Dialog).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssets } from '@/lib/db/queries';
import { useAssetSearch } from '@/lib/hooks/useAssetSearch';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { AssetSearchResult } from '@/lib/api/search';

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const navigate = useNavigate();
  const localAssets = useAssets();
  const [query, setQuery] = useState('');
  const { results, loading, error } = useAssetSearch(query, { localAssets });

  function handleSelect(result: AssetSearchResult) {
    if (result.alreadyInLibrary) {
      navigate(`/asset/${result.id}`);
      onOpenChange(false);
      setQuery('');
    } else {
      // Phase 2: confirmar alta del asset y persistir.
      // Por ahora avisamos.
      alert(
        `"${result.ticker} — ${result.name}" no está en tu biblioteca. ` +
          `(Phase 2: lo agregamos automáticamente al confirmar.)`,
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setQuery('');
        onOpenChange(o);
      }}
    >
      <DialogContent
        title="Buscar activo"
        description="Cripto, acciones, ETFs y CEDEARs."
        className="max-w-lg"
      >
        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            placeholder="Ej: bitcoin, AAPL, KO..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />

          {/* Resultados */}
          <div className="max-h-[60vh] overflow-y-auto">
            {error && (
              <div className="rounded-md bg-negative/[0.12] px-3 py-2 text-[12px] text-negative">
                {error}
              </div>
            )}
            {!error && query.trim().length === 0 && (
              <EmptyHint />
            )}
            {!error && query.trim().length > 0 && results.length === 0 && !loading && (
              <div className="px-3 py-6 text-center text-[13px] text-text-muted">
                Sin resultados para "{query.trim()}".
              </div>
            )}
            {results.length > 0 && (
              <ul className="flex flex-col gap-1">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(r)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition-colors',
                        'hover:border-border-subtle hover:bg-bg-elevated/40',
                      )}
                    >
                      <ResultLogo result={r} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-text-primary">
                            {r.ticker}
                          </span>
                          <span className="rounded bg-bg-base px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-text-muted">
                            {r.type}
                          </span>
                          {r.alreadyInLibrary && (
                            <span className="rounded bg-positive/[0.12] px-1.5 py-px text-[10px] font-semibold text-positive">
                              tenés
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-text-secondary">
                          {r.name}
                        </div>
                      </div>
                      <SourceTag source={r.source} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {loading && (
              <div className="flex justify-center py-3 text-[12px] text-text-muted">
                Buscando…
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-componentes ───────────────────────────────────────────────────────

function ResultLogo({ result }: { result: AssetSearchResult }) {
  const text = result.logo ?? result.ticker.slice(0, 1).toUpperCase();
  const bg = result.logoBg ?? 'hsl(var(--bg-elevated))';
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
      style={{ background: bg }}
      aria-hidden="true"
    >
      {text}
    </div>
  );
}

function SourceTag({ source }: { source: AssetSearchResult['source'] }) {
  const cls =
    source === 'local'
      ? 'bg-positive/[0.12] text-positive'
      : 'bg-bg-elevated text-text-muted';
  const label =
    source === 'local'
      ? 'biblioteca'
      : source === 'cedear-seed'
        ? 'CEDEAR'
        : source === 'coingecko'
          ? 'CoinGecko'
          : 'Twelve Data';
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider', cls)}>
      {label}
    </span>
  );
}

function EmptyHint() {
  return (
    <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
      <Icon name="search" size={28} color="hsl(var(--text-muted))" />
      <p className="text-[13px] text-text-secondary">
        Buscá entre tus activos cargados, CEDEARs, criptos y acciones USA.
      </p>
      <p className="text-[11px] text-text-muted">
        Probá: <span className="font-mono">bitcoin</span>,{' '}
        <span className="font-mono">apple</span>,{' '}
        <span className="font-mono">koxp</span>
      </p>
    </div>
  );
}
