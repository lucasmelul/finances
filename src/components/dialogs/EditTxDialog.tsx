/**
 * Modal de edición de una tx existente. Wrapper sobre `<TxForm mode='edit'>`.
 *
 * El form en sí vive en `TxForm` y se comparte con el tab Form del Chat,
 * para que crear y editar usen exactamente los mismos campos y validaciones.
 */

import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { TxForm } from '@/components/forms/TxForm';
import type { PortfolioBucket, Transaction } from '@/lib/types';

interface EditTxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tx: Transaction | null;
}

export function EditTxDialog({ open, onOpenChange, tx }: EditTxDialogProps) {
  if (!tx) return null;
  const isSeedTx = tx.id.startsWith('seed-tx-');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Editar operación"
        description={
          isSeedTx
            ? '⚠️ Esta es una posición inicial del seed. Editarla recalcula el holding.'
            : 'Cambios afectan los totales y el PnL del activo.'
        }
        className="max-w-lg"
      >
        <TxForm
          mode={{
            kind: 'edit',
            txId: tx.id,
            initial: {
              kind: tx.kind,
              bucket: bucketFromPortfolioId(tx.portfolioId),
              assetId: tx.assetId,
              accountId: tx.accountId,
              qty: tx.qty,
              unitPrice: tx.unitPrice,
              priceCurrency: tx.priceCurrency,
              date: tx.date.slice(0, 10),
              notes: tx.notes,
            },
          }}
          onSuccess={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function bucketFromPortfolioId(portfolioId: string): PortfolioBucket {
  const m = portfolioId.match(/^pf-(corto|medio|largo|trade)$/);
  if (m) return m[1] as PortfolioBucket;
  return 'largo';
}
