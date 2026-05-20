/**
 * Modal para editar los metadatos editables de un activo.
 *
 * Campos editables: nombre, ratio CEDEAR, ticker subyacente, coingeckoId, ISIN.
 * Inmutables: ticker, tipo, moneda (forman el índice único [type+ticker]).
 */

import { useId, useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { updateAsset } from '@/lib/db/mutations';
import type { Asset } from '@/lib/types';

const schema = z.object({
  name: z.string().min(1, 'Requerido'),
  cedearRatio: z.coerce.number().positive().optional().or(z.literal('')),
  underlyingTicker: z.string().optional(),
  coingeckoId: z.string().optional(),
  isin: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface EditarActivoDialogProps {
  asset: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditarActivoDialog({ asset, open, onOpenChange }: EditarActivoDialogProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const nameId = useId();
  const ratioId = useId();
  const underlyingId = useId();
  const cgId = useId();
  const isinId = useId();

  const isCedear = asset.type === 'cedear' || asset.type === 'etf';
  const isCrypto = asset.type === 'crypto';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: asset.name,
      cedearRatio: asset.cedearRatio ?? '',
      underlyingTicker: asset.underlyingTicker ?? '',
      coingeckoId: asset.coingeckoId ?? '',
      isin: asset.isin ?? '',
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      await updateAsset(asset.id, {
        name: values.name,
        cedearRatio: values.cedearRatio ? Number(values.cedearRatio) : undefined,
        underlyingTicker: values.underlyingTicker || undefined,
        coingeckoId: values.coingeckoId || undefined,
        isin: values.isin || undefined,
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
        if (!o) { reset(); setSubmitError(null); }
        onOpenChange(o);
      }}
    >
      <DialogContent
        title={`Editar ${asset.ticker}`}
        description={`${asset.type.toUpperCase()} · Ticker y tipo son inmutables.`}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {/* Campos inmutables — solo lectura */}
          <div className="flex gap-2 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-[11px]">
            <span className="text-text-muted">Ticker:</span>
            <span className="font-semibold text-text-primary">{asset.ticker}</span>
            <span className="ml-3 text-text-muted">Tipo:</span>
            <span className="font-semibold text-text-primary capitalize">{asset.type}</span>
            <span className="ml-3 text-text-muted">Moneda:</span>
            <span className="font-semibold text-text-primary">{asset.currency}</span>
          </div>

          <Field label="Nombre" error={errors.name?.message}>
            <Input id={nameId} {...register('name')} />
          </Field>

          {isCedear && (
            <>
              <Field
                label="Ratio CEDEAR"
                hint="Cuántos CDRs = 1 acción subyacente. Ej: IBIT → 9"
                error={errors.cedearRatio?.message}
              >
                <Input
                  id={ratioId}
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="ej. 9"
                  {...register('cedearRatio')}
                />
              </Field>
              <Field label="Ticker subyacente (NYSE/NASDAQ)">
                <Input
                  id={underlyingId}
                  placeholder="ej. IBIT"
                  {...register('underlyingTicker')}
                />
              </Field>
              <Field label="ISIN (opcional)">
                <Input id={isinId} placeholder="US46138G7060" {...register('isin')} />
              </Field>
            </>
          )}

          {isCrypto && (
            <Field
              label="CoinGecko ID"
              hint="Para obtener precio en tiempo real. Ej: bitcoin, ethereum"
            >
              <Input
                id={cgId}
                placeholder="ej. bitcoin"
                {...register('coingeckoId')}
              />
            </Field>
          )}

          {submitError && (
            <div className="rounded-md bg-negative/[0.12] px-3 py-2 text-[12px] text-negative">
              {submitError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="ghost" size="md" full onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="md" full disabled={isSubmitting} leftIcon="check">
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </label>
      {hint && <p className="mb-1 text-[10px] text-text-muted">{hint}</p>}
      {children}
      {error && <p className="mt-1 text-[11px] text-negative">{error}</p>}
    </div>
  );
}
