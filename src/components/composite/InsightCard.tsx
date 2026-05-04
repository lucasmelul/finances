/**
 * Card compacta de un insight para mostrar en el bloque "Qué hacer hoy" del
 * Home. Muestra título + descripción corta + CTA opcional.
 *
 * El color se deriva del `severity`:
 *  - high   → negative (rojo)
 *  - medium → warning (ámbar)
 *  - low    → info (azul)
 *
 * Por `type` se elige el icono de la izquierda. Mantenemos la card flat
 * (sin sombras) para no competir visualmente con los KPIs grandes.
 */

import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useUIStore } from '@/lib/store';
import type { Insight, InsightType, InsightSeverity } from '@/lib/insights';

const TYPE_ICON: Record<InsightType, IconName> = {
  risk: 'flame',
  opportunity: 'trend-up',
  efficiency: 'zap',
  performance: 'chart',
  staking: 'spark',
  data_quality: 'edit',
};

const SEVERITY_CLASSES: Record<
  InsightSeverity,
  { border: string; bg: string; iconClass: string }
> = {
  high: {
    border: 'border-negative/40',
    bg: 'bg-negative/[0.08]',
    iconClass: 'text-negative bg-negative/[0.14]',
  },
  medium: {
    border: 'border-warning/40',
    bg: 'bg-warning/[0.08]',
    iconClass: 'text-warning bg-warning/[0.14]',
  },
  low: {
    border: 'border-info/30',
    bg: 'bg-info/[0.06]',
    iconClass: 'text-info bg-info/[0.12]',
  },
};

interface InsightCardProps {
  insight: Insight;
  /** Si false, no muestra la X de descartar (para vistas read-only). */
  dismissible?: boolean;
  className?: string;
}

export function InsightCard({ insight, dismissible = true, className }: InsightCardProps) {
  const navigate = useNavigate();
  const dismiss = useUIStore((s) => s.dismissInsight);
  const cls = SEVERITY_CLASSES[insight.severity];

  const handleClick = () => {
    if (insight.actionTarget) navigate(insight.actionTarget);
  };

  const isClickable = !!insight.actionTarget;

  return (
    <div
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        'flex items-start gap-3 rounded-2xl border p-3.5 transition-colors',
        cls.border,
        cls.bg,
        isClickable && 'cursor-pointer hover:opacity-90',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          cls.iconClass,
        )}
        aria-hidden="true"
      >
        <Icon name={TYPE_ICON[insight.type]} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold tracking-tight text-text-primary">
          {insight.title}
        </div>
        <div className="mt-0.5 text-[12px] leading-snug text-text-secondary">
          {insight.description}
        </div>
        {insight.actionLabel && (
          <div className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-accent">
            {insight.actionLabel}
            <Icon name="arrow-right" size={11} />
          </div>
        )}
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dismiss(insight.id);
          }}
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary"
          aria-label="Descartar"
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}
