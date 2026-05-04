/**
 * Select de form. Wrapper sobre `<select>` nativo (mejor experiencia mobile —
 * abre el picker del SO; menos código que un combobox custom).
 *
 * Si en el futuro necesitamos search/multi-select, migramos a Radix Select
 * sin cambiar el contrato (`{ value, onChange, options }`).
 */

import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: readonly SelectOption[];
  placeholder?: string;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, invalid, className, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border bg-bg-base px-3 text-sm text-text-primary',
        'focus:outline-none',
        invalid
          ? 'border-negative focus:border-negative'
          : 'border-border-subtle focus:border-accent',
        className,
      )}
      {...props}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
});
