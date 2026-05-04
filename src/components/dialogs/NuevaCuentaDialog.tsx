/**
 * Modal "Nueva cuenta" — alta manual de una cuenta (broker / exchange / etc.)
 *
 * Validación con Zod:
 *  - nombre no vacío (la unicidad la chequea `createAccount` contra DB)
 *  - kind y tag son enums cerrados → no pueden venir mal del select
 *  - currency es opcional (no toda cuenta es monomonetaria — un broker tiene
 *    saldo en ARS y USD)
 *
 * Diseño key: el campo `tag` (A/B fiscal) es el más crítico — el SPEC dice
 * que es INMUTABLE post-creación. Por eso el form deja un hint debajo y
 * dos botones grandes (no un select chiquito), para que la decisión se
 * tome conscientemente.
 */

import { useId, useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { TagBadge } from '@/components/ui/TagBadge';
import { cn } from '@/lib/utils';
import { createAccount } from '@/lib/db/mutations';
import type { AccountKind, AccountTag, Currency } from '@/lib/types';

// ─── Schema ────────────────────────────────────────────────────────────────

const KIND_OPTIONS: ReadonlyArray<{ value: AccountKind; label: string }> = [
  { value: 'broker', label: 'Broker (IOL, Bull, Cocos, ...)' },
  { value: 'exchange', label: 'Exchange (Binance, Lemon, ...)' },
  { value: 'wallet', label: 'Wallet (MetaMask, Ledger, ...)' },
  { value: 'bank', label: 'Banco (Galicia, Santander, ...)' },
  { value: 'cash', label: 'Efectivo / Caja fuerte' },
];

const CURRENCY_OPTIONS: ReadonlyArray<{ value: Currency; label: string }> = [
  { value: 'ARS', label: 'ARS — Pesos' },
  { value: 'USD', label: 'USD — Dólares' },
  { value: 'USDT', label: 'USDT — Tether' },
  { value: 'BTC', label: 'BTC — Bitcoin' },
  { value: 'EUR', label: 'EUR — Euros' },
];

const schema = z.object({
  name: z
    .string()
    .min(1, 'Nombre requerido')
    .max(40, 'Máximo 40 caracteres'),
  kind: z.enum(['broker', 'exchange', 'wallet', 'bank', 'cash']),
  tag: z.enum(['A', 'B']),
  currency: z.enum(['ARS', 'USD', 'USDT', 'BTC', 'EUR']).optional(),
  notes: z.string().max(200).optional(),
});

type FormValues = z.infer<typeof schema>;

// ─── Componente ────────────────────────────────────────────────────────────

interface NuevaCuentaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NuevaCuentaDialog({ open, onOpenChange }: NuevaCuentaDialogProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const nameId = useId();
  const kindId = useId();
  const currencyId = useId();
  const notesId = useId();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      kind: 'broker',
      tag: 'A',
      currency: 'ARS',
      notes: '',
    },
  });

  const selectedTag = watch('tag');

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      await createAccount({
        name: values.name,
        kind: values.kind,
        tag: values.tag,
        currency: values.currency,
        notes: values.notes || undefined,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al crear cuenta');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          setSubmitError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent
        title="Nueva cuenta"
        description="Agregá un broker, exchange, wallet o cuenta de banco."
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
          {/* Nombre */}
          <div>
            <label htmlFor={nameId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Nombre
            </label>
            <Input
              id={nameId}
              autoFocus
              autoComplete="off"
              placeholder="Ej. IOL, Binance, MetaMask"
              invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name && <FieldError msg={errors.name.message} />}
          </div>

          {/* Tipo */}
          <div>
            <label htmlFor={kindId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Tipo
            </label>
            <Select id={kindId} options={KIND_OPTIONS} {...register('kind')} />
          </div>

          {/* Tag fiscal — selector de 2 botones grandes */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Etiqueta fiscal
            </label>
            <div className="grid grid-cols-2 gap-2">
              <TagSelectorButton
                tag="A"
                label="Declarado"
                hint="Visible al fisco"
                selected={selectedTag === 'A'}
                onClick={() => setValue('tag', 'A', { shouldValidate: true })}
              />
              <TagSelectorButton
                tag="B"
                label="Privado"
                hint="No declarado"
                selected={selectedTag === 'B'}
                onClick={() => setValue('tag', 'B', { shouldValidate: true })}
              />
            </div>
            <p className="mt-1 text-[11px] text-text-muted">
              ⚠️ Esta etiqueta es <strong>inmutable</strong> después de crear la cuenta.
            </p>
          </div>

          {/* Moneda principal (opcional) */}
          <div>
            <label htmlFor={currencyId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Moneda principal <span className="font-normal normal-case text-text-muted">(opcional)</span>
            </label>
            <Select id={currencyId} options={CURRENCY_OPTIONS} {...register('currency')} />
          </div>

          {/* Notas */}
          <div>
            <label htmlFor={notesId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Notas <span className="font-normal normal-case text-text-muted">(opcional)</span>
            </label>
            <Input
              id={notesId}
              autoComplete="off"
              placeholder="Nro de cuenta, alias, lo que quieras"
              {...register('notes')}
            />
          </div>

          {submitError && (
            <div className="rounded-md bg-negative/[0.12] px-3 py-2 text-[12px] text-negative">
              {submitError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="md"
              full
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              full
              disabled={isSubmitting}
              leftIcon="check"
            >
              {isSubmitting ? 'Guardando…' : 'Crear cuenta'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-componentes locales ───────────────────────────────────────────────

function TagSelectorButton({
  tag,
  label,
  hint,
  selected,
  onClick,
}: {
  tag: AccountTag;
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex flex-col items-start gap-1 rounded-lg border bg-bg-base px-3 py-2.5 text-left transition-colors',
        selected
          ? tag === 'A'
            ? 'border-info bg-info/[0.08]'
            : 'border-warning bg-warning/[0.08]'
          : 'border-border-subtle hover:border-border-hover',
      )}
    >
      <div className="flex items-center gap-2">
        <TagBadge tag={tag} />
        <span className="text-sm font-semibold text-text-primary">{label}</span>
      </div>
      <span className="text-[11px] text-text-muted">{hint}</span>
    </button>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-[11px] text-negative">{msg}</p>;
}
