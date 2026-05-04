/**
 * Donut chart con leyenda central opcional. Usado para distribución por
 * bucket / cuenta / activo en la pantalla Inicio.
 */

export interface DonutSlice {
  label: string;
  value: number;
  /** Color del trozo (Tailwind no se puede usar acá porque va a un atributo SVG). */
  color: string;
}

interface DonutProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  /** Texto grande al centro (suele ser el total formateado). */
  label?: string;
  /** Texto pequeño arriba del label. */
  sublabel?: string;
  className?: string;
}

export function Donut({
  slices,
  size = 180,
  thickness = 22,
  label,
  sublabel,
  className,
}: DonutProps) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = size / 2 - thickness / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;

  return (
    <svg width={size} height={size} className={className} aria-hidden="true">
      {/* Track de fondo. Usa border-subtle del tema vía CSS var. */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="hsl(var(--border-subtle))"
        strokeWidth={thickness}
        strokeOpacity="0.5"
      />
      {slices.map((s, i) => {
        const len = (s.value / total) * C;
        const off = -((acc / total) * C) + C / 4;
        acc += s.value;
        return (
          <circle
            key={`${s.label}-${i}`}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={off}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'all .4s' }}
          />
        );
      })}
      {label != null && (
        <g>
          {sublabel && (
            <text
              x={cx}
              y={cy - 4}
              fontSize="11"
              fill="hsl(var(--text-secondary))"
              textAnchor="middle"
              fontFamily="Inter, sans-serif"
              letterSpacing="0.5"
            >
              {sublabel}
            </text>
          )}
          <text
            x={cx}
            y={sublabel ? cy + 16 : cy + 6}
            fontSize="20"
            fontWeight="600"
            fill="hsl(var(--text-primary))"
            textAnchor="middle"
            fontFamily="Inter, sans-serif"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {label}
          </text>
        </g>
      )}
    </svg>
  );
}
