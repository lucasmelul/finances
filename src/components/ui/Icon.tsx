/**
 * Set de iconos minimalistas (stroke). Portado del DESIGN_BRIEF.
 *
 * Decisión: SVGs inline en lugar de `lucide-react` para tener exactamente
 * los mismos paths que diseñó el equipo. Si hace falta agregar uno nuevo,
 * primero buscarlo en lucide; solo crear acá si el path difiere.
 */

import type { CSSProperties } from 'react';

export type IconName =
  | 'home'
  | 'wallet'
  | 'chart'
  | 'mic'
  | 'spark'
  | 'plus'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-right'
  | 'eye'
  | 'eye-off'
  | 'search'
  | 'menu'
  | 'check'
  | 'x'
  | 'edit'
  | 'send'
  | 'refresh'
  | 'filter'
  | 'trend-up'
  | 'target'
  | 'flame'
  | 'briefcase'
  | 'zap'
  | 'clock'
  | 'building'
  | 'coins'
  | 'bank'
  | 'safe'
  | 'sliders'
  | 'list'
  | 'pause';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 20, color = 'currentColor', className, style }: IconProps) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    style,
    'aria-hidden': true,
  };
  switch (name) {
    case 'home':
      return (
        <svg {...props}>
          <path d="M3 12l9-8 9 8M5 10v10h14V10" />
        </svg>
      );
    case 'wallet':
      return (
        <svg {...props}>
          <path d="M3 7h15a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 7v-.5A1.5 1.5 0 014.5 5H17" />
          <circle cx="17" cy="13" r="1.2" fill={color} stroke="none" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...props}>
          <path d="M4 19V5M4 19h16M8 16V11M12 16V8M16 16v-3" />
        </svg>
      );
    case 'mic':
      return (
        <svg {...props}>
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0014 0M12 18v3" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...props}>
          <path d="M12 2l1.6 5.5L19 9l-5.4 1.5L12 16l-1.6-5.5L5 9l5.4-1.5L12 2z" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'arrow-up':
      return (
        <svg {...props}>
          <path d="M7 17L17 7M17 7H9M17 7v8" />
        </svg>
      );
    case 'arrow-down':
      return (
        <svg {...props}>
          <path d="M17 7L7 17M7 17h8M7 17V9" />
        </svg>
      );
    case 'arrow-right':
      return (
        <svg {...props}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...props}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'eye-off':
      return (
        <svg {...props}>
          <path d="M3 3l18 18M10.6 6.2A10 10 0 0112 6c6.5 0 10 6 10 6a16.6 16.6 0 01-3.6 4.4M6.6 6.6A16.6 16.6 0 002 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8" />
          <path d="M9.9 9.9a3 3 0 004.2 4.2" />
        </svg>
      );
    case 'search':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...props}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case 'check':
      return (
        <svg {...props}>
          <path d="M5 12l5 5L20 7" />
        </svg>
      );
    case 'x':
      return (
        <svg {...props}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...props}>
          <path d="M4 20h4l11-11-4-4L4 16v4z" />
        </svg>
      );
    case 'send':
      return (
        <svg {...props}>
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...props}>
          <path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" />
        </svg>
      );
    case 'filter':
      return (
        <svg {...props}>
          <path d="M3 5h18M6 12h12M10 19h4" />
        </svg>
      );
    case 'trend-up':
      return (
        <svg {...props}>
          <path d="M3 17l6-6 4 4 8-8M14 7h7v7" />
        </svg>
      );
    case 'target':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.2" fill={color} stroke="none" />
        </svg>
      );
    case 'flame':
      return (
        <svg {...props}>
          <path d="M12 2c0 4-3 4-3 8a3 3 0 003 3 3 3 0 003-3c0-2-1-3-1-5 3 1 5 4 5 7a7 7 0 11-14 0c0-3 2-5 4-7 1 1 1 2 1 3 0-2 1-4 2-6z" />
        </svg>
      );
    case 'briefcase':
      return (
        <svg {...props}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18" />
        </svg>
      );
    case 'zap':
      return (
        <svg {...props}>
          <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case 'building':
      return (
        <svg {...props}>
          <rect x="4" y="3" width="16" height="18" rx="1" />
          <path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2" />
        </svg>
      );
    case 'coins':
      return (
        <svg {...props}>
          <circle cx="9" cy="9" r="5" />
          <path d="M19 13a5 5 0 01-5 5M14 7a5 5 0 015 5" />
        </svg>
      );
    case 'bank':
      return (
        <svg {...props}>
          <path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 19h18M3 22h18" />
        </svg>
      );
    case 'safe':
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="13" cy="12" r="3" />
          <path d="M13 9v1M13 14v1M16 12h1M9 12h1M7 16v2M17 16v2" />
        </svg>
      );
    case 'sliders':
      return (
        <svg {...props}>
          <path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h11M19 18h1" />
          <circle cx="13" cy="6" r="2" />
          <circle cx="9" cy="12" r="2" />
          <circle cx="17" cy="18" r="2" />
        </svg>
      );
    case 'list':
      return (
        <svg {...props}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case 'pause':
      return (
        <svg {...props}>
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      );
    default:
      return null;
  }
}
