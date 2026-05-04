/**
 * Chrome móvil: top bar (logo + título + acciones) + contenido scrollable +
 * bottom nav con FAB central que va al chat.
 *
 * El título y la pantalla activa se derivan del pathname (no de prop) para
 * que el browser back/forward y los deep-links funcionen sin sincronización
 * manual.
 */

import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { fmtDateShort, fmtTime } from '@/lib/format';
import { useUIStore } from '@/lib/store';
import { Icon } from '@/components/ui/Icon';
import { NavItem } from '@/components/composite/NavItem';
import { SearchDialog } from '@/components/dialogs/SearchDialog';

interface MobileChromeProps {
  children: ReactNode;
}

/** Mapea pathname → screen key + título visible. */
function deriveScreen(pathname: string): { key: string; title: string } {
  if (pathname.startsWith('/carteras')) return { key: 'carteras', title: 'Carteras' };
  if (pathname.startsWith('/asset')) return { key: 'inicio', title: 'Activo' };
  if (pathname.startsWith('/oportunidades')) return { key: 'oport', title: 'Oportunidades' };
  if (pathname.startsWith('/cuentas')) return { key: 'cuentas', title: 'Cuentas' };
  if (pathname.startsWith('/chat')) return { key: 'chat', title: 'Operar' };
  return { key: 'inicio', title: 'Patrimonio' };
}

export function MobileChrome({ children }: MobileChromeProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { displayCurrency, setDisplayCurrency, hidden, toggleHidden } = useUIStore();
  const { key, title } = deriveScreen(location.pathname);
  const isChat = key === 'chat';
  const now = useNow(60_000); // refresca cada minuto el header date/time
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="flex h-full flex-col bg-bg-base font-sans text-text-primary">
      {/* Top bar */}
      <header className="safe-top flex flex-none items-center justify-between px-4 pb-1.5 pt-3">
        <div className="flex items-center gap-2">
          <BrandLogo />
          <div>
            <div className="text-[13px] font-semibold leading-tight text-text-primary">
              {title}
            </div>
            <div className="mt-px font-mono text-[10px] text-text-muted">
              {fmtDateShort(now)} · {fmtTime(now)}
            </div>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-bg-elevated/50"
            aria-label="Buscar activo"
          >
            <Icon name="search" size={18} />
          </button>
          <button
            type="button"
            onClick={toggleHidden}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-bg-elevated/50"
            aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
            aria-pressed={hidden}
          >
            <Icon name={hidden ? 'eye-off' : 'eye'} size={18} />
          </button>
          <button
            type="button"
            onClick={() => setDisplayCurrency(displayCurrency === 'USD' ? 'ARS' : 'USD')}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-bg-surface text-[11px] font-semibold tracking-wide text-text-secondary hover:border-border-hover"
            aria-label="Cambiar moneda"
          >
            {displayCurrency}
          </button>
        </div>
      </header>

      {/* Contenido scrollable. pb-24 deja espacio para que el bottom-nav no
          tape la última fila. */}
      <main className="relative flex-1 overflow-y-auto px-4 pb-24 pt-3">
        {children}
      </main>

      {/* Bottom nav con FAB */}
      <nav
        className="absolute inset-x-0 bottom-0 border-t border-border-subtle pb-6"
        style={{
          background: 'hsl(var(--bg-base) / 0.93)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="relative flex items-center justify-around px-0 pb-1.5 pt-2">
          <NavItem
            icon="home"
            label="Inicio"
            active={key === 'inicio' && !location.pathname.startsWith('/asset')}
            onClick={() => navigate('/')}
          />
          <NavItem
            icon="briefcase"
            label="Carteras"
            active={key === 'carteras'}
            onClick={() => navigate('/carteras')}
          />
          {/* Hueco para el FAB */}
          <div className="w-14" />
          <NavItem
            icon="trend-up"
            label="Oport."
            active={key === 'oport'}
            onClick={() => navigate('/oportunidades')}
          />
          <NavItem
            icon="wallet"
            label="Cuentas"
            active={key === 'cuentas'}
            onClick={() => navigate('/cuentas')}
          />

          {/* FAB Operar — al chat */}
          <button
            type="button"
            onClick={() => navigate(isChat ? '/' : '/chat')}
            className={cn(
              'absolute left-1/2 top-[-22px] flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full text-white transition-transform active:scale-95',
              'border-[3px] border-bg-base',
            )}
            style={{
              background: 'linear-gradient(135deg, hsl(var(--accent)) 0%, #818CF8 100%)',
              boxShadow: '0 6px 20px hsl(var(--accent) / 0.5)',
            }}
            aria-label={isChat ? 'Cerrar chat' : 'Operar'}
          >
            <Icon name={isChat ? 'x' : 'send'} size={22} />
          </button>
          <span className="absolute left-1/2 top-[38px] -translate-x-1/2 text-[10px] font-medium text-text-secondary">
            Operar
          </span>
        </div>
      </nav>

      {/* Modal de búsqueda global. Vive en el chrome para que esté disponible
          desde cualquier pantalla sin duplicar wiring. */}
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

/** Logo "P" con gradient (placeholder hasta que tengamos un mark real). */
function BrandLogo() {
  return (
    <div
      className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-sm font-bold tracking-tight text-white"
      style={{ background: 'linear-gradient(135deg, hsl(var(--accent)) 0%, #818CF8 100%)' }}
      aria-hidden="true"
    >
      P
    </div>
  );
}

/**
 * Hook que devuelve `Date` actual y se re-renderiza cada `intervalMs` ms.
 * Sirve para que el header del shell muestre la fecha/hora real en lugar
 * de un timestamp hardcodeado. 60s alcanza — no necesitamos segundero.
 */
function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
