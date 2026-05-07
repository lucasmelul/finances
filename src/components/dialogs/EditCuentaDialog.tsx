/**
 * Modal "Editar cuenta" — permite cambiar nombre, tipo, moneda y notas.
 * El campo `tag` es inmutable post-creación y se muestra solo como lectura.
 */

import { useId, useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { TagBadge } from '@/components/ui/TagBadge';
import { updateAccount, archiveAccount, unarchiveAccount } from '@/lib/db/mutations';
import type { Account, AccountKind, Currency } from '@/lib/types';

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
  name: z.string().min(1, 'Nombre requerido').max(40, 'Máximo 40 caracteres'),
  kind: z.enum(['broker', 'exchange', 'wallet', 'bank', 'cash']),
  currency: z.enum(['ARS', 'USD', 'USDT', 'BTC', 'EUR']).optional(),
  notes: z.string().max(200).optional(),
});

type FormValues = z.infer<typeof schema>;

interface EditCuentaDialogProps {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditCuentaDialog({ account, open, onOpenChange }: EditCuentaDialogProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const nameId = useId();
  const kindId = useId();
  const currencyId = useId();
  const notesId = useId();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: account?.name ?? '',
      kind: account?.kind ?? 'broker',
      currency: account?.currency,
      notes: account?.notes ?? '',
    },
  });

  // Sync form when account changes
  useEffect(() => {
    if (account) {
      reset({
        name: account.name,
        kind: account.kind,
        currency: account.currency,
        notes: account.notes ?? '',
      });
    }
  }, [account, reset]);

  async function onSubmit(values: FormValues) {
    if (!account) return;
    setSubmitError(null);
    try {
      await updateAccount(account.id, {
        name: values.name,
        kind: values.kind,
        currency: values.currency,
        notes: values.notes || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  async function handleArchiveToggle() {
    if (!account) return;
    setArchiving(true);
    try {
      if (account.archivedAt) {
        await unarchiveAccount(account.id);
      } else {
        await archiveAccount(account.id);
      }
      onOpenChange(false);
    } finally {
      setArchiving(false);
    }
  }

  if (!account) return null;

  const isArchived = !!account.archivedAt;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setSubmitError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent
        title="Editar cuenta"
        description="Modificá nombre, tipo o moneda de la cuenta."
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

          {/* Tag fiscal — solo lectura */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Etiqueta fiscal
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base px-3 py-2.5">
              <TagBadge tag={account.tag} />
              <span className="text-sm text-text-secondary">
                {account.tag === 'A' ? 'Declarado' : 'Privado'} — inmutable
              </span>
            </div>
          </div>

          {/* Moneda */}
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
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>

          {/* Archive / unarchive */}
          <div className="border-t border-border-subtle pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              full
              disabled={archiving}
              onClick={handleArchiveToggle}
            >
              {isArchived ? 'Desarchivar cuenta' : 'Archivar cuenta'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-[11px] text-negative">{msg}</p>;
}
