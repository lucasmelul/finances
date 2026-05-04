// App shell: PortfolioApp (renders the inner experience), MobileFrame, DesktopFrame
const { useState: u3S, useEffect: u3E, useMemo: u3M } = React;

// ════════════════════════════════════════════════════════════════
// PORTFOLIO APP — la experiencia interna (shared mobile + desktop)
// ════════════════════════════════════════════════════════════════
function PortfolioApp({ T, hidden, displayCcy, fxRate, mode = 'mobile', initialScreen = 'inicio' }) {
  const [screen, setScreen] = u3S(initialScreen);
  const [assetId, setAssetId] = u3S(null);

  function nav(s, payload) {
    if (s === 'asset') { setAssetId(payload); setScreen('asset'); return; }
    setScreen(s);
  }

  let content = null;
  if (screen === 'inicio')        content = <ScreenInicio T={T} hidden={hidden} displayCcy={displayCcy} fxRate={fxRate} onNav={nav}/>;
  else if (screen === 'carteras') content = <ScreenCarteras T={T} hidden={hidden} displayCcy={displayCcy} fxRate={fxRate} onNav={nav}/>;
  else if (screen === 'asset')    content = <ScreenAsset T={T} assetId={assetId} hidden={hidden} displayCcy={displayCcy} fxRate={fxRate} onBack={() => setScreen('inicio')}/>;
  else if (screen === 'oport')    content = <ScreenOportunidades T={T} hidden={hidden} displayCcy={displayCcy} fxRate={fxRate} onNav={nav}/>;
  else if (screen === 'cuentas')  content = <ScreenCuentas T={T} hidden={hidden} displayCcy={displayCcy} fxRate={fxRate}/>;
  else if (screen === 'chat')     content = <ScreenChat T={T}/>;

  if (mode === 'mobile') {
    return <MobileChrome T={T} hidden={hidden} displayCcy={displayCcy} screen={screen} onNav={nav}>{content}</MobileChrome>;
  }
  return <DesktopChrome T={T} hidden={hidden} displayCcy={displayCcy} screen={screen} onNav={nav}>{content}</DesktopChrome>;
}

// ════════════════════════════════════════════════════════════════
// MOBILE CHROME — top bar + bottom nav with FAB
// ════════════════════════════════════════════════════════════════
function MobileChrome({ T, hidden, displayCcy, screen, onNav, children }) {
  const isChat = screen === 'chat';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.bgBase, color: T.textPrimary, fontFamily: 'Inter, sans-serif' }}>
      {/* Top bar */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${T.accent} 0%, #818CF8 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'Inter, sans-serif', letterSpacing: -0.5 }}>P</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, lineHeight: 1.1 }}>{isChat ? 'Operar' : screen === 'carteras' ? 'Carteras' : screen === 'oport' ? 'Oportunidades' : screen === 'cuentas' ? 'Cuentas' : 'Patrimonio'}</div>
            <div style={{ fontSize: 10, color: T.textMuted, fontFamily: 'ui-monospace, monospace', marginTop: 1 }}>lun · 28 abr · 14:32</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ width: 36, height: 36, borderRadius: 18, background: 'transparent', border: 'none', color: T.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="search" size={18}/>
          </button>
          <button style={{ width: 36, height: 36, borderRadius: 18, background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, color: T.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
            {displayCcy}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 100px', position: 'relative' }}>
        {children}
      </div>

      {/* Bottom nav */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: T.bgBase + 'EE', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: `1px solid ${T.borderSubtle}`, paddingBottom: 24 /* home indicator */ }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '8px 0 6px', position: 'relative' }}>
          <NavItem T={T} icon="home"      label="Inicio"   active={screen === 'inicio' || screen === 'asset'} onClick={() => onNav('inicio')}/>
          <NavItem T={T} icon="briefcase" label="Carteras" active={screen === 'carteras'} onClick={() => onNav('carteras')}/>
          <div style={{ width: 56 }}/>
          <NavItem T={T} icon="trend-up"  label="Oport."   active={screen === 'oport'}    onClick={() => onNav('oport')}/>
          <NavItem T={T} icon="wallet"    label="Cuentas"  active={screen === 'cuentas'}  onClick={() => onNav('cuentas')}/>

          {/* FAB Operar */}
          <button onClick={() => onNav('chat')} style={{
            position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
            width: 56, height: 56, borderRadius: 28,
            background: `linear-gradient(135deg, ${T.accent} 0%, #818CF8 100%)`,
            color: '#fff', border: `3px solid ${T.bgBase}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 6px 20px ${T.accent}80`,
          }}>
            <Icon name={screen === 'chat' ? 'x' : 'mic'} size={22}/>
          </button>
          <span style={{ position: 'absolute', top: 38, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: T.textSecondary, fontWeight: 500 }}>Operar</span>
        </div>
      </div>
    </div>
  );
}

function NavItem({ T, icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, height: 44, padding: 0,
      background: 'transparent', border: 'none', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      color: active ? T.accent : T.textMuted,
    }}>
      <Icon name={icon} size={20} color={active ? T.accent : T.textMuted}/>
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.2 }}>{label}</span>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════
// DESKTOP CHROME — sidebar + main + right rail
// ════════════════════════════════════════════════════════════════
function DesktopChrome({ T, hidden, displayCcy, screen, onNav, children }) {
  const navItems = [
    { id: 'inicio',   icon: 'home',      label: 'Inicio' },
    { id: 'carteras', icon: 'briefcase', label: 'Carteras' },
    { id: 'oport',    icon: 'trend-up',  label: 'Oportunidades' },
    { id: 'cuentas',  icon: 'wallet',    label: 'Cuentas' },
    { id: 'chat',     icon: 'mic',       label: 'Operar' },
  ];
  const activeNav = screen === 'asset' ? 'inicio' : screen;
  return (
    <div style={{ display: 'flex', height: '100%', background: T.bgBase, color: T.textPrimary, fontFamily: 'Inter, sans-serif' }}>
      {/* Sidebar */}
      <div style={{ width: 220, flex: 'none', borderRight: `1px solid ${T.borderSubtle}`, padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 16px' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${T.accent} 0%, #818CF8 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: -0.5 }}>P</div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>Patrimonio</div>
        </div>
        {navItems.map(n => (
          <button key={n.id} onClick={() => onNav(n.id)} style={{
            height: 38, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 10,
            background: activeNav === n.id ? T.accentSoft : 'transparent',
            color: activeNav === n.id ? T.accent : T.textSecondary,
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', textAlign: 'left',
          }}>
            <Icon name={n.icon} size={16}/>
            {n.label}
          </button>
        ))}
        <div style={{ flex: 1 }}/>
        <div style={{ padding: '12px', background: T.bgSurface, borderRadius: 10, border: `1px solid ${T.borderSubtle}` }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>FX CCL</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>${fmt(FX.ccl, 0)}</div>
          <div style={{ fontSize: 10, color: T.positive, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>+0.6% hoy</div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: `1px solid ${T.borderSubtle}` }}>
          <div style={{ fontSize: 11, color: T.textMuted, fontFamily: 'ui-monospace, monospace' }}>lunes 28 de abril · 14:32</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ height: 32, padding: '0 12px', fontSize: 12, fontWeight: 600, background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, color: T.textPrimary, borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="search" size={14}/> Buscar activo
            </button>
            <button style={{ height: 32, padding: '0 12px', fontSize: 12, fontWeight: 600, background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, color: T.textPrimary, borderRadius: 8, cursor: 'pointer' }}>{displayCcy}</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>{children}</div>
      </div>
    </div>
  );
}

Object.assign(window, { PortfolioApp, MobileChrome, DesktopChrome });
