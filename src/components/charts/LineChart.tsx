/**
 * Gráfico de línea para la pantalla de Asset. Soporta bandas S/R opcionales
 * (líneas punteadas roja/verde con etiquetas R/S al borde derecho).
 *
 * Se mantiene en SVG inline por la misma razón que Sparkline, pero escala
 * mejor al ser determinístico (sin ResizeObserver, sin tooltips).
 */

interface LineChartProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  /** Soporte (línea verde, "S"). En moneda nativa del activo. */
  srLow?: number | null;
  /** Resistencia (línea roja, "R"). */
  srHigh?: number | null;
  className?: string;
}

export function LineChart({
  data,
  color,
  width = 340,
  height = 140,
  srLow = null,
  srHigh = null,
  className,
}: LineChartProps) {
  if (!data || data.length === 0) return null;

  const padTop = 12;
  const padBot = 8;

  // Si hay bandas S/R, ampliar el dominio para que ambas siempre se vean
  // dentro del cuadro (si el precio sale del rango, no se "pierde" la línea).
  let min = Math.min(...data);
  let max = Math.max(...data);
  if (srLow != null) min = Math.min(min, srLow);
  if (srHigh != null) max = Math.max(max, srHigh);
  const range = max - min || 1;
  const innerH = height - padTop - padBot;
  const stepX = width / (data.length - 1);
  const yFor = (v: number) => padTop + innerH - ((v - min) / range) * innerH;

  const points = data.map<[number, number]>((v, i) => [i * stepX, yFor(v)]);
  const path = points
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(' ');
  const area = `${path} L${width},${height} L0,${height} Z`;

  // ID determinístico: dos charts con mismo color comparten gradient sin colisión.
  const gradId = `lc-grad-${color.replace(/[^a-z0-9]/gi, '')}`;
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      className={className}
      aria-hidden="true"
    >
      {srHigh != null && (
        <g>
          <line
            x1={0}
            x2={width}
            y1={yFor(srHigh)}
            y2={yFor(srHigh)}
            stroke="#EF4444"
            strokeOpacity="0.4"
            strokeDasharray="3 3"
            strokeWidth="1"
          />
          <text
            x={width - 4}
            y={yFor(srHigh) - 4}
            fontSize="9"
            fill="#EF4444"
            textAnchor="end"
            fontFamily="ui-monospace, monospace"
          >
            R
          </text>
        </g>
      )}
      {srLow != null && (
        <g>
          <line
            x1={0}
            x2={width}
            y1={yFor(srLow)}
            y2={yFor(srLow)}
            stroke="#10B981"
            strokeOpacity="0.4"
            strokeDasharray="3 3"
            strokeWidth="1"
          />
          <text
            x={width - 4}
            y={yFor(srLow) - 4}
            fontSize="9"
            fill="#10B981"
            textAnchor="end"
            fontFamily="ui-monospace, monospace"
          >
            S
          </text>
        </g>
      )}
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={path}
        stroke={color}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Punto final + halo — ancla la mirada en el precio actual. */}
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
      <circle cx={last[0]} cy={last[1]} r="6" fill={color} fillOpacity="0.2" />
    </svg>
  );
}
