/**
 * Modal "Editar regla de staking".
 *
 * Permite cambiar APY, frecuencia y asset de recompensa de una regla
 * existente. Los campos inmutables (activo, cuenta, cartera) no se
 * muestran como editables para no confundir el motor de accrual.
 */

import { useId, useMemo, useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useAssets } from '@/lib/db/queries';
import { updateStakingRule } from '@/lib/db/mutations';
import type { StakingRule } from '@/lib/types';

const FREQ_OPTIONS: SelectOption[] = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'yearly', label: 'Anual' },
];

const schema = z.object({
  apyPct: z.coerce.number().min(0.01, 'APY > 0').max(1000, 'APY < 1000'),
  payoutFrequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  rewardAssetId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface EditarReglaStakingDialogProps {
  rule: StakingRule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditarReglaStakingDialog({
  rule,
  open,
  onOpenChange,
}: EditarReglaStakingDialogProps) {
  const assets = useAssets();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const apyId = useId();
  const freqId = useId();
  const rewardId = useId();

  const rewardAssetOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: '— Mismo activo —' },
      ...(assets ?? []).map((a) => ({ value: a.id, label: `${a.ticker} — ${a.name}` })),
    ],
    [assets],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      apyPct: rule.apyPct,
      payoutFrequency: rule.payoutFrequency,
      rewardAssetId: rule.rewardAssetId ?? '',
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      await updateStakingRule(rule.id, {
        apyPct: values.apyPct,
        payoutFrequency: values.payoutFrequency,
        rewardAssetId: values.rewardAssetId || null,
      });
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al guardar');
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
        title="Editar regla de staking"
        description="Modificá el APY, la frecuencia o el activo de recompensa."
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor={apyId}
                className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary"
              >
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
              <label
                htmlFor={freqId}
                className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary"
              >
                Frecuencia
              </label>
              <Select id={freqId} options={FREQ_OPTIONS} {...register('payoutFrequency')} />
            </div>
          </div>

          <div>
            <label
              htmlFor={rewardId}
              className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary"
            >
              Recompensa en{' '}
              <span className="normal-case text-text-muted">(opcional)</span>
            </label>
            <Select
              id={rewardId}
              options={rewardAssetOptions}
              {...register('rewardAssetId')}
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
              {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
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
