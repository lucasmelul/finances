/**
 * Botón de navegación inferior (mobile) / sidebar (desktop).
 *
 * Variantes:
 * - `mobile` → ícono arriba + label abajo, área tappable de 44px (DESIGN_BRIEF §11)
 * - `sidebar` → fila horizontal con ícono + label
 *
 * El estado activo lo maneja el caller (suele venir del pathname). Acá solo
 * pintamos.
 */

import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/ui/Icon';

interface NavItemProps {
  icon: IconName;
  label: string;
  active?: boolean;
  variant?: 'mobile' | 'sidebar';
  onClick?: () => void;
  className?: string;
}

export function NavItem({
  icon,
  label,
  active = false,
  variant = 'mobile',
  onClick,
  className,
}: NavItemProps) {
  if (variant === 'sidebar') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex h-[38px] items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-semibold transition-colors',
          active
            ? 'bg-accent/[0.14] text-accent'
            : 'text-text-secondary hover:bg-bg-elevated/50 hover:text-text-primary',
          className,
        )}
      >
        <Icon name={icon} size={16} />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-11 flex-1 flex-col items-center justify-center gap-0.5 transition-colors',
        active ? 'text-accent' : 'text-text-muted hover:text-text-secondary',
        className,
      )}
    >
      <Icon name={icon} size={20} />
      <span className="text-[9px] font-semibold tracking-wide">{label}</span>
    </button>
  );
}
