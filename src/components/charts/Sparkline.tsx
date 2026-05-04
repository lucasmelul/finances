/**
 * Mini gráfico de línea + área para mostrar tendencia 24h en filas de activo.
 *
 * No usa Recharts adrede: el SVG inline es 30 líneas, no necesita interactividad,
 * y se renderiza cientos de veces en listas (lazy de Recharts sería overkill).
 */

interface SparklineProps {
  data: number[];
  /** Color del trazo (acepta cualquier valor CSS, suele ser un token semántico). */
  color: string;
  width?: number;
  height?: number;
  /** Si está activo, dibuja un área translúcida bajo la curva. */
  fill?: boolean;
  strokeWidth?: number;
  className?: string;
}

export function Sparkline({
  data,
  color,
  width = 80,
  height = 28,
  fill = true,
  strokeWidth = 1.5,
  className,
}: SparklineProps) {
  if (!data || data.length === 0) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map<[number, number]>((v, i) => [
    i * stepX,
    height - ((v - min) / range) * (height - 4) - 2,
  ]);
  const path = points
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(' ');
  const area = `${path} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      {fill && <path d={area} fill={color} fillOpacity={0.15} />}
      <path
        d={path}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
