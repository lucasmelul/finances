/**
 * Botón base del sistema. Variantes según el design handoff:
 * - primary  → CTA principal (acento sólido)
 * - soft     → CTA secundaria (acento translúcido)
 * - ghost    → outline sobre fondo
 * - surface  → relleno bg-surface (para FAB / card actions)
 * - danger   → acción destructiva (rojo translúcido)
 *
 * Las áreas tappables son ≥ 40px en md y ≥ 48px en lg para cumplir el
 * mínimo de 44px del DESIGN_BRIEF §11 con margen.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'soft' | 'ghost' | 'surface' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Si se pasa, se renderiza un icono (lucide-style) a la izquierda. */
  leftIcon?: IconName;
  rightIcon?: IconName;
  /** Ocupa el ancho completo del contenedor. */
  full?: boolean;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-[15px]',
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white border-transparent hover:bg-accent/90 active:bg-accent/85',
  soft:
    'bg-accent/[0.14] text-accent border-transparent hover:bg-accent/20',
  ghost:
    'bg-transparent text-text-primary border-border-subtle hover:bg-bg-elevated hover:border-border-hover',
  surface:
    'bg-bg-surface text-text-primary border-border-subtle hover:border-border-hover',
  danger:
    'bg-negative/[0.12] text-negative border-transparent hover:bg-negative/20',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    leftIcon,
    rightIcon,
    full = false,
    className,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[10px] border font-semibold transition-colors',
        'disabled:cursor-default disabled:opacity-50',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        full && 'w-full',
        className,
      )}
      {...props}
    >
      {leftIcon && <Icon name={leftIcon} size={ICON_SIZE[size]} />}
      {children}
      {rightIcon && <Icon name={rightIcon} size={ICON_SIZE[size]} />}
    </button>
  );
});
