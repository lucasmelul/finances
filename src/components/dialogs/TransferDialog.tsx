/**
 * Dialog para registrar un retiro o una transferencia entre cuentas.
 *
 * Modos:
 *  - "Retiro"        → un solo `transfer_out` (el dinero sale del portfolio).
 *  - "Entre cuentas" → `transfer_out` + `transfer_in` atómicos.
 *
 * El formulario pre-llena el precio unitario desde el priceCache cuando el
 * activo seleccionado tiene cotización. Para cash (type='cash') fija precio=1
 * y oculta el campo.
 */

import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useAccounts, useAssets } from '@/lib/db/queries';
import { usePriceMap } from '@/lib/db/derived';
import { createTransfer } from '@/lib/db/mutations';
import { cn } from '@/lib/utils';
import type { Currency, PortfolioBucket } from '@/lib/types';

// ─── Constantes ───────────────────────────────────────────────────────────────

type TransferMode = 'deposito' | 'retiro' | 'entre-cuentas';

const BUCKET_OPTIONS: SelectOption[] = [
  { value: 'largo', label: 'Largo plazo' },
  { value: 'medio', label: 'Mediano' },
  { value: 'corto', label: 'Corto plazo' },
  { value: 'trade', label: 'Trade' },
];

const CURRENCY_OPTIONS: SelectOption[] = [
  { value: 'USD', label: 'USD' },
  { value: 'ARS', label: 'ARS' },
  { value: 'USDT', label: 'USDT' },
  { value: 'EUR', label: 'EUR' },
  { value: 'BTC', label: 'BTC' },
];

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  fromAccountId: z.string().min(1, 'Elegí una cuenta de origen'),
  toAccountId: z.string().optional(),
  assetId: z.string().min(1, 'Elegí un activo'),
  bucket: z.enum(['corto', 'medio', 'largo', 'trade']),
  qty: z.coerce.number().positive('Debe ser mayor a 0'),
  unitPrice: z.coerce.number().min(0),
  priceCurrency: z.enum(['ARS', 'USD', 'USDT', 'EUR', 'BTC']),
  date: z.string().min(1, 'Elegí una fecha'),
  notes: z.string().max(200).optional(),
});

type FormValues = z.infer<typeof schema>;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cuenta pre-seleccionada al abrir desde una fila de cuenta. */
  defaultFromAccountId?: string;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function TransferDialog({
  open,
  onOpenChange,
  defaultFromAccountId,
}: TransferDialogProps) {
  const [mode, setMode] = useState<TransferMode>('retiro');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const accounts = useAccounts();
  const assets = useAssets();
  const prices = usePriceMap();

  const today = new Date().toISOString().slice(0, 10);

  const defaults: FormValues = {
    fromAccountId: defaultFromAccountId ?? '',
    toAccountId: '',
    assetId: '',
    bucket: 'medio',
    qty: 0,
    unitPrice: 1,
    priceCurrency: 'USD',
    date: today,
    notes: '',
  };

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  const watchedAssetId = useWatch({ control, name: 'assetId' });
  const watchedFromId  = useWatch({ control, name: 'fromAccountId' });

  // Pre-llenar precio cuando cambia el activo seleccionado
  useEffect(() => {
    if (!watchedAssetId || !assets || !prices) return;
    const asset = assets.find((a) => a.id === watchedAssetId);
    if (!asset) return;

    if (asset.type === 'cash') {
      setValue('unitPrice', 1);
      setValue('priceCurrency', asset.currency as Currency);
    } else {
      const p = prices.get(asset.id);
      if (p) {
        setValue('unitPrice', p.price);
        setValue('priceCurrency', p.currency as Currency);
      }
    }
  }, [watchedAssetId, assets, prices, setValue]);

  // Resetear form al abrir
  useEffect(() => {
    if (open) {
      reset({ ...defaults, fromAccountId: defaultFromAccountId ?? '' });
      setSubmitError(null);
      setMode('retiro');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── Submit ────────────────────────────────────────────────────────────────

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      const toAccountId =
        (mode === 'entre-cuentas' || mode === 'deposito') && values.toAccountId
          ? values.toAccountId
          : undefined;
      const fromAccountId =
        (mode === 'entre-cuentas' || mode === 'retiro') && values.fromAccountId
          ? values.fromAccountId
          : undefined;

      if (mode === 'entre-cuentas' && !toAccountId) {
        setSubmitError('Elegí una cuenta de destino.');
        return;
      }
      if (mode === 'deposito' && !toAccountId) {
        setSubmitError('Elegí la cuenta donde entra el dinero.');
        return;
      }
      if (mode === 'retiro' && !fromAccountId) {
        setSubmitError('Elegí la cuenta de origen.');
        return;
      }

      await createTransfer({
        assetId: values.assetId,
        fromAccountId,
        toAccountId,
        bucket: values.bucket as PortfolioBucket,
        qty: values.qty,
        unitPrice: values.unitPrice,
        priceCurrency: values.priceCurrency as Currency,
        date: `${values.date}T12:00:00.000Z`,
        notes: values.notes || undefined,
      });

      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  // ─── Options ───────────────────────────────────────────────────────────────

  const accountOptions: SelectOption[] = [
    { value: '', label: '— Elegir cuenta —' },
    ...(accounts ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];

  const toAccountOptions: SelectOption[] = [
    { value: '', label: '— Elegir cuenta —' },
    ...(accounts ?? [])
      .filter((a) => a.id !== watchedFromId)
      .map((a) => ({ value: a.id, label: a.name })),
  ];

  const assetOptions: SelectOption[] = [
    { value: '', label: '— Elegir activo —' },
    ...(assets ?? []).map((a) => ({ value: a.id, label: `${a.ticker} — ${a.name}` })),
  ];

  const selectedAsset = assets?.find((a) => a.id === watchedAssetId);
  const isCash = selectedAsset?.type === 'cash';

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Depósito / Retiro / Transferencia">

        {/* Toggle de modo */}
        <div className="mb-4 flex gap-1 rounded-[10px] border border-border-subtle bg-bg-surface p-1">
          {(['deposito', 'retiro', 'entre-cuentas'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors',
                mode === m
                  ? 'bg-bg-elevated text-text-primary'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {m === 'deposito' ? 'Depósito' : m === 'retiro' ? 'Retiro' : 'Entre cuentas'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">

          {/* Cuenta de origen (retiro / entre cuentas) */}
          {(mode === 'retiro' || mode === 'entre-cuentas') && (
            <FieldGroup label="Desde" error={errors.fromAccountId?.message}>
              <Select options={accountOptions} {...register('fromAccountId')} />
            </FieldGroup>
          )}

          {/* Cuenta de destino (depósito / entre cuentas) */}
          {(mode === 'deposito' || mode === 'entre-cuentas') && (
            <FieldGroup
              label={mode === 'deposito' ? 'Cuenta' : 'Hacia'}
              error={errors.toAccountId?.message}
            >
              <Select options={mode === 'entre-cuentas' ? toAccountOptions : accountOptions} {...register('toAccountId')} />
            </FieldGroup>
          )}

          {/* Activo + cartera */}
          <div className="grid grid-cols-2 gap-2">
            <FieldGroup label="Activo" error={errors.assetId?.message}>
              <Select options={assetOptions} {...register('assetId')} />
            </FieldGroup>
            <FieldGroup label="Cartera" error={errors.bucket?.message}>
              <Select options={BUCKET_OPTIONS} {...register('bucket')} />
            </FieldGroup>
          </div>

          {/* Cantidad + precio (precio oculto para cash) */}
          <div className={cn('grid gap-2', isCash ? 'grid-cols-2' : 'grid-cols-3')}>
            <FieldGroup label="Cantidad" error={errors.qty?.message}>
              <Input type="number" step="any" inputMode="decimal" {...register('qty')} />
            </FieldGroup>
            {!isCash && (
              <FieldGroup label="Precio unit." error={errors.unitPrice?.message}>
                <Input type="number" step="any" inputMode="decimal" {...register('unitPrice')} />
              </FieldGroup>
            )}
            <FieldGroup label="Moneda" error={errors.priceCurrency?.message}>
              <Select options={CURRENCY_OPTIONS} {...register('priceCurrency')} />
            </FieldGroup>
          </div>

          {/* Fecha + notas */}
          <div className="grid grid-cols-2 gap-2">
            <FieldGroup label="Fecha" error={errors.date?.message}>
              <Input type="date" {...register('date')} />
            </FieldGroup>
            <FieldGroup label="Notas">
              <Input placeholder="opcional" {...register('notes')} />
            </FieldGroup>
          </div>

          {/* Error */}
          {submitError && (
            <div className="rounded-md bg-negative/[0.12] px-3 py-2 text-[12px] text-negative">
              {submitError}
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="ghost" size="md" full onClick={() => onOpenChange(false)}>
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
              {isSubmitting
                ? 'Guardando…'
                : mode === 'deposito'
                  ? 'Registrar depósito'
                  : mode === 'retiro'
                    ? 'Registrar retiro'
                    : 'Transferir'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helper UI ────────────────────────────────────────────────────────────────

function FieldGroup({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-negative">{error}</p>}
    </div>
  );
}
