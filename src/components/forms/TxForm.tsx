/**
 * Form estructurado para crear/editar una transacción. Cumple con el SPEC §5.2
 * "Tab Form" — alternativa al chat cuando el usuario quiere precisión total
 * o el parser no entendió.
 *
 * Modos:
 *  - `mode='create'` → llama `createTransaction` al submit
 *  - `mode='edit'`   → recibe `txId` + valores iniciales y llama `updateTransaction`
 *
 * Defaults sensatos al crear (SPEC §5.1 "mantenimiento cero"):
 *  - Tipo: 'buy'
 *  - Cartera: 'largo' (la default según SPEC)
 *  - Fecha: hoy
 *  - Precio: si hay precio en cache para el activo seleccionado, lo pre-llena
 *
 * Compartido entre Chat (Form tab) y EditTxDialog para no duplicar lógica.
 */

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { fmt } from '@/lib/format';
import { useAccounts, useAssets } from '@/lib/db/queries';
import { usePriceMap, useFx } from '@/lib/db/derived';
import { createTransaction, updateTransaction } from '@/lib/db/mutations';
import type { Currency, PortfolioBucket, Transaction, TxKind } from '@/lib/types';

// ─── Constantes ────────────────────────────────────────────────────────────

const KIND_OPTIONS: SelectOption[] = [
  { value: 'buy', label: 'Compra' },
  { value: 'sell', label: 'Venta' },
  { value: 'yield', label: 'Yield (staking/dividendo)' },
  { value: 'transfer_in', label: 'Transferencia entrante' },
  { value: 'transfer_out', label: 'Transferencia saliente' },
  { value: 'fee', label: 'Comisión' },
  { value: 'fx', label: 'Conversión FX' },
  { value: 'adjustment', label: 'Ajuste manual' },
];

const BUCKET_OPTIONS: SelectOption[] = [
  { value: 'largo', label: 'Largo plazo' },
  { value: 'medio', label: 'Mediano' },
  { value: 'corto', label: 'Corto plazo' },
  { value: 'trade', label: 'Trade' },
];

const CURRENCY_OPTIONS: SelectOption[] = [
  { value: 'ARS', label: 'ARS' },
  { value: 'USD', label: 'USD' },
  { value: 'USDT', label: 'USDT' },
  { value: 'EUR', label: 'EUR' },
  { value: 'BTC', label: 'BTC' },
];

const schema = z.object({
  kind: z.enum([
    'buy',
    'sell',
    'yield',
    'transfer_in',
    'transfer_out',
    'fee',
    'fx',
    'adjustment',
  ]),
  bucket: z.enum(['corto', 'medio', 'largo', 'trade']),
  assetId: z.string().min(1, 'Elegí un activo'),
  accountId: z.string().min(1, 'Elegí una cuenta'),
  qty: z.coerce.number().positive('Debe ser mayor a 0'),
  unitPrice: z.coerce.number().min(0, 'No puede ser negativo'),
  priceCurrency: z.enum(['ARS', 'USD', 'USDT', 'EUR', 'BTC']),
  date: z.string().min(1, 'Elegí una fecha'),
  notes: z.string().max(200).optional(),
});

type FormValues = z.infer<typeof schema>;

// ─── Defaults helper ───────────────────────────────────────────────────────

export interface TxFormInitialValues {
  kind?: TxKind;
  bucket?: PortfolioBucket;
  assetId?: string;
  accountId?: string;
  qty?: number;
  unitPrice?: number;
  priceCurrency?: Currency;
  date?: string;
  notes?: string;
}

export type TxFormMode =
  | { kind: 'create'; initial?: TxFormInitialValues }
  | { kind: 'edit'; txId: string; initial: TxFormInitialValues };

interface TxFormProps {
  mode: TxFormMode;
  /** Llamado tras persistir OK. Default: cerrar modal o limpiar form. */
  onSuccess?: (tx: Transaction | { id: string }) => void;
  /** Botón secundario (cancelar / cerrar modal). Si no se provee, se omite. */
  onCancel?: () => void;
  /** Override del label del CTA primario. Default: "Crear" / "Guardar cambios". */
  submitLabel?: string;
}

/** Convierte un precio entre monedas usando el CCL. */
function convertPrice(price: number, from: Currency, to: Currency, ccl: number): number {
  if (from === to || price <= 0) return price;
  // Normalizar a USD primero
  let usd: number;
  if (from === 'USD' || from === 'USDT') usd = price;
  else if (from === 'ARS') usd = price / ccl;
  else return price; // EUR, BTC: no convertimos por ahora
  // Convertir de USD al destino
  if (to === 'USD' || to === 'USDT') return usd;
  if (to === 'ARS') return usd * ccl;
  return price;
}

/**
 * Precio del CDR en la moneda objetivo.
 *
 * Para CEDEARs/ETFs con ratio: usa `underlyingUSD` del priceCache más el
 * CCL y el ratio para obtener el precio real del CDR (no del subyacente).
 *   CDR_ARS = underlying_USD × CCL / ratio
 *   CDR_USD = underlying_USD / ratio
 *
 * Si no hay underlyingUSD disponible, cae a una conversión simple de moneda.
 */
function getCDRPrice(
  priceEntry: { price: number; currency: string; underlyingUSD?: number },
  asset: import('@/lib/types').Asset,
  targetCurrency: Currency,
  ccl: number,
): number {
  if (asset.cedearRatio && priceEntry.underlyingUSD) {
    // Fórmula canónica: precio del CDR desde el subyacente.
    if (targetCurrency === 'ARS') {
      return (priceEntry.underlyingUSD * ccl) / asset.cedearRatio;
    }
    if (targetCurrency === 'USD' || targetCurrency === 'USDT') {
      return priceEntry.underlyingUSD / asset.cedearRatio;
    }
  }
  // Sin ratio o sin underlyingUSD: conversión simple de moneda.
  const cacheCurrency = priceEntry.currency as Currency;
  if (cacheCurrency === targetCurrency) return priceEntry.price;
  return convertPrice(priceEntry.price, cacheCurrency, targetCurrency, ccl);
}

export function TxForm({ mode, onSuccess, onCancel, submitLabel }: TxFormProps) {
  const accounts = useAccounts();
  const assets = useAssets();
  const prices = usePriceMap();
  const fx = useFx();
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Ref para saber la moneda anterior y poder convertir al cambiarla.
  // Se inicializa con la moneda default del form para que el primer cambio funcione.
  const prevCurrencyRef = useRef<Currency>(mode.initial?.priceCurrency ?? 'USD');
  // Flag: true cuando el auto-fill cambia la moneda junto al precio
  // (en ese caso no hay que convertir nada — el precio ya está en la moneda correcta).
  const autoFillingRef = useRef(false);

  const today = new Date().toISOString().slice(0, 10);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: mode.initial?.kind ?? 'buy',
      bucket: mode.initial?.bucket ?? 'largo',
      assetId: mode.initial?.assetId ?? '',
      accountId: mode.initial?.accountId ?? '',
      qty: mode.initial?.qty ?? 0,
      unitPrice: mode.initial?.unitPrice ?? 0,
      priceCurrency: mode.initial?.priceCurrency ?? 'USD',
      date: mode.initial?.date ?? today,
      notes: mode.initial?.notes ?? '',
    },
  });

  const watchedQty = useWatch({ control, name: 'qty' }) ?? 0;
  const watchedPrice = useWatch({ control, name: 'unitPrice' }) ?? 0;
  const watchedCurrency = useWatch({ control, name: 'priceCurrency' }) ?? 'USD';
  const watchedAssetId = useWatch({ control, name: 'assetId' });
  const total = Number(watchedQty) * Number(watchedPrice);

  // Auto-fill: cuando el usuario elige un activo:
  //  1. Siempre actualiza la moneda a la nativa del activo (ARS para CEDEARs, USD para crypto).
  //  2. Si el precio está vacío y hay caché, lo pre-llena convirtiendo si el caché
  //     tiene una moneda diferente a la del activo (ej. caché stale en USD para un CEDEAR).
  //  3. Si ya había un precio en otra moneda (del activo anterior), lo convierte.
  useEffect(() => {
    if (mode.kind !== 'create' || !watchedAssetId || !assets || !prices) return;
    const asset = assets.find((a) => a.id === watchedAssetId);
    if (!asset) return;

    const targetCurrency = asset.currency as Currency;
    const priceEntry = prices.get(asset.id);
    const currentPrice = Number(getValues('unitPrice') ?? 0);
    const currentCurrency = getValues('priceCurrency') as Currency;

    // Marcar como auto-fill para que el effect de conversión no actúe en paralelo.
    autoFillingRef.current = true;
    prevCurrencyRef.current = targetCurrency;
    setValue('priceCurrency', targetCurrency);

    if (currentPrice === 0 && priceEntry) {
      // Precio vacío: pre-llenar desde caché usando la fórmula correcta para CEDEARs.
      // getCDRPrice aplica el ratio si corresponde, evitando mostrar el precio del subyacente.
      const cdpPrice = getCDRPrice(priceEntry, asset, targetCurrency, fx.ccl);
      const rounded = targetCurrency === 'ARS' ? Math.round(cdpPrice) : Number(cdpPrice.toFixed(2));
      setValue('unitPrice', rounded, { shouldValidate: true });
    } else if (currentPrice > 0 && currentCurrency !== targetCurrency) {
      // Ya había un precio de otro activo: convertirlo con CCL simple (es precio por CDR, no subyacente).
      const converted = convertPrice(currentPrice, currentCurrency, targetCurrency, fx.ccl);
      const rounded = targetCurrency === 'ARS' ? Math.round(converted) : Number(converted.toFixed(2));
      setValue('unitPrice', rounded, { shouldValidate: true });
    }
  }, [watchedAssetId, assets, prices, mode.kind, setValue, getValues, fx.ccl]);

  // Conversión automática de precio al cambiar la moneda manualmente.
  useEffect(() => {
    const current = watchedCurrency as Currency;

    // Si el auto-fill acaba de cambiar la moneda, no convertimos.
    if (autoFillingRef.current) {
      autoFillingRef.current = false;
      prevCurrencyRef.current = current;
      return;
    }

    const prev = prevCurrencyRef.current;
    prevCurrencyRef.current = current;

    if (prev === current) return;

    const price = Number(watchedPrice);
    if (price <= 0) return;

    const converted = convertPrice(price, prev, current, fx.ccl);
    // Redondear según moneda destino: ARS sin decimales, USD/USDT 2 decimales
    const rounded = current === 'ARS'
      ? Math.round(converted)
      : Number(converted.toFixed(2));
    setValue('unitPrice', rounded, { shouldValidate: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCurrency]);

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      if (mode.kind === 'create') {
        // Reconstruir ISO date — el input solo da YYYY-MM-DD, asumimos hora 12:00 local.
        const dateISO = `${values.date}T12:00:00.000Z`;
        const tx = await createTransaction({
          kind: values.kind,
          bucket: values.bucket,
          assetId: values.assetId,
          accountId: values.accountId,
          qty: values.qty,
          unitPrice: values.unitPrice,
          priceCurrency: values.priceCurrency,
          date: dateISO,
          notes: values.notes || undefined,
          source: 'form',
        });
        reset({ ...values, qty: 0, unitPrice: 0, notes: '' }); // dejar contexto, limpiar campos numéricos
        onSuccess?.(tx);
      } else {
        await updateTransaction(mode.txId, {
          kind: values.kind,
          bucket: values.bucket,
          assetId: values.assetId,
          accountId: values.accountId,
          qty: values.qty,
          unitPrice: values.unitPrice,
          priceCurrency: values.priceCurrency,
          date: values.date,
          notes: values.notes || undefined,
        });
        onSuccess?.({ id: mode.txId });
      }
    } catch (err) {
      console.error('TxForm submit failed', err);
      setSubmitError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  const assetOptions: SelectOption[] = [
    { value: '', label: '— Elegir activo —' },
    ...(assets ?? []).map((a) => ({
      value: a.id,
      label: `${a.ticker} — ${a.name}`,
    })),
  ];
  const accountOptions: SelectOption[] = [
    { value: '', label: '— Elegir cuenta —' },
    ...(accounts ?? []).map((a) => ({
      value: a.id,
      label: `${a.name} (${a.tag})`,
    })),
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <FieldGroup label="Tipo" error={errors.kind?.message}>
          <Select options={KIND_OPTIONS} {...register('kind')} />
        </FieldGroup>
        <FieldGroup label="Cartera" error={errors.bucket?.message}>
          <Select options={BUCKET_OPTIONS} {...register('bucket')} />
        </FieldGroup>
      </div>

      <FieldGroup label="Activo" error={errors.assetId?.message}>
        <Select options={assetOptions} {...register('assetId')} />
      </FieldGroup>
      <FieldGroup label="Cuenta" error={errors.accountId?.message}>
        <Select options={accountOptions} {...register('accountId')} />
      </FieldGroup>

      <div className="grid grid-cols-3 gap-2">
        <FieldGroup label="Cantidad" error={errors.qty?.message}>
          <Input type="number" step="any" inputMode="decimal" {...register('qty')} />
        </FieldGroup>
        <FieldGroup label="Precio unit." error={errors.unitPrice?.message}>
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            {...register('unitPrice')}
          />
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
          disabled={isSubmitting || (mode.kind === 'edit' && !isDirty)}
          leftIcon="check"
        >
          {isSubmitting
            ? 'Guardando…'
            : (submitLabel ?? (mode.kind === 'create' ? 'Crear operación' : 'Guardar cambios'))}
        </Button>
      </div>
    </form>
  );
}

// ─── Helpers locales ───────────────────────────────────────────────────────

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
