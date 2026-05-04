/**
 * Pantalla "Importar" — alta masiva de transactions desde CSV.
 *
 * Flujo:
 *  1. Drop / paste / file input → parseo
 *  2. Mapping editable (auto-detectado)
 *  3. Tabla preview con errores por fila + duplicados marcados
 *  4. Botones: "Omitir errores y duplicados → Importar válidas"
 *
 * No persiste hasta el confirm final. Cada fila válida se crea con
 * `createTransaction` en serie (no batch — preferimos lentitud a fallar
 * a la mitad sin reporte).
 */

import { useMemo, useState, type ChangeEvent } from 'react';
import { cn } from '@/lib/utils';
import { fmt } from '@/lib/format';
import { useAccounts, useAssets, useTransactions } from '@/lib/db/queries';
import { createTransaction } from '@/lib/db/mutations';
import {
  autoDetectMapping,
  parseCSV,
  validateRows,
  type ColumnMapping,
  type ParsedCSV,
  type RowResult,
} from '@/lib/csv';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/components/ui/Icon';

type ImportStatus =
  | { stage: 'idle' }
  | { stage: 'parsed'; data: ParsedCSV }
  | { stage: 'importing'; progress: number; total: number }
  | { stage: 'done'; created: number; skipped: number };

export function Importar() {
  const accounts = useAccounts();
  const assets = useAssets();
  const existingTxs = useTransactions();
  const [status, setStatus] = useState<ImportStatus>({ stage: 'idle' });
  const [text, setText] = useState('');
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);

  // Reparseamos cada vez que cambia text — barato (parser puro) y mantiene
  // la preview en sync sin botón "validar".
  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    return parseCSV(text);
  }, [text]);

  // Auto-detect mapping solo en el primer parseo. Si el usuario edita,
  // respetamos su elección.
  if (parsed && !mapping && parsed.headers.length > 0) {
    setMapping(autoDetectMapping(parsed.headers));
  }

  const validation = useMemo<RowResult[] | null>(() => {
    if (!parsed || !mapping || !accounts || !assets || !existingTxs) return null;
    return validateRows(parsed.rows, mapping, {
      assets,
      accounts,
      existingTxs,
    });
  }, [parsed, mapping, accounts, assets, existingTxs]);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ''));
      setMapping(null); // forzar re-detect
      setStatus({ stage: 'idle' });
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!validation) return;
    const toImport = validation.filter((r) => r.errors.length === 0 && !r.isDuplicate);
    setStatus({ stage: 'importing', progress: 0, total: toImport.length });

    let created = 0;
    let skipped = validation.length - toImport.length;

    for (const row of toImport) {
      if (!row.tx) continue;
      try {
        await createTransaction(row.tx);
        created++;
      } catch (err) {
        console.error('[csv import] tx falló:', err);
        skipped++;
      }
      setStatus({
        stage: 'importing',
        progress: created + (toImport.length - created),
        total: toImport.length,
      });
    }
    setStatus({ stage: 'done', created, skipped });
  }

  function reset() {
    setText('');
    setMapping(null);
    setStatus({ stage: 'idle' });
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const errorCount = validation?.filter((r) => r.errors.length > 0).length ?? 0;
  const dupCount = validation?.filter((r) => r.isDuplicate && r.errors.length === 0).length ?? 0;
  const validCount =
    validation?.filter((r) => r.errors.length === 0 && !r.isDuplicate).length ?? 0;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">
          Importar
        </h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Cargá operaciones desde CSV o pegá el contenido. Detectamos errores y
          duplicados antes de guardar.
        </p>
      </header>

      {status.stage === 'done' ? (
        <DoneScreen
          created={status.created}
          skipped={status.skipped}
          onReset={reset}
        />
      ) : (
        <>
          {/* Input section */}
          <section className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Origen del CSV
              </div>
              <label className="cursor-pointer text-[12px] text-accent hover:underline">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFile}
                />
                Subir archivo
              </label>
            </div>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setMapping(null);
              }}
              placeholder="date,kind,asset,qty,unitPrice,currency,account,bucket
2026-04-23,buy,AAPL,50,8950,ARS,IOL,largo"
              className="h-32 w-full resize-y rounded-lg border border-border-subtle bg-bg-base p-3 font-mono text-[12px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <p className="mt-2 text-[10px] text-text-muted">
              Columnas mínimas: date, kind, asset, qty, unitPrice, currency,
              account. <strong>bucket</strong> y <strong>notes</strong> son
              opcionales. Acepta delimiter <code>,</code> o <code>;</code>.
            </p>
          </section>

          {/* Mapping editable */}
          {parsed && parsed.headers.length > 0 && mapping && (
            <MappingEditor
              headers={parsed.headers}
              mapping={mapping}
              onChange={setMapping}
            />
          )}

          {/* Stats */}
          {validation && (
            <section className="grid grid-cols-3 gap-2">
              <Stat label="Válidas" value={validCount} tone="positive" />
              <Stat label="Duplicadas" value={dupCount} tone="warning" />
              <Stat label="Con error" value={errorCount} tone="negative" />
            </section>
          )}

          {/* Preview */}
          {validation && validation.length > 0 && (
            <PreviewTable rows={validation} mapping={mapping!} />
          )}

          {/* Acciones */}
          {validation && (
            <div className="flex gap-2">
              <Button variant="ghost" size="md" full onClick={reset}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="md"
                full
                disabled={validCount === 0 || status.stage === 'importing'}
                leftIcon="check"
                onClick={handleImport}
              >
                {status.stage === 'importing'
                  ? `Importando… ${status.progress}/${status.total}`
                  : `Importar ${validCount}${
                      dupCount + errorCount > 0
                        ? ` (omite ${dupCount + errorCount})`
                        : ''
                    }`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-componentes ───────────────────────────────────────────────────────

function MappingEditor({
  headers,
  mapping,
  onChange,
}: {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
}) {
  const fields: Array<[keyof ColumnMapping, string, boolean]> = [
    ['date', 'Fecha', true],
    ['kind', 'Tipo', true],
    ['asset', 'Activo', true],
    ['qty', 'Cantidad', true],
    ['unitPrice', 'Precio', true],
    ['currency', 'Moneda', true],
    ['account', 'Cuenta', true],
    ['bucket', 'Cartera', false],
    ['notes', 'Notas', false],
  ];
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-surface p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
        Mapeo de columnas
      </div>
      <div className="grid grid-cols-2 gap-2">
        {fields.map(([k, label, required]) => (
          <div key={k}>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
              {label} {required && <span className="text-negative">*</span>}
            </label>
            <select
              value={mapping[k] ?? ''}
              onChange={(e) =>
                onChange({ ...mapping, [k]: e.target.value })
              }
              className="h-9 w-full rounded-lg border border-border-subtle bg-bg-base px-2 text-[12px] text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">— ninguna —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </section>
  );
}

function PreviewTable({
  rows,
  mapping,
}: {
  rows: RowResult[];
  mapping: ColumnMapping;
}) {
  const max = 50;
  const visible = rows.slice(0, max);
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Preview {rows.length > max && `(primeras ${max} de ${rows.length})`}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border-subtle text-left text-text-muted">
              <th className="px-1 py-1">#</th>
              <th className="px-1 py-1">Fecha</th>
              <th className="px-1 py-1">Tipo</th>
              <th className="px-1 py-1">Activo</th>
              <th className="px-1 py-1 text-right">Qty</th>
              <th className="px-1 py-1 text-right">Precio</th>
              <th className="px-1 py-1">Cuenta</th>
              <th className="px-1 py-1">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.rowIndex}
                className={cn(
                  'border-b border-border-subtle/50',
                  r.errors.length > 0 && 'bg-negative/[0.06]',
                  r.isDuplicate && r.errors.length === 0 && 'bg-warning/[0.06]',
                )}
              >
                <td className="px-1 py-1.5 text-text-muted tabular-nums">
                  {r.rowIndex + 2}
                </td>
                <td className="px-1 py-1.5 tabular-nums">
                  {r.raw[mapping.date] ?? '—'}
                </td>
                <td className="px-1 py-1.5">{r.raw[mapping.kind] ?? '—'}</td>
                <td className="px-1 py-1.5 font-semibold">
                  {r.raw[mapping.asset] ?? '—'}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums">
                  {r.raw[mapping.qty] ? fmt(parseFloat(r.raw[mapping.qty].replace(',', '.')), 4) : '—'}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums">
                  {r.raw[mapping.unitPrice] ?? '—'}
                </td>
                <td className="px-1 py-1.5">{r.raw[mapping.account] ?? '—'}</td>
                <td className="px-1 py-1.5">
                  {r.errors.length > 0 ? (
                    <span
                      className="text-negative"
                      title={r.errors.map((e) => `${e.field}: ${e.message}`).join('\n')}
                    >
                      {r.errors.length} error{r.errors.length === 1 ? '' : 'es'}
                    </span>
                  ) : r.isDuplicate ? (
                    <span className="text-warning">duplicada</span>
                  ) : (
                    <span className="text-positive">
                      <Icon name="check" size={11} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'positive' | 'warning' | 'negative';
}) {
  const cls = {
    positive: 'text-positive',
    warning: 'text-warning',
    negative: 'text-negative',
  }[tone];
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-2 text-center">
      <div className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </div>
      <div className={cn('mt-0.5 text-base font-semibold tabular-nums', cls)}>
        {value}
      </div>
    </div>
  );
}

function DoneScreen({
  created,
  skipped,
  onReset,
}: {
  created: number;
  skipped: number;
  onReset: () => void;
}) {
  return (
    <section className="rounded-2xl border border-positive/30 bg-positive/[0.06] p-4 text-center">
      <Icon name="check" size={32} color="hsl(var(--positive))" />
      <h2 className="mt-2 text-base font-semibold text-text-primary">
        Importadas {created} operación{created === 1 ? '' : 'es'}
      </h2>
      {skipped > 0 && (
        <p className="mt-1 text-[12px] text-text-muted">
          {skipped} omitida{skipped === 1 ? '' : 's'} (errores o duplicados)
        </p>
      )}
      <Input value={String(created)} readOnly className="hidden" />
      <Button
        className="mt-3"
        variant="primary"
        size="md"
        onClick={onReset}
      >
        Importar otro CSV
      </Button>
    </section>
  );
}
