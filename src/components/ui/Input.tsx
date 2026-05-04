/**
 * Input de form. Mantiene el styling consistente con los inputs del chat
 * (h-11, rounded-xl, focus accent).
 */

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border bg-bg-base px-3 text-sm text-text-primary',
        'placeholder:text-text-muted focus:outline-none',
        invalid
          ? 'border-negative focus:border-negative'
          : 'border-border-subtle focus:border-accent',
        className,
      )}
      {...props}
    />
  );
});
