/**
 * /insights — todos los insights generados por el motor, sin límite de 3.
 * Agrupa por severidad: high → medium → low.
 * Usa el mismo InsightCard del Home (con X de descarte).
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInsights } from '@/lib/db/derived';
import { useUIStore } from '@/lib/store';
import { InsightCard } from '@/components/composite/InsightCard';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { InsightSeverity } from '@/lib/insights';

const SEVERITY_ORDER: InsightSeverity[] = ['high', 'medium', 'low'];

const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  high: 'Importantes',
  medium: 'Oportunidades',
  low: 'Info',
};

export function Insights() {
  const navigate = useNavigate();
  const insights = useInsights();
  const dismissed = useUIStore((s) => s.dismissedInsightIds);

  const visible = useMemo(
    () => (insights ?? []).filter((i) => !dismissed.includes(i.id)),
    [insights, dismissed],
  );

  const grouped = useMemo(() => {
    const map = new Map<InsightSeverity, typeof visible>();
    for (const sev of SEVERITY_ORDER) {
      const group = visible.filter((i) => i.severity === sev);
      if (group.length > 0) map.set(sev, group);
    }
    return map;
  }, [visible]);

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
          aria-label="Volver"
        >
          <Icon name="arrow-right" size={16} className="rotate-180" />
        </button>
        <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">
          Alertas e insights
        </h1>
      </div>

      {visible.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border-subtle bg-bg-surface px-4 py-10 text-center">
          <Icon name="check" size={32} color="hsl(var(--positive))" />
          <p className="text-sm font-medium text-text-primary">Todo en orden</p>
          <p className="text-[12px] text-text-muted">
            No hay alertas activas. Seguí así.
          </p>
          <Button
            variant="soft"
            size="sm"
            onClick={() => navigate('/')}
            className="mt-2"
          >
            Volver al inicio
          </Button>
        </div>
      )}

      {Array.from(grouped.entries()).map(([sev, items]) => (
        <section key={sev} className="flex flex-col gap-2">
          <div className="px-0.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            {SEVERITY_LABEL[sev]}
          </div>
          {items.map((insight) => (
            <InsightCard key={insight.id} insight={insight} dismissible />
          ))}
        </section>
      ))}
    </div>
  );
}
