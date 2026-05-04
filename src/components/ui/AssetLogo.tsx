/**
 * Avatar circular del activo. Mientras no integremos logos reales, usa
 * letra/símbolo + color de fondo desde `Asset.logo` / `Asset.logoBg`.
 *
 * Migración futura: cuando agreguemos URLs, este componente decide entre
 * `<img>` y placeholder sin que las llamadas cambien.
 */

import { cn } from '@/lib/utils';
import type { Asset } from '@/lib/types';

interface AssetLogoProps {
  /** Solo necesitamos el subset de display — evitar acoplar el componente. */
  asset: Pick<Asset, 'logo' | 'logoBg' | 'ticker'>;
  size?: number;
  className?: string;
}

export function AssetLogo({ asset, size = 36, className }: AssetLogoProps) {
  // Fallback: primera letra del ticker si no hay logo configurado.
  const text = asset.logo ?? asset.ticker.slice(0, 1);

  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: asset.logoBg ?? 'hsl(var(--bg-elevated))',
        fontSize: size * 0.45,
      }}
      aria-hidden="true"
    >
      {text}
    </div>
  );
}
