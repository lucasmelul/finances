/**
 * Modal "Nueva regla de staking".
 *
 * Inputs: asset, account, bucket, APY, frecuencia. La fecha de inicio
 * default es ahora — se puede cambiar pero el usuario raramente necesita
 * editarla.
 *
 * Validaciones:
 *  - APY entre 0.01 y 1000
 *  - asset y account requeridos
 *  - mutation chequea conflicto de regla activa por scope
 */

import { useId, useMemo, useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useAccounts, useAssets } from '@/lib/db/queries';
import { createStakingRule } from '@/lib/db/mutations';
import type { PortfolioBucket } from '@/lib/types';

const FREQ_OPTIONS: SelectOption[] = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
];

const BUCKET_OPTIONS: ReadonlyArray<{ value: PortfolioBucket; label: string }> = [
  { value: 'corto', label: 'Corto plazo' },
  { value: 'medio', label: 'Mediano' },
  { value: 'largo', label: 'Largo plazo' },
  { value: 'trade', label: 'Trade' },
];

const schema = z.object({
  assetId: z.string().min(1, 'Elegí un activo'),
  rewardAssetId: z.string().optional(),
  accountId: z.string().min(1, 'Elegí una cuenta'),
  bucket: z.enum(['corto', 'medio', 'largo', 'trade']),
  apyPct: z.coerce.number().min(0.01, 'APY > 0').max(1000, 'APY < 1000'),
  payoutFrequency: z.enum(['daily', 'weekly', 'monthly']),
});

type FormValues = z.infer<typeof schema>;

interface NuevaReglaStakingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NuevaReglaStakingDialog({ open, onOpenChange }: NuevaReglaStakingDialogProps) {
  const accounts = useAccounts();
  const assets = useAssets();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const apyId = useId();
  const assetId = useId();
  const rewardAssetIdInput = useId();
  const accountId = useId();
  const bucketId = useId();
  const freqId = useId();

  const assetOptions = useMemo<SelectOption[]>(
    () =>
      (assets ?? [])
        .filter((a) => a.type === 'crypto' || a.type === 'fondo' || a.type === 'bono')
        .map((a) => ({ value: a.id, label: `${a.ticker} — ${a.name}` })),
    [assets],
  );
  const rewardAssetOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: '— Mismo activo —' },
      ...(assets ?? []).map((a) => ({ value: a.id, label: `${a.ticker} — ${a.name}` })),
    ],
    [assets],
  );
  const accountOptions = useMemo<SelectOption[]>(
    () =>
      (accounts ?? [])
        .filter((a) => a.kind === 'exchange' || a.kind === 'wallet')
        .map((a) => ({ value: a.id, label: `${a.name} (${a.tag})` })),
    [accounts],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      assetId: '',
      rewardAssetId: '',
      accountId: '',
      bucket: 'corto',
      apyPct: 5,
      payoutFrequency: 'daily',
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      await createStakingRule({
        assetId: values.assetId,
        rewardAssetId: values.rewardAssetId || undefined,
        accountId: values.accountId,
        bucket: values.bucket,
        apyPct: values.apyPct,
        payoutFrequency: values.payoutFrequency,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al crear regla');
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
        title="Nueva regla de staking"
        description="Asociá un activo en una cuenta a un APY esperado."
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
          <div>
            <label htmlFor={assetId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Activo
            </label>
            <Select
              id={assetId}
              options={assetOptions}
              placeholder="Elegir activo"
              invalid={!!errors.assetId}
              {...register('assetId')}
            />
            {errors.assetId && <FieldError msg={errors.assetId.message} />}
          </div>

          <div>
            <label htmlFor={rewardAssetIdInput} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Recompensa en <span className="normal-case text-text-muted">(opcional — si es distinta al activo)</span>
            </label>
            <Select
              id={rewardAssetIdInput}
              options={rewardAssetOptions}
              {...register('rewardAssetId')}
            />
          </div>

          <div>
            <label htmlFor={accountId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Cuenta
            </label>
            <Select
              id={accountId}
              options={accountOptions}
              placeholder="Elegir cuenta"
              invalid={!!errors.accountId}
              {...register('accountId')}
            />
            {errors.accountId && <FieldError msg={errors.accountId.message} />}
          </div>

          <div>
            <label htmlFor={bucketId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Cartera
            </label>
            <Select id={bucketId} options={BUCKET_OPTIONS} {...register('bucket')} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={apyId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                APY anual (%)
              </label>
              <Input
                id={apyId}
                type="number"
                step="0.01"
                inputMode="decimal"
                invalid={!!errors.apyPct}
                {...register('apyPct')}
              />
              {errors.apyPct && <FieldError msg={errors.apyPct.message} />}
            </div>
            <div>
              <label htmlFor={freqId} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                Frecuencia
              </label>
              <Select id={freqId} options={FREQ_OPTIONS} {...register('payoutFrequency')} />
            </div>
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
              {isSubmitting ? 'Guardando…' : 'Crear regla'}
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
