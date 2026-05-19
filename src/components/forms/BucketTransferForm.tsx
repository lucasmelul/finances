/**
 * Form para mover un activo entre carteras (buckets) dentro de la misma cuenta.
 * Crea atómicamente un transfer_out del bucket origen + transfer_in al destino.
 */

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { fmt } from '@/lib/format';
import { useAccounts, useAssets } from '@/lib/db/queries';
import { usePriceMap } from '@/lib/db/derived';
import { createBucketTransfer } from '@/lib/db/mutations';
import type { Currency, PortfolioBucket } from '@/lib/types';

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

const schema = z.object({
  assetId: z.string().min(1, 'Elegí un activo'),
  accountId: z.string().min(1, 'Elegí una cuenta'),
  qty: z.coerce.number().positive('Debe ser mayor a 0'),
  unitPrice: z.coerce.number().min(0, 'No puede ser negativo'),
  priceCurrency: z.enum(['ARS', 'USD', 'USDT', 'EUR', 'BTC']),
  fromBucket: z.enum(['corto', 'medio', 'largo', 'trade']),
  toBucket: z.enum(['corto', 'medio', 'largo', 'trade']),
  date: z.string().min(1, 'Elegí una fecha'),
  notes: z.string().max(200).optional(),
}).refine((v) => v.fromBucket !== v.toBucket, {
  message: 'Las carteras deben ser distintas',
  path: ['toBucket'],
});

type FormValues = z.infer<typeof schema>;

interface BucketTransferFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function BucketTransferForm({ onSuccess, onCancel }: BucketTransferFormProps) {
  const accounts = useAccounts();
  const assets = useAssets();
  const prices = usePriceMap();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      assetId: '',
      accountId: '',
      qty: 0,
      unitPrice: 0,
      priceCurrency: 'USD',
      fromBucket: 'medio',
      toBucket: 'corto',
      date: today,
      notes: '',
    },
  });

  const watchedAssetId = useWatch({ control, name: 'assetId' });
  const watchedQty = useWatch({ control, name: 'qty' }) ?? 0;
  const watchedPrice = useWatch({ control, name: 'unitPrice' }) ?? 0;
  const watchedCurrency = useWatch({ control, name: 'priceCurrency' }) ?? 'USD';
  const total = Number(watchedQty) * Number(watchedPrice);

  // Auto-fill precio cuando se elige el activo
  useEffect(() => {
    if (!watchedAssetId || !assets || !prices) return;
    const asset = assets.find((a) => a.id === watchedAssetId);
    if (!asset) return;
    const priceEntry = prices.get(asset.id);
    if (priceEntry && Number(watchedPrice) === 0) {
      setValue('unitPrice', priceEntry.price, { shouldValidate: true });
      setValue('priceCurrency', priceEntry.currency as Currency);
    }
  }, [watchedAssetId, assets, prices, setValue, watchedPrice]);

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      await createBucketTransfer({
        assetId: values.assetId,
        accountId: values.accountId,
        qty: values.qty,
        unitPrice: values.unitPrice,
        priceCurrency: values.priceCurrency,
        fromBucket: values.fromBucket as PortfolioBucket,
        toBucket: values.toBucket as PortfolioBucket,
        date: `${values.date}T12:00:00.000Z`,
        notes: values.notes || undefined,
      });
      reset({ ...values, qty: 0, notes: '' });
      onSuccess?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  const assetOptions: SelectOption[] = [
    { value: '', label: '— Elegir activo —' },
    ...(assets ?? []).map((a) => ({ value: a.id, label: `${a.ticker} — ${a.name}` })),
  ];
  const accountOptions: SelectOption[] = [
    { value: '', label: '— Elegir cuenta —' },
    ...(accounts ?? []).map((a) => ({ value: a.id, label: `${a.name} (${a.tag})` })),
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <FieldGroup label="Activo" error={errors.assetId?.message}>
        <Select options={assetOptions} {...register('assetId')} />
      </FieldGroup>

      <FieldGroup label="Cuenta" error={errors.accountId?.message}>
        <Select options={accountOptions} {...register('accountId')} />
      </FieldGroup>

      {/* Origen → Destino */}
      <div className="flex items-end gap-2">
        <FieldGroup label="Desde" error={errors.fromBucket?.message} className="flex-1">
          <Select options={BUCKET_OPTIONS} {...register('fromBucket')} />
        </FieldGroup>
        <div className="mb-0.5 flex-none pb-[1px]">
          <Icon name="arrow-right" size={16} className="text-text-muted" />
        </div>
        <FieldGroup label="Hacia" error={errors.toBucket?.message} className="flex-1">
          <Select options={BUCKET_OPTIONS} {...register('toBucket')} />
        </FieldGroup>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <FieldGroup label="Cantidad" error={errors.qty?.message}>
          <Input type="number" step="any" inputMode="decimal" {...register('qty')} />
        </FieldGroup>
        <FieldGroup label="Precio unit." error={errors.unitPrice?.message}>
          <Input type="number" step="any" inputMode="decimal" {...register('unitPrice')} />
        </FieldGroup>
        <FieldGroup label="Moneda" error={errors.priceCurrency?.message}>
          <Select options={CURRENCY_OPTIONS} {...register('priceCurrency')} />
        </FieldGroup>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FieldGroup label="Fecha" error={errors.date?.message}>
          <Input type="date" {...register('date')} />
        </FieldGroup>
        <FieldGroup label="Notas">
          <Input placeholder="opcional" {...register('notes')} />
        </FieldGroup>
      </div>

      {total > 0 && (
        <div className="rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-[13px]">
          <span className="text-text-secondary">Total: </span>
          <span className="font-semibold text-text-primary tabular-nums">
            {watchedCurrency === 'USD' || watchedCurrency === 'USDT'
              ? `US$ ${fmt(total, 2)}`
              : watchedCurrency === 'ARS'
                ? `$ ${fmt(total, 0)}`
                : `${fmt(total, 2)} ${watchedCurrency}`}
          </span>
        </div>
      )}

      {submitError && (
        <div className="rounded-md bg-negative/[0.12] px-3 py-2 text-[12px] text-negative">
          {submitError}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" size="md" full onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          size="md"
          full
          disabled={isSubmitting}
          leftIcon="check"
        >
          {isSubmitting ? 'Moviendo…' : 'Mover activo'}
        </Button>
      </div>
    </form>
  );
}

function FieldGroup({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-negative">{error}</p>}
    </div>
  );
}
