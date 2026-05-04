/**
 * Dialog modal — wrapper sobre Radix UI con el styling del sistema.
 *
 * Por qué Radix y no construir un modal a mano:
 *  - A11y completo (focus trap, escape, role="dialog", aria-labelledby).
 *  - Portal automático — evita problemas de z-index/overflow del padre.
 *  - API minimal: <Dialog open onOpenChange><DialogContent>...</DialogContent></Dialog>
 *
 * El backdrop usa `bg-bg-base/80 backdrop-blur` para que el fondo se sienta
 * profundo (mismo patrón que el bottom-nav del mobile chrome).
 */

import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </RadixDialog.Root>
  );
}

interface DialogContentProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function DialogContent({ title, description, children, className }: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay
        className="fixed inset-0 z-50 bg-bg-base/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      />
      <RadixDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-2xl border border-border-subtle bg-bg-surface p-5 shadow-2xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          className,
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <RadixDialog.Title className="text-base font-semibold tracking-tight text-text-primary">
              {title}
            </RadixDialog.Title>
            {description && (
              <RadixDialog.Description className="mt-1 text-[13px] text-text-secondary">
                {description}
              </RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close
            className="rounded-md p-1 text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
            aria-label="Cerrar"
          >
            <Icon name="x" size={18} />
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
