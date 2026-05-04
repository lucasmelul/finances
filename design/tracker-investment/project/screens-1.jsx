// Pantallas del portfolio tracker
const { useState: uS, useEffect: uE, useMemo: uM, useRef: uR } = React;

// ════════════════════════════════════════════════════════════════
// 1. INICIO / DASHBOARD
// ════════════════════════════════════════════════════════════════
function ScreenInicio({ T, hidden, displayCcy, fxRate, onNav }) {
  const [period, setPeriod] = uS('30d');

  // Total portfolio en USD
  const totalUSD = uM(() => HOLDINGS.reduce((s, h) => s + holdingValueUSD(h), 0), []);
  const totalCostUSD = uM(() => HOLDINGS.reduce((s, h) => s + holdingCostUSD(h), 0), []);
  const pnlUSD = totalUSD - totalCostUSD;
  const pnlPct = (pnlUSD / totalCostUSD) * 100;

  const portfolioCurve = uM(() => spark(7, 32, 1.5, 1.5), []);

  const totalDisplay = displayCcy === 'USD' ? totalUSD : totalUSD * FX[fxRate];

  // Top movers (3 mayores % y 3 peores)
  const heldAssets = uM(() => {
    const seen = new Set();
    return HOLDINGS.map(h => h.assetId).filter(id => !seen.has(id) && seen.add(id))
      .map(id => ASSETS.find(a => a.id === id))
      .sort((a,b) => b.ch24 - a.ch24);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 24 }}>
      {/* HERO */}
      <div style={{ padding: '8px 4px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.textSecondary, fontSize: 12, fontWeight: 500, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
          <span>Patrimonio total</span>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: T.positive, display: 'inline-block', boxShadow: `0 0 8px ${T.positive}` }}/>
          <span style={{ color: T.textMuted, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>en vivo</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 38, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums', letterSpacing: -1 }}>
            {hidden ? '••••••••' : fmtMoney(totalDisplay, displayCcy)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: pnlUSD >= 0 ? T.positive : T.negative, fontWeight: 600 }}>
            {hidden ? '•••' : `${pnlUSD >= 0 ? '+' : ''}${fmtMoney(pnlUSD * (displayCcy === 'USD' ? 1 : FX[fxRate]), displayCcy)}`}
          </span>
          <span style={{ color: pnlPct >= 0 ? T.positive : T.negative, fontWeight: 500 }}>
            {hidden ? '•••' : `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`}
          </span>
          <span style={{ color: T.textMuted, fontSize: 12 }}>· {period}</span>
        </div>
      </div>

      {/* Curva grande */}
      <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, padding: 14 }}>
        <LineChart data={portfolioCurve} color={T.accent} width={360} height={120}/>
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {['24h','7d','30d','YTD','All'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              flex: 1, height: 28, fontSize: 11, fontWeight: 600,
              background: period === p ? T.accentSoft : 'transparent',
              color: period === p ? T.accent : T.textSecondary,
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', letterSpacing: 0.3,
            }}>{p}</button>
          ))}
        </div>
      </div>

      {/* FX card */}
      <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, letterSpacing: 0.4, textTransform: 'uppercase' }}>Cotizaciones USD</div>
          <div style={{ fontSize: 10, color: T.textMuted, fontFamily: 'ui-monospace, monospace' }}>act. 14:32</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { k: 'Oficial', v: FX.oficial, d: -0.1 },
            { k: 'MEP',     v: FX.mep,     d: 0.4 },
            { k: 'CCL',     v: FX.ccl,     d: 0.6 },
            { k: 'Blue',    v: FX.blue,    d: 0.8 },
          ].map(it => (
            <div key={it.k} style={{ background: T.bgBase, border: `1px solid ${T.borderSubtle}`, borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: T.textMuted, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 2 }}>{it.k}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>${fmt(it.v, 0)}</div>
              <div style={{ fontSize: 9, color: it.d >= 0 ? T.positive : T.negative, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{it.d >= 0 ? '+' : ''}{it.d.toFixed(2)}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top movers */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px', marginBottom: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, margin: 0, letterSpacing: -0.1 }}>Mis activos</h2>
          <button onClick={() => onNav('carteras')} style={{ background: 'transparent', border: 0, color: T.accent, fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            Ver todo <Icon name="arrow-right" size={12}/>
          </button>
        </div>
        <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, overflow: 'hidden' }}>
          {heldAssets.slice(0, 5).map((a, i) => (
            <AssetRow key={a.id} asset={a} T={T} hidden={hidden} displayCcy={displayCcy} fxRate={fxRate} onNav={onNav} divider={i < 4}/>
          ))}
        </div>
      </div>

      {/* Operaciones recientes preview */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px', marginBottom: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, margin: 0, letterSpacing: -0.1 }}>Operaciones recientes</h2>
          <button style={{ background: 'transparent', border: 0, color: T.accent, fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            Ver todo <Icon name="arrow-right" size={12}/>
          </button>
        </div>
        <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, overflow: 'hidden' }}>
          {RECENT_TX.slice(0, 4).map((tx, i) => (
            <TxRow key={tx.id} tx={tx} T={T} hidden={hidden} divider={i < 3}/>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AssetRow ──────────────────────────────────────────────────
function AssetRow({ asset, T, hidden, displayCcy, fxRate, onNav, divider }) {
  // Sumar holdings
  const holdings = HOLDINGS.filter(h => h.assetId === asset.id);
  const totalQty = holdings.reduce((s, h) => s + h.qty, 0);
  const totalUSD = holdings.reduce((s, h) => s + holdingValueUSD(h), 0);
  const totalDisplay = displayCcy === 'USD' ? totalUSD : totalUSD * FX[fxRate];
  const positive = asset.ch24 >= 0;
  return (
    <div onClick={() => onNav && onNav('asset', asset.id)} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      borderBottom: divider ? `1px solid ${T.borderSubtle}` : 'none',
      cursor: 'pointer',
    }}>
      <AssetLogo asset={asset} size={36}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, letterSpacing: -0.1 }}>{asset.symbol}</span>
          <span style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 500, padding: '1px 5px', background: T.bgBase, borderRadius: 3 }}>{asset.type}</span>
        </div>
        <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 1 }}>
          {hidden ? '••••' : `${fmt(totalQty, asset.type === 'crypto' ? 4 : 0)} ${asset.symbol}`}
        </div>
      </div>
      <Sparkline data={asset.spark} color={positive ? T.positive : T.negative} width={50} height={20} fill={false}/>
      <div style={{ textAlign: 'right', minWidth: 90 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
          {hidden ? '••••' : fmtMoney(totalDisplay, displayCcy)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 500, color: positive ? T.positive : T.negative, fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
          {hidden ? '•••' : `${positive ? '+' : ''}${asset.ch24.toFixed(2)}%`}
        </div>
      </div>
    </div>
  );
}

// ─── TxRow ─────────────────────────────────────────────────────
function TxRow({ tx, T, hidden, divider }) {
  const asset = ASSETS.find(a => a.id === tx.assetId);
  const acc = ACCOUNTS.find(a => a.id === tx.accountId);
  const cfg = {
    buy:   { c: T.positive, bg: T.positiveSoft, ic: 'arrow-down', label: 'Compra' },
    sell:  { c: T.negative, bg: T.negativeSoft, ic: 'arrow-up',   label: 'Venta' },
    yield: { c: T.accent,   bg: T.accentSoft,   ic: 'spark',      label: 'Yield' },
  }[tx.kind];
  const date = new Date(tx.date);
  const rel = relTime(date);
  const price = tx.priceUSD != null ? `US$${fmt(tx.priceUSD, 2)}` : (tx.priceARS != null ? `$${fmt(tx.priceARS, 0)}` : '');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: divider ? `1px solid ${T.borderSubtle}` : 'none' }}>
      <div style={{ width: 32, height: 32, borderRadius: 16, background: cfg.bg, color: cfg.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={cfg.ic} size={14}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{cfg.label} · {asset.symbol}</span>
          {tx.note && <span style={{ fontSize: 10, color: T.textMuted, fontStyle: 'italic' }}>{tx.note}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: T.textSecondary }}>{acc.name}</span>
          <span style={{ color: T.textMuted, fontSize: 10 }}>·</span>
          <BucketChip bucketId={tx.bucketId} T={T} small/>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
          {hidden ? '••••' : `${tx.kind === 'sell' ? '-' : tx.kind === 'buy' ? '+' : '+'}${fmt(tx.qty, asset.type === 'crypto' ? 4 : 0)}`}
        </div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1, fontFamily: 'ui-monospace, monospace' }}>{price || rel}</div>
      </div>
    </div>
  );
}

function relTime(d) {
  const now = new Date('2026-04-28T15:00:00');
  const diff = (now - d) / 1000;
  if (diff < 3600) return `hace ${Math.round(diff/60)}m`;
  if (diff < 86400) return `hace ${Math.round(diff/3600)}h`;
  if (diff < 86400*7) return `hace ${Math.round(diff/86400)}d`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

// ════════════════════════════════════════════════════════════════
// 2. CARTERAS (4 buckets)
// ════════════════════════════════════════════════════════════════
function ScreenCarteras({ T, hidden, displayCcy, fxRate, onNav }) {
  const [bucket, setBucket] = uS('largo');

  const bucketHoldings = HOLDINGS.filter(h => h.bucketId === bucket);
  const totalUSD = bucketHoldings.reduce((s, h) => s + holdingValueUSD(h), 0);
  const costUSD  = bucketHoldings.reduce((s, h) => s + holdingCostUSD(h), 0);
  const pnlUSD = totalUSD - costUSD;
  const pnlPct = costUSD ? (pnlUSD / costUSD) * 100 : 0;

  // Group by asset
  const byAsset = uM(() => {
    const map = {};
    for (const h of bucketHoldings) {
      if (!map[h.assetId]) map[h.assetId] = { assetId: h.assetId, qty: 0, valueUSD: 0, costUSD: 0, accounts: [] };
      const m = map[h.assetId];
      m.qty += h.qty;
      m.valueUSD += holdingValueUSD(h);
      m.costUSD += holdingCostUSD(h);
      m.accounts.push(ACCOUNTS.find(a => a.id === h.accountId));
    }
    return Object.values(map).sort((a, b) => b.valueUSD - a.valueUSD);
  }, [bucket]);

  const totalDisplay = displayCcy === 'USD' ? totalUSD : totalUSD * FX[fxRate];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24 }}>
      {/* Bucket tabs */}
      <div style={{ display: 'flex', gap: 6, padding: 4, background: T.bgSurface, borderRadius: 12, border: `1px solid ${T.borderSubtle}` }}>
        {BUCKETS.map(b => (
          <button key={b.id} onClick={() => setBucket(b.id)} style={{
            flex: 1, height: 36, fontSize: 12, fontWeight: 600,
            background: bucket === b.id ? T.bgElevated : 'transparent',
            color: bucket === b.id ? T.textPrimary : T.textSecondary,
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
            boxShadow: bucket === b.id ? `0 1px 0 ${T.borderHover}` : 'none',
          }}>{b.label}</button>
        ))}
      </div>

      {/* Resumen del bucket */}
      <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: T.textSecondary, letterSpacing: 0.4, textTransform: 'uppercase' }}>{BUCKETS.find(b => b.id === bucket).desc}</div>
          <div style={{ fontSize: 11, color: T.textMuted, fontFamily: 'ui-monospace, monospace' }}>{bucketHoldings.length} pos.</div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>
          {hidden ? '••••••' : fmtMoney(totalDisplay, displayCcy)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: pnlUSD >= 0 ? T.positive : T.negative, fontWeight: 600 }}>
            {hidden ? '•••' : `${pnlUSD >= 0 ? '+' : ''}${fmtMoney(pnlUSD * (displayCcy === 'USD' ? 1 : FX[fxRate]), displayCcy)}`}
          </span>
          <span style={{ color: pnlPct >= 0 ? T.positive : T.negative, fontWeight: 500 }}>
            {hidden ? '•••' : `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`}
          </span>
          <span style={{ color: T.textMuted, fontSize: 11 }}>· total</span>
        </div>
      </div>

      {/* Distribución donut */}
      <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 12 }}>Distribución</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Donut
            slices={byAsset.slice(0, 6).map((it, i) => {
              const colors = ['#6366F1','#22D3EE','#34D399','#FB923C','#A78BFA','#F472B6'];
              return { value: it.valueUSD, color: colors[i] };
            })}
            size={130} thickness={18} T={T}
            label={hidden ? '••' : `${byAsset.length}`}
            sublabel="ACTIVOS"
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {byAsset.slice(0, 5).map((it, i) => {
              const colors = ['#6366F1','#22D3EE','#34D399','#FB923C','#A78BFA','#F472B6'];
              const a = ASSETS.find(x => x.id === it.assetId);
              const pct = (it.valueUSD / totalUSD) * 100;
              return (
                <div key={it.assetId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[i], flexShrink: 0 }}/>
                  <span style={{ color: T.textPrimary, fontWeight: 500, flex: 1 }}>{a.symbol}</span>
                  <span style={{ color: T.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{hidden ? '••' : `${pct.toFixed(1)}%`}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Holdings list */}
      <div>
        <div style={{ padding: '0 4px', marginBottom: 10, fontSize: 14, fontWeight: 600, color: T.textPrimary }}>Holdings</div>
        <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, overflow: 'hidden' }}>
          {byAsset.map((it, i) => {
            const a = ASSETS.find(x => x.id === it.assetId);
            return <AssetRow key={a.id} asset={a} T={T} hidden={hidden} displayCcy={displayCcy} fxRate={fxRate} onNav={onNav} divider={i < byAsset.length - 1}/>;
          })}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 3. DETALLE DE ACTIVO
// ════════════════════════════════════════════════════════════════
function ScreenAsset({ T, assetId, hidden, displayCcy, fxRate, onBack }) {
  const asset = ASSETS.find(a => a.id === assetId) || ASSETS[0];
  const [tab, setTab] = uS('precio');
  const holdings = HOLDINGS.filter(h => h.assetId === asset.id);
  const totalQty = holdings.reduce((s, h) => s + h.qty, 0);
  const totalUSD = holdings.reduce((s, h) => s + holdingValueUSD(h), 0);
  const costUSD  = holdings.reduce((s, h) => s + holdingCostUSD(h), 0);
  const pnlUSD = totalUSD - costUSD;
  const pnlPct = costUSD ? (pnlUSD / costUSD) * 100 : 0;
  const positive = asset.ch24 >= 0;

  const priceShown = displayCcy === 'USD' ? priceInUSD(asset) : priceInARS(asset, fxRate);
  const priceCurrency = displayCcy;

  // Operaciones de este activo
  const txs = RECENT_TX.filter(t => t.assetId === asset.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 18, background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, color: T.textPrimary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6"/></svg>
        </button>
        <AssetLogo asset={asset} size={40}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary, letterSpacing: -0.2 }}>{asset.symbol}</div>
          <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 1 }}>{asset.name}</div>
        </div>
        <span style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 500, padding: '3px 7px', background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 4 }}>{asset.type}</span>
      </div>

      {/* Precio */}
      <div>
        <div style={{ fontSize: 32, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>
          {hidden ? '••••••' : fmtMoney(priceShown, priceCurrency)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: positive ? T.positive : T.negative, fontWeight: 600 }}>
            {hidden ? '•••' : `${positive ? '+' : ''}${asset.ch24.toFixed(2)}%`}
          </span>
          <span style={{ color: T.textMuted, fontSize: 11 }}>24h</span>
        </div>
      </div>

      {/* Chart con S/R */}
      <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, padding: 14 }}>
        <LineChart data={asset.spark} color={positive ? T.positive : T.negative} width={360} height={140} srLow={asset.srLow} srHigh={asset.srHigh}/>
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {['1D','1W','1M','3M','1Y','All'].map(p => (
            <button key={p} style={{
              flex: 1, height: 28, fontSize: 11, fontWeight: 600,
              background: p === '1M' ? T.accentSoft : 'transparent',
              color: p === '1M' ? T.accent : T.textSecondary,
              border: 'none', borderRadius: 8, cursor: 'pointer',
            }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.borderSubtle}` }}>
        {['precio','holdings','operaciones','info'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 14px', fontSize: 13, fontWeight: 600,
            background: 'transparent',
            color: tab === t ? T.textPrimary : T.textSecondary,
            border: 'none', borderBottom: `2px solid ${tab === t ? T.accent : 'transparent'}`,
            cursor: 'pointer', textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {/* CEDEAR info */}
      {asset.type === 'cedear' && (
        <div style={{ background: T.accentSoft, border: `1px solid ${T.accent}33`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.accent, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>CEDEAR · ratio {asset.ratio}:1</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: T.textSecondary, fontWeight: 500 }}>Tus CEDEARs</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{hidden ? '••' : fmt(totalQty, 0)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.textSecondary, fontWeight: 500 }}>Acciones equivalentes</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{hidden ? '••' : fmt(totalQty / asset.ratio, 2)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.textSecondary, fontWeight: 500 }}>Subyacente</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>US${fmt(asset.underlyingUSD, 2)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.textSecondary, fontWeight: 500 }}>Precio efectivo</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>US${fmt((asset.priceARS * asset.ratio) / FX.ccl, 2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Holdings tab content */}
      {tab === 'holdings' && (
        <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, overflow: 'hidden' }}>
          {holdings.map((h, i) => {
            const acc = ACCOUNTS.find(a => a.id === h.accountId);
            const v = holdingValueUSD(h);
            const c = holdingCostUSD(h);
            const p = ((v - c) / c) * 100;
            return (
              <div key={i} style={{ padding: '12px 14px', borderBottom: i < holdings.length - 1 ? `1px solid ${T.borderSubtle}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{acc.name}</span>
                    <TagBadge tag={acc.tag} T={T}/>
                    <BucketChip bucketId={h.bucketId} T={T} small/>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{hidden ? '••' : fmtMoney(displayCcy === 'USD' ? v : v * FX[fxRate], displayCcy)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
                  <span>{hidden ? '••' : fmt(h.qty, asset.type === 'crypto' ? 4 : 0)} {asset.symbol} · avg {fmtMoney(h.avgUSD || (h.avgARS / FX.ccl), 'USD')}</span>
                  <span style={{ color: p >= 0 ? T.positive : T.negative, fontWeight: 500 }}>{hidden ? '••' : `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'operaciones' && (
        <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, overflow: 'hidden' }}>
          {txs.length ? txs.map((tx, i) => <TxRow key={tx.id} tx={tx} T={T} hidden={hidden} divider={i < txs.length - 1}/>) :
            <div style={{ padding: 24, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>Sin operaciones</div>
          }
        </div>
      )}

      {tab === 'precio' && (
        <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><div style={{ fontSize: 10, color: T.textSecondary, fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase' }}>Soporte</div><div style={{ fontSize: 14, fontWeight: 600, color: T.positive, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{fmtMoney(asset.srLow, asset.priceUSD ? 'USD' : 'ARS')}</div></div>
          <div><div style={{ fontSize: 10, color: T.textSecondary, fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase' }}>Resistencia</div><div style={{ fontSize: 14, fontWeight: 600, color: T.negative, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{fmtMoney(asset.srHigh, asset.priceUSD ? 'USD' : 'ARS')}</div></div>
          <div><div style={{ fontSize: 10, color: T.textSecondary, fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase' }}>Tu valor</div><div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{hidden ? '••' : fmtMoney(totalUSD, 'USD')}</div></div>
          <div><div style={{ fontSize: 10, color: T.textSecondary, fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase' }}>PnL</div><div style={{ fontSize: 14, fontWeight: 600, color: pnlUSD >= 0 ? T.positive : T.negative, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{hidden ? '••' : `${pnlUSD >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`}</div></div>
        </div>
      )}

      {tab === 'info' && (
        <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, padding: 14, fontSize: 12, color: T.textSecondary, lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}><strong style={{ color: T.textPrimary }}>{asset.name}</strong> ({asset.symbol}) — {asset.type === 'cedear' ? `Certificado argentino que representa una fracción de ${asset.name}. Cotiza en ARS en BYMA.` : asset.type === 'crypto' ? 'Activo cripto, cotizado en USD/USDT.' : asset.type === 'bono' ? 'Bono soberano, cotiza en dólares.' : 'Instrumento financiero.'}</p>
        </div>
      )}

      <Btn kind="primary" size="lg" full T={T} icon="plus">Operar {asset.symbol}</Btn>
    </div>
  );
}

Object.assign(window, { ScreenInicio, ScreenCarteras, ScreenAsset, AssetRow, TxRow });
