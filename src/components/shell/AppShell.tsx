/**
 * Shell de la app — wrapper que decide entre layout móvil y desktop según
 * el viewport. Renderiza la nav común y el contenido (Outlet de React Router).
 *
 * Breakpoint: md (768px) — debajo, mobile chrome con bottom-nav. Encima,
 * sidebar layout. La decisión es por CSS (no JS) para que SSR/hydration
 * sean estables.
 */

import { Outlet } from 'react-router-dom';
import { MobileChrome } from './MobileChrome';
import { DesktopChrome } from './DesktopChrome';

export function AppShell() {
  return (
    <>
      {/* Mobile (< md) */}
      <div className="block h-full md:hidden">
        <MobileChrome>
          <Outlet />
        </MobileChrome>
      </div>
      {/* Desktop (>= md) */}
      <div className="hidden h-full md:block">
        <DesktopChrome>
          <Outlet />
        </DesktopChrome>
      </div>
    </>
  );
}
