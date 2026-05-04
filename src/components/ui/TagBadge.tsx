/**
 * Badge fiscal A (declarado, info/azul) o B (privado, warning/ámbar).
 *
 * El tag refleja el estado fiscal de la cuenta. Es inmutable post-creación
 * (SPEC §3) — el UI solo lo muestra. Tipografía mono y letterspacing para
 * que el badge sea identificable de un vistazo en filas largas.
 */

import { cn } from '@/lib/utils';
import { TAG_LABEL, type AccountTag } from '@/lib/types';

interface TagBadgeProps {
  tag: AccountTag;
  /** Si está en true, muestra "A · DECLARADO" / "B · PRIVADO" en lugar de solo la letra. */
  full?: boolean;
  className?: string;
}

export function TagBadge({ tag, full = false, className }: TagBadgeProps) {
  const isA = tag === 'A';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded font-mono text-[10px] font-semibold leading-tight',
        'border px-[7px] py-[2px] tracking-wider',
        isA
          ? 'border-info/20 bg-info/[0.14] text-info'
          : 'border-warning/20 bg-warning/[0.14] text-warning',
        className,
      )}
    >
      {full ? TAG_LABEL[tag] : tag}
    </span>
  );
}
