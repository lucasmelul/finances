// Componentes UI compartidos para el portfolio tracker
const { useState, useEffect, useRef, useMemo } = React;

// ─── Hook para tema actual ─────────────────────────────────────
function useTheme(themeName = 'dark') {
  return DESIGN_TOKENS[themeName] || DESIGN_TOKENS.dark;
}

// ─── Iconos minimalistas (stroke) ──────────────────────────────
function Icon({ name, size = 20, color = 'currentColor', style = {} }) {
  const sw = 1.6;
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round', style };
  switch (name) {
    case 'home':       return <svg {...props}><path d="M3 12l9-8 9 8M5 10v10h14V10"/></svg>;
    case 'wallet':     return <svg {...props}><path d="M3 7h15a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 7v-.5A1.5 1.5 0 014.5 5H17"/><circle cx="17" cy="13" r="1.2" fill={color} stroke="none"/></svg>;
    case 'chart':      return <svg {...props}><path d="M4 19V5M4 19h16M8 16V11M12 16V8M16 16v-3"/></svg>;
    case 'mic':        return <svg {...props}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>;
    case 'spark':      return <svg {...props}><path d="M12 2l1.6 5.5L19 9l-5.4 1.5L12 16l-1.6-5.5L5 9l5.4-1.5L12 2z"/></svg>;
    case 'plus':       return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'arrow-up':   return <svg {...props}><path d="M7 17L17 7M17 7H9M17 7v8"/></svg>;
    case 'arrow-down': return <svg {...props}><path d="M17 7L7 17M7 17h8M7 17V9"/></svg>;
    case 'arrow-right':return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'eye':        return <svg {...props}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'eye-off':    return <svg {...props}><path d="M3 3l18 18M10.6 6.2A10 10 0 0112 6c6.5 0 10 6 10 6a16.6 16.6 0 01-3.6 4.4M6.6 6.6A16.6 16.6 0 002 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>;
    case 'search':     return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case 'menu':       return <svg {...props}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'check':      return <svg {...props}><path d="M5 12l5 5L20 7"/></svg>;
    case 'x':          return <svg {...props}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'edit':       return <svg {...props}><path d="M4 20h4l11-11-4-4L4 16v4z"/></svg>;
    case 'send':       return <svg {...props}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>;
    case 'refresh':    return <svg {...props}><path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5"/></svg>;
    case 'filter':     return <svg {...props}><path d="M3 5h18M6 12h12M10 19h4"/></svg>;
    case 'trend-up':   return <svg {...props}><path d="M3 17l6-6 4 4 8-8M14 7h7v7"/></svg>;
    case 'target':     return <svg {...props}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill={color} stroke="none"/></svg>;
    case 'flame':      return <svg {...props}><path d="M12 2c0 4-3 4-3 8a3 3 0 003 3 3 3 0 003-3c0-2-1-3-1-5 3 1 5 4 5 7a7 7 0 11-14 0c0-3 2-5 4-7 1 1 1 2 1 3 0-2 1-4 2-6z"/></svg>;
    case 'briefcase':  return <svg {...props}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/></svg>;
    case 'zap':        return <svg {...props}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>;
    case 'clock':      return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'building':   return <svg {...props}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/></svg>;
    case 'coins':      return <svg {...props}><circle cx="9" cy="9" r="5"/><path d="M19 13a5 5 0 01-5 5M14 7a5 5 0 015 5"/></svg>;
    case 'bank':       return <svg {...props}><path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 19h18M3 22h18"/></svg>;
    case 'safe':       return <svg {...props}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="13" cy="12" r="3"/><path d="M13 9v1M13 14v1M16 12h1M9 12h1M7 16v2M17 16v2"/></svg>;
    case 'sliders':    return <svg {...props}><path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="13" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>;
    case 'list':       return <svg {...props}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>;
    case 'pause':      return <svg {...props}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>;
    default: return null;
  }
}

// ─── Sparkline (line + área) ───────────────────────────────────
function Sparkline({ data, color, width = 80, height = 28, fill = true, strokeWidth = 1.5 }) {
  if (!data || !data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 4) - 2]);
  const path = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const area = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {fill && <path d={area} fill={color} fillOpacity={0.15}/>}
      <path d={path} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Line chart (más completo, con eje invisible y tooltip estático) ──
function LineChart({ data, color, width = 340, height = 140, srLow = null, srHigh = null }) {
  if (!data || !data.length) return null;
  const padTop = 12, padBot = 8;
  let min = Math.min(...data), max = Math.max(...data);
  if (srLow != null) min = Math.min(min, srLow);
  if (srHigh != null) max = Math.max(max, srHigh);
  const range = max - min || 1;
  const innerH = height - padTop - padBot;
  const stepX = width / (data.length - 1);
  const yFor = (v) => padTop + innerH - ((v - min) / range) * innerH;
  const points = data.map((v, i) => [i * stepX, yFor(v)]);
  const path = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const area = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {srHigh != null && (
        <g>
          <line x1={0} x2={width} y1={yFor(srHigh)} y2={yFor(srHigh)} stroke="#EF4444" strokeOpacity="0.4" strokeDasharray="3 3" strokeWidth="1"/>
          <text x={width-4} y={yFor(srHigh)-4} fontSize="9" fill="#EF4444" textAnchor="end" fontFamily="ui-monospace, monospace">R</text>
        </g>
      )}
      {srLow != null && (
        <g>
          <line x1={0} x2={width} y1={yFor(srLow)} y2={yFor(srLow)} stroke="#10B981" strokeOpacity="0.4" strokeDasharray="3 3" strokeWidth="1"/>
          <text x={width-4} y={yFor(srLow)-4} fontSize="9" fill="#10B981" textAnchor="end" fontFamily="ui-monospace, monospace">S</text>
        </g>
      )}
      <defs>
        <linearGradient id={`grad-${color.replace('#','')}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#grad-${color.replace('#','')})`}/>
      <path d={path} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      {/* punto final */}
      <circle cx={points[points.length-1][0]} cy={points[points.length-1][1]} r="3" fill={color}/>
      <circle cx={points[points.length-1][0]} cy={points[points.length-1][1]} r="6" fill={color} fillOpacity="0.2"/>
    </svg>
  );
}

// ─── Donut chart con leyenda ───────────────────────────────────
function Donut({ slices, size = 180, thickness = 22, label, sublabel, T }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  let acc = 0;
  const r = size / 2 - thickness / 2 - 2;
  const cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={T.borderSubtle} strokeWidth={thickness} strokeOpacity="0.5"/>
      {slices.map((s, i) => {
        const len = (s.value / total) * C;
        const off = -((acc / total) * C) + C / 4;
        acc += s.value;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={off}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'all .4s' }}
          />
        );
      })}
      {label != null && (
        <g>
          <text x={cx} y={cy - 4} fontSize="11" fill={T.textSecondary} textAnchor="middle" fontFamily="Inter, sans-serif" letterSpacing="0.5">{sublabel}</text>
          <text x={cx} y={cy + 16} fontSize="20" fontWeight="600" fill={T.textPrimary} textAnchor="middle" fontFamily="Inter, sans-serif" style={{ fontVariantNumeric: 'tabular-nums' }}>{label}</text>
        </g>
      )}
    </svg>
  );
}

// ─── Logo de activo ────────────────────────────────────────────
function AssetLogo({ asset, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: asset.logoBg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 600, fontSize: size * 0.45,
      fontFamily: 'Inter, sans-serif',
      flexShrink: 0,
    }}>{asset.logo}</div>
  );
}

// ─── Badge de cuenta (A=declarado azul, B=privado ámbar) ───────
function TagBadge({ tag, T, label }) {
  const color = tag === 'A' ? T.info : T.warning;
  const bg    = tag === 'A' ? T.infoSoft : T.warningSoft;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      color, background: bg,
      padding: '2px 7px', borderRadius: 4,
      letterSpacing: 0.3, fontFamily: 'ui-monospace, "SF Mono", monospace',
      lineHeight: 1.4,
      border: `1px solid ${color}33`,
    }}>{label || tag}</span>
  );
}

// ─── Bucket chip ───────────────────────────────────────────────
function BucketChip({ bucketId, T, small }) {
  const colors = {
    corto: { c: '#22D3EE', bg: 'rgba(34,211,238,0.10)' },
    medio: { c: '#A78BFA', bg: 'rgba(167,139,250,0.10)' },
    largo: { c: '#34D399', bg: 'rgba(52,211,153,0.10)' },
    trade: { c: '#FB923C', bg: 'rgba(251,146,60,0.12)' },
  };
  const b = BUCKETS.find(x => x.id === bucketId);
  if (!b) return null;
  const { c, bg } = colors[bucketId];
  return (
    <span style={{
      fontSize: small ? 10 : 11, fontWeight: 500,
      color: c, background: bg,
      padding: small ? '2px 6px' : '3px 8px', borderRadius: 6,
      letterSpacing: 0.2,
      whiteSpace: 'nowrap',
    }}>{b.label}</span>
  );
}

// ─── Format helpers ────────────────────────────────────────────
function fmt(n, dp = 2, hidden = false) {
  if (hidden) return '••••••';
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n/1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (abs >= 1e4) return n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
  return n.toLocaleString('es-AR', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtMoney(n, currency, hidden) {
  if (hidden) return '••••••';
  const symbol = { USD: 'US$', ARS: '$', EUR: '€', BTC: '₿' }[currency] || '';
  const dp = currency === 'BTC' ? 6 : 2;
  return `${symbol} ${fmt(n, dp)}`;
}
function fmtPct(n, plus = true, hidden) {
  if (hidden) return '••••';
  const sign = n > 0 ? '+' : '';
  return `${plus ? sign : ''}${n.toFixed(2)}%`;
}

// ─── Botón base ────────────────────────────────────────────────
function Btn({ children, kind = 'primary', size = 'md', onClick, T, style = {}, icon, full = false, disabled = false }) {
  const sizes = {
    sm: { h: 32, px: 12, fs: 13 },
    md: { h: 40, px: 16, fs: 14 },
    lg: { h: 48, px: 20, fs: 15 },
  };
  const s = sizes[size];
  const kinds = {
    primary: { bg: T.accent, color: '#fff', border: 'transparent' },
    soft:    { bg: T.accentSoft, color: T.accent, border: 'transparent' },
    ghost:   { bg: 'transparent', color: T.textPrimary, border: T.borderSubtle },
    surface: { bg: T.bgSurface, color: T.textPrimary, border: T.borderSubtle },
    danger:  { bg: T.negativeSoft, color: T.negative, border: 'transparent' },
  };
  const k = kinds[kind];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      height: s.h, padding: `0 ${s.px}px`, fontSize: s.fs, fontWeight: 600,
      background: k.bg, color: k.color, border: `1px solid ${k.border}`,
      borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 8,
      width: full ? '100%' : 'auto', justifyContent: 'center',
      opacity: disabled ? 0.5 : 1, fontFamily: 'Inter, sans-serif',
      transition: 'all .15s', ...style,
    }}>{icon && <Icon name={icon} size={16}/>}{children}</button>
  );
}

// ─── KPI card ──────────────────────────────────────────────────
function KPI({ label, value, delta, T, sub, hidden, sparkData, sparkColor, full }) {
  const positive = delta >= 0;
  return (
    <div style={{
      background: T.bgSurface,
      border: `1px solid ${T.borderSubtle}`,
      borderRadius: 16, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 6,
      flex: full ? '1 1 100%' : '1 1 0',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3 }}>{hidden ? '••••' : value}</div>
      {(delta != null || sub) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          {delta != null && (
            <div style={{ fontSize: 12, fontWeight: 500, color: positive ? T.positive : T.negative, fontVariantNumeric: 'tabular-nums' }}>
              {hidden ? '•••' : `${positive ? '+' : ''}${delta.toFixed(2)}%`}
            </div>
          )}
          {sub && <div style={{ fontSize: 11, color: T.textMuted }}>{sub}</div>}
          {sparkData && <Sparkline data={sparkData} color={sparkColor || (positive ? T.positive : T.negative)} width={50} height={18} fill={false}/>}
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  useTheme, Icon, Sparkline, LineChart, Donut, AssetLogo,
  TagBadge, BucketChip, Btn, KPI, fmt, fmtMoney, fmtPct,
});
