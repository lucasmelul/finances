/**
 * Chrome desktop: sidebar fija (220px) + main area scrollable. La sidebar
 * tiene la nav y, al pie, una mini-card con el FX CCL — siempre visible
 * porque es el dato más consultado en el día.
 */

import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { fmt, fmtTime } from '@/lib/format';
import { useUIStore } from '@/lib/store';
import { Icon, type IconName } from '@/components/ui/Icon';
import { NavItem } from '@/components/composite/NavItem';
import { SearchDialog } from '@/components/dialogs/SearchDialog';
import { useFx, useFxFreshness } from '@/lib/db/derived';
import { relTime } from '@/lib/format';

interface DesktopChromeProps {
  children: ReactNode;
}

interface NavEntry {
  id: string;
  icon: IconName;
  label: string;
  path: string;
}

const NAV_ENTRIES: NavEntry[] = [
  { id: 'inicio',      icon: 'home',     label: 'Inicio',        path: '/' },
  { id: 'carteras',    icon: 'briefcase', label: 'Carteras',     path: '/carteras' },
  { id: 'operaciones', icon: 'list',     label: 'Operaciones',   path: '/operaciones' },
  { id: 'oport',       icon: 'trend-up', label: 'Oportunidades', path: '/oportunidades' },
  { id: 'cuentas',     icon: 'wallet',   label: 'Cuentas',       path: '/cuentas' },
  { id: 'staking',     icon: 'zap',      label: 'Staking',       path: '/staking' },
  { id: 'insights',    icon: 'spark',    label: 'Insights',      path: '/insights' },
  { id: 'simulador',   icon: 'chart',    label: 'Simulador',     path: '/simulador' },
  { id: 'chat',        icon: 'send',     label: 'Operar',        path: '/chat' },
  { id: 'importar',    icon: 'arrow-down', label: 'Importar',    path: '/importar' },
  { id: 'settings',    icon: 'sliders',  label: 'Ajustes',       path: '/settings' },
];

function deriveActiveNav(pathname: string): string {
  if (pathname.startsWith('/carteras'))    return 'carteras';
  if (pathname.startsWith('/asset'))       return 'inicio';
  if (pathname.startsWith('/oportunidades')) return 'oport';
  if (pathname.startsWith('/operaciones')) return 'operaciones';
  if (pathname.startsWith('/cuentas'))     return 'cuentas';
  if (pathname.startsWith('/chat'))        return 'chat';
  if (pathname.startsWith('/simulador'))   return 'simulador';
  if (pathname.startsWith('/staking'))     return 'staking';
  if (pathname.startsWith('/insights'))    return 'insights';
  if (pathname.startsWith('/importar'))    return 'importar';
  if (pathname.startsWith('/settings'))    return 'settings';
  return 'inicio';
}

export function DesktopChrome({ children }: DesktopChromeProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { displayCurrency, setDisplayCurrency, hidden, toggleHidden } = useUIStore();
  const active = deriveActiveNav(location.pathname);
  const now = useNow(60_000);
  const fx = useFx();
  const fxFreshness = useFxFreshness();
  const [searchOpen, setSearchOpen] = useState(false);
  // Formato "lunes 28 de abril" — más expansivo que en mobile, hay espacio.
  const fullDate = now.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="flex h-full bg-bg-base font-sans text-text-primary">
      {/* Sidebar */}
      <aside className="flex w-[220px] flex-none flex-col gap-1 border-r border-border-subtle px-3.5 py-5">
        <div className="flex items-center gap-2.5 px-1.5 pb-4">
          <div
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-sm font-bold tracking-tight text-white"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--accent)) 0%, #818CF8 100%)',
            }}
            aria-hidden="true"
          >
            P
          </div>
          <div className="text-sm font-semibold tracking-tight">Patrimonio</div>
        </div>
        {NAV_ENTRIES.map((entry) => (
          <NavItem
            key={entry.id}
            icon={entry.icon}
            label={entry.label}
            active={active === entry.id}
            variant="sidebar"
            onClick={() => navigate(entry.path)}
          />
        ))}
        <div className="flex-1" />
        {/* FX CCL card (siempre visible) — live desde DolarAPI vía useFx().
            No mostramos delta porque no tenemos histórico de FX para
            calcularlo honestamente; cuando agreguemos snapshots diarios,
            volvemos a poner el +X% hoy. */}
        <div className="rounded-[10px] border border-border-subtle bg-bg-surface p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            FX CCL
          </div>
          <div className="text-sm font-semibold text-text-primary tabular-nums">
            {fx.ccl ? `$${fmt(fx.ccl, 0)}` : '—'}
          </div>
          <div className="mt-0.5 text-[10px] text-text-muted tabular-nums">
            {fxFreshness ? `act. ${relTime(fxFreshness)}` : 'sin actualizar'}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex flex-none items-center justify-between border-b border-border-subtle px-7 py-3.5">
          <div className="font-mono text-[11px] text-text-muted">
            {fullDate} · {fmtTime(now)}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:border-border-hover"
              aria-label="Buscar activo"
            >
              <Icon name="search" size={14} />
              Buscar activo
            </button>
            <button
              type="button"
              onClick={toggleHidden}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:border-border-hover"
              aria-pressed={hidden}
              aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
            >
              <Icon name={hidden ? 'eye-off' : 'eye'} size={14} />
              {hidden ? 'Mostrar' : 'Ocultar'}
            </button>
            <button
              type="button"
              onClick={() => setDisplayCurrency(displayCurrency === 'USD' ? 'ARS' : 'USD')}
              className="h-8 rounded-lg border border-border-subtle bg-bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:border-border-hover"
            >
              {displayCurrency}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-7 py-5">
          {/* Contenedor que limita el ancho en pantallas grandes para que la
              tipografía no se vuelva inmanejable. */}
          <div className="mx-auto max-w-[760px]">{children}</div>
        </main>
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

/** Mismo helper que en MobileChrome — refresca cada minuto. */
function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
