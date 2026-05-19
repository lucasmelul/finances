/**
 * Pantalla Settings — preferencias y mantenimiento de la app.
 *
 * Bloques:
 *  1. Modo de datos (demo vs limpio): permite borrar todo y re-sembrar.
 *  2. API keys: muestra qué proveedores están configurados (lectura del
 *     `import.meta.env`). Para editar hay que tocar `.env.local` y reiniciar.
 *  3. Versión + info técnica.
 */

import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAccounts, useTransactions } from '@/lib/db/queries';
import {
  getBootstrapMode,
  resetToClean,
  resetToDemo,
} from '@/lib/db/bootstrap';
import {
  exportDatabase,
  downloadAsJson,
  importDatabase,
  type ImportMode,
  readJsonFile,
} from '@/lib/db/portability';
import { hasAnthropic } from '@/lib/api/anthropic';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

export function Settings() {
  const navigate = useNavigate();
  const accounts = useAccounts();
  const txs = useTransactions();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(() => getBootstrapMode());
  const [importError, setImportError] = useState<string | null>(null);
  const [importOk, setImportOk] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Indicadores: ¿hay datos de demo todavía cargados?
  const hasSeedTxs = !!txs?.some((t) => t.id.startsWith('seed-tx-'));
  const hasUserData = !!txs?.some((t) => !t.id.startsWith('seed-tx-'));
  const accountCount = accounts?.length ?? 0;

  async function handleResetClean() {
    if (
      !window.confirm(
        '¿Borrar TODO y empezar limpio?\n\n' +
          'Esto elimina:\n' +
          '• Todas tus operaciones (incluidas las que cargaste)\n' +
          '• Todas las cuentas\n' +
          '• Las reglas de staking\n\n' +
          'Solo se mantienen las 4 carteras default y el catálogo de tickers.',
      )
    )
      return;
    setBusy(true);
    try {
      await resetToClean();
      setMode('clean');
      window.location.href = '/';
    } finally {
      setBusy(false);
    }
  }

  async function handleResetDemo() {
    if (
      !window.confirm(
        '¿Cargar datos de demostración?\n\n' +
          'Se BORRAN tus datos actuales y se reemplazan por el seed completo ' +
          '(9 cuentas, 16 holdings, 6 tx) para explorar la app.',
      )
    )
      return;
    setBusy(true);
    try {
      await resetToDemo();
      setMode('demo');
      window.location.href = '/';
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setBusy(true);
    try {
      const data = await exportDatabase();
      downloadAsJson(data);
    } finally {
      setBusy(false);
    }
  }

  const importModeRef = React.useRef<ImportMode>('replace');

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportOk(null);
    setBusy(true);
    try {
      const raw = await readJsonFile(file);
      const mode = importModeRef.current;
      const { imported } = await importDatabase(raw, mode);
      const modeLabel = mode === 'replace' ? 'reemplazado todo con' : 'mergeado';
      setImportOk(`✓ ${modeLabel} ${imported} registros.`);
      window.location.reload();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Error al importar.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function triggerImport(mode: ImportMode) {
    importModeRef.current = mode;
    fileInputRef.current?.click();
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">
          Ajustes
        </h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Configuración de la app y mantenimiento de datos.
        </p>
      </header>

      {/* Modo de datos */}
      <section className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Datos
        </div>

        {hasSeedTxs && (
          <div className="mb-3 rounded-md bg-warning/[0.12] px-3 py-2 text-[12px] text-warning">
            ⚠️ Tu portfolio incluye datos de demostración. Si querés usar la app
            con tus datos reales, eligí <strong>"Empezar limpio"</strong>.
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 gap-2 text-[12px]">
          <Stat label="Cuentas" value={accountCount} />
          <Stat label="Operaciones" value={txs?.length ?? 0} />
          <Stat
            label="Modo actual"
            value={mode === 'demo' ? 'Demo' : 'Limpio'}
            tone="neutral"
          />
          <Stat
            label="Tu data"
            value={hasUserData ? 'Sí' : 'No'}
            tone={hasUserData ? 'positive' : 'neutral'}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="surface"
            size="md"
            full
            disabled={busy || mode === 'clean'}
            leftIcon="x"
            onClick={handleResetClean}
          >
            {mode === 'clean' ? 'Ya estás en modo limpio' : 'Empezar limpio (borrar todo)'}
          </Button>
          <Button
            variant="ghost"
            size="md"
            full
            disabled={busy}
            leftIcon="refresh"
            onClick={handleResetDemo}
          >
            Cargar datos de demostración
          </Button>
        </div>
      </section>

      {/* Backup / Restore */}
      <section className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Backup y restauración
        </div>
        <p className="mb-3 text-[12px] text-text-muted">
          Exportá tus datos a JSON para hacer un backup o moverlos a otro dispositivo.
        </p>

        {importError && (
          <div className="mb-2 rounded-md bg-negative/[0.12] px-3 py-2 text-[12px] text-negative">
            {importError}
          </div>
        )}
        {importOk && (
          <div className="mb-2 rounded-md bg-positive/[0.12] px-3 py-2 text-[12px] text-positive">
            {importOk}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            variant="surface"
            size="md"
            full
            disabled={busy}
            leftIcon="arrow-down"
            onClick={handleExport}
          >
            Exportar JSON
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              size="md"
              full
              disabled={busy}
              leftIcon="arrow-up"
              onClick={() => triggerImport('replace')}
            >
              Importar (reemplazar)
            </Button>
            <Button
              variant="ghost"
              size="md"
              full
              disabled={busy}
              leftIcon="arrow-up"
              onClick={() => triggerImport('merge')}
            >
              Importar (merge)
            </Button>
          </div>
          <p className="text-[10px] text-text-muted">
            <strong>Reemplazar</strong>: borra todo y carga el backup desde cero.
            <strong> Merge</strong>: agrega o actualiza sin borrar lo existente.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImport}
          />
        </div>
      </section>

      {/* API keys */}
      <section className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Proveedores de datos
        </div>
        <div className="flex flex-col gap-1.5">
          <ApiRow
            name="DolarAPI"
            description="Cotizaciones del USD (oficial / MEP / CCL / blue)"
            ok={true}
            note="Sin API key — endpoint público"
          />
          <ApiRow
            name="CoinGecko"
            description="Precios e histórico de criptos"
            ok={true}
            note="Sin API key — free tier"
          />
          <ApiRow
            name="Twelve Data"
            description="Precios de stocks/ETFs USA (subyacente CEDEAR)"
            ok={!!import.meta.env.VITE_TWELVEDATA_KEY && import.meta.env.VITE_TWELVEDATA_KEY !== 'demo'}
            note="Configurá VITE_TWELVEDATA_KEY en .env.local"
          />
          <ApiRow
            name="Anthropic Claude"
            description="Chat IA para parseo de operaciones"
            ok={hasAnthropic}
            note="Configurá VITE_ANTHROPIC_API_KEY en .env.local"
          />
        </div>
        <p className="mt-2 text-[10px] text-text-muted">
          Tip: para cambiar API keys, editá <code>.env.local</code> y reiniciá
          el dev server.
        </p>
      </section>

      {/* Footer */}
      <section className="rounded-2xl border border-border-subtle bg-bg-surface p-4 text-[11px] text-text-muted">
        <div className="flex items-center justify-between">
          <span>Portfolio Tracker · v0.1.0</span>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-accent hover:underline"
          >
            Volver
          </button>
        </div>
      </section>
    </div>
  );
}

// ─── Sub-componentes ───────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'positive';
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-base p-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 text-sm font-semibold tabular-nums',
          tone === 'positive' && 'text-positive',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ApiRow({
  name,
  description,
  ok,
  note,
}: {
  name: string;
  description: string;
  ok: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          ok ? 'bg-positive/[0.14] text-positive' : 'bg-text-muted/15 text-text-muted',
        )}
        aria-hidden="true"
      >
        <Icon name={ok ? 'check' : 'x'} size={11} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-text-primary">{name}</div>
        <div className="text-[11px] text-text-secondary">{description}</div>
        {note && <div className="mt-0.5 text-[10px] text-text-muted">{note}</div>}
      </div>
    </div>
  );
}
