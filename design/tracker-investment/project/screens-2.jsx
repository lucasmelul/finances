// Pantallas 2: Chat, Oportunidades, Cuentas
const { useState: u2S, useEffect: u2E, useMemo: u2M, useRef: u2R } = React;

// ════════════════════════════════════════════════════════════════
// 4. CHAT — registro de operaciones por texto/voz
// ════════════════════════════════════════════════════════════════
function ScreenChat({ T, onConfirm }) {
  const [messages, setMessages] = u2S([
    { id: 1, role: 'system', kind: 'text', text: 'Hola. Contame qué compraste o vendiste y lo registro al toque. Podés dictarlo o escribirlo.' },
    { id: 2, role: 'user', kind: 'text', text: 'compré 50 cedears de aapl a 8500 en iol para largo plazo' },
    { id: 3, role: 'system', kind: 'parsed', data: {
      type: 'Compra',
      assetId: 'aapl',
      qty: 50,
      priceARS: 8500,
      accountId: 'iol',
      bucketId: 'largo',
      currency: 'ARS',
      total: 50 * 8500,
      date: '2026-04-28',
      autoFilled: ['date'],
    }},
  ]);
  const [input, setInput] = u2S('');
  const [recording, setRecording] = u2S(false);
  const [recTime, setRecTime] = u2S(0);
  const scrollRef = u2R(null);

  u2E(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  // Animación timer mientras "graba"
  u2E(() => {
    if (!recording) return;
    const i = setInterval(() => setRecTime(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [recording]);

  function handleSend() {
    if (!input.trim()) return;
    const id = Date.now();
    setMessages(m => [...m, { id, role: 'user', kind: 'text', text: input }]);
    setInput('');
    // Mock: parsea simple
    setTimeout(() => {
      setMessages(m => [...m, {
        id: id + 1, role: 'system', kind: 'parsed',
        data: parseMockTx(input),
      }]);
    }, 700);
  }

  function parseMockTx(text) {
    const t = text.toLowerCase();
    let assetId = ASSETS.find(a => t.includes(a.symbol.toLowerCase()))?.id || 'btc';
    const isSell = /vend/.test(t);
    const qtyMatch = t.match(/(\d+(?:[.,]\d+)?)/);
    const qty = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 1;
    return {
      type: isSell ? 'Venta' : 'Compra',
      assetId,
      qty,
      priceUSD: priceInUSD(ASSETS.find(a => a.id === assetId)),
      accountId: 'binance',
      bucketId: 'medio',
      currency: 'USD',
      total: qty * priceInUSD(ASSETS.find(a => a.id === assetId)),
      date: '2026-04-28',
      autoFilled: ['priceUSD', 'date'],
    };
  }

  function startRec() {
    setRecording(true);
    setRecTime(0);
  }
  function stopRec() {
    setRecording(false);
    if (recTime < 1) return;
    const id = Date.now();
    setMessages(m => [...m, {
      id, role: 'user', kind: 'audio', duration: recTime,
      transcript: 'Vendí 10 nvda a 7800 desde cocos en trade'
    }]);
    setTimeout(() => {
      setMessages(m => [...m, {
        id: id + 1, role: 'system', kind: 'parsed',
        data: { type: 'Venta', assetId: 'nvda', qty: 10, priceARS: 7800, accountId: 'cocos', bucketId: 'trade', currency: 'ARS', total: 78000, date: '2026-04-28', autoFilled: ['date'] }
      }]);
    }, 800);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12 }}>
        {messages.map(m => (
          <ChatMessage key={m.id} m={m} T={T} onConfirm={onConfirm}/>
        ))}
        {recording && (
          <div style={{ alignSelf: 'flex-end', background: T.negativeSoft, border: `1px solid ${T.negative}33`, borderRadius: 16, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, maxWidth: '80%' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: T.negative, animation: 'pulse 1.2s infinite' }}/>
            <span style={{ fontSize: 13, color: T.textPrimary, fontWeight: 500 }}>Escuchando...</span>
            <span style={{ fontSize: 12, color: T.textSecondary, fontFamily: 'ui-monospace, monospace' }}>{String(Math.floor(recTime/60)).padStart(2,'0')}:{String(recTime%60).padStart(2,'0')}</span>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{ borderTop: `1px solid ${T.borderSubtle}`, background: T.bgBase, padding: '10px 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button style={{ width: 40, height: 40, borderRadius: 20, background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, color: T.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="plus" size={18}/>
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Compré 0.05 BTC a 95400..."
          style={{
            flex: 1, height: 40, padding: '0 14px',
            background: T.bgSurface, border: `1px solid ${T.borderSubtle}`,
            borderRadius: 20, color: T.textPrimary, fontSize: 14,
            outline: 'none', fontFamily: 'Inter, sans-serif',
          }}
        />
        {input ? (
          <button onClick={handleSend} style={{ width: 40, height: 40, borderRadius: 20, background: T.accent, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="send" size={16}/>
          </button>
        ) : (
          <button
            onMouseDown={startRec} onMouseUp={stopRec} onMouseLeave={() => recording && stopRec()}
            onTouchStart={startRec} onTouchEnd={stopRec}
            style={{
              width: 40, height: 40, borderRadius: 20,
              background: recording ? T.negative : T.accent,
              color: '#fff', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: recording ? `0 0 0 6px ${T.negative}33` : 'none',
              transition: 'box-shadow .2s',
            }}>
            <Icon name="mic" size={18}/>
          </button>
        )}
      </div>
    </div>
  );
}

function ChatMessage({ m, T, onConfirm }) {
  if (m.role === 'user' && m.kind === 'text') {
    return (
      <div style={{ alignSelf: 'flex-end', background: T.accent, color: '#fff', borderRadius: 16, borderBottomRightRadius: 4, padding: '10px 14px', maxWidth: '82%', fontSize: 14, lineHeight: 1.4 }}>
        {m.text}
      </div>
    );
  }
  if (m.role === 'user' && m.kind === 'audio') {
    return (
      <div style={{ alignSelf: 'flex-end', background: T.accent, color: '#fff', borderRadius: 16, borderBottomRightRadius: 4, padding: '10px 14px', maxWidth: '82%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="pause" size={14} color="#fff"/>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            {[3,5,8,4,7,9,6,5,8,4,3,6,8,5,3,2].map((h, i) => (
              <span key={i} style={{ width: 2, height: h, background: '#fff', opacity: 0.7, borderRadius: 1 }}/>
            ))}
          </div>
          <span style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', opacity: 0.85 }}>{String(Math.floor(m.duration/60)).padStart(2,'0')}:{String(m.duration%60).padStart(2,'0')}</span>
        </div>
        {m.transcript && <div style={{ fontSize: 12, opacity: 0.85, fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.18)', paddingTop: 6 }}>"{m.transcript}"</div>}
      </div>
    );
  }
  if (m.role === 'system' && m.kind === 'text') {
    return (
      <div style={{ alignSelf: 'flex-start', color: T.textSecondary, fontSize: 13, lineHeight: 1.5, maxWidth: '88%', padding: '4px 4px' }}>
        {m.text}
      </div>
    );
  }
  if (m.role === 'system' && m.kind === 'parsed') {
    return <ParsedReceipt data={m.data} T={T} onConfirm={onConfirm}/>;
  }
  return null;
}

function ParsedReceipt({ data, T, onConfirm }) {
  const asset = ASSETS.find(a => a.id === data.assetId);
  const acc = ACCOUNTS.find(a => a.id === data.accountId);
  const [confirmed, setConfirmed] = u2S(false);
  const isSell = data.type === 'Venta';
  const accent = isSell ? T.negative : T.positive;

  if (confirmed) {
    return (
      <div style={{ alignSelf: 'flex-start', background: T.positiveSoft, border: `1px solid ${T.positive}33`, borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.positive, fontWeight: 500 }}>
        <Icon name="check" size={16}/> Operación registrada
      </div>
    );
  }

  return (
    <div style={{ alignSelf: 'flex-start', background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, maxWidth: '95%', overflow: 'hidden' }}>
      {/* Encabezado tipo recibo */}
      <div style={{ padding: '12px 14px', borderBottom: `1px dashed ${T.borderSubtle}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 14, background: isSell ? T.negativeSoft : T.positiveSoft, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={isSell ? 'arrow-up' : 'arrow-down'} size={14}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, letterSpacing: 0.4, textTransform: 'uppercase' }}>Entendí esto</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{data.type} de {asset.symbol}</div>
        </div>
        <AssetLogo asset={asset} size={32}/>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Field label="Cantidad" value={`${fmt(data.qty, asset.type === 'crypto' ? 4 : 0)} ${asset.symbol}`} T={T}/>
        <Field label="Precio" value={data.priceUSD != null ? `US$${fmt(data.priceUSD, 2)}` : `$${fmt(data.priceARS, 0)}`} T={T} flag={data.autoFilled?.includes('priceUSD') || data.autoFilled?.includes('priceARS') ? 'precio actual' : null}/>
        <Field label="Total" value={fmtMoney(data.total, data.currency)} T={T} bold/>
        <Field label="Cuenta" value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{acc.name} <TagBadge tag={acc.tag} T={T}/></span>} T={T}/>
        <Field label="Cartera" value={<BucketChip bucketId={data.bucketId} T={T} small/>} T={T}/>
        <Field label="Fecha" value={data.date} T={T} flag={data.autoFilled?.includes('date') ? 'hoy' : null}/>
      </div>

      <div style={{ padding: '10px 12px', borderTop: `1px solid ${T.borderSubtle}`, display: 'flex', gap: 6 }}>
        <Btn kind="ghost" size="sm" T={T} icon="edit">Editar</Btn>
        <Btn kind="ghost" size="sm" T={T} icon="x">Cancelar</Btn>
        <div style={{ flex: 1 }}/>
        <Btn kind="primary" size="sm" T={T} icon="check" onClick={() => setConfirmed(true)}>Confirmar</Btn>
      </div>
    </div>
  );
}

function Field({ label, value, T, bold, flag }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
      <span style={{ color: T.textSecondary, fontWeight: 500 }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.textPrimary, fontWeight: bold ? 600 : 500, fontVariantNumeric: 'tabular-nums' }}>
        {flag && <span style={{ fontSize: 9, color: T.accent, background: T.accentSoft, padding: '1px 6px', borderRadius: 3, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>{flag}</span>}
        {value}
      </span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 5. OPORTUNIDADES
// ════════════════════════════════════════════════════════════════
function ScreenOportunidades({ T, hidden, displayCcy, fxRate, onNav }) {
  const [filter, setFilter] = u2S('all');

  // Calcular "score": qué tan cerca está el precio de soporte (0=en soporte, 1=en resistencia)
  const opportunities = u2M(() => {
    return ASSETS.map(a => {
      const price = a.priceUSD != null ? a.priceUSD : a.priceARS;
      const range = a.srHigh - a.srLow;
      const pos = (price - a.srLow) / range; // 0..1
      const distFromLow = ((price - a.srLow) / a.srLow) * 100;
      let signal = null;
      let label = null;
      if (pos < 0.25) { signal = 'buy'; label = 'EN ZONA DE COMPRA'; }
      else if (pos < 0.45) { signal = 'watch'; label = 'CERCA DE SOPORTE'; }
      else if (pos > 0.85) { signal = 'sell'; label = 'EN ZONA DE VENTA'; }
      const heldByUser = HOLDINGS.some(h => h.assetId === a.id);
      return { asset: a, pos, signal, label, distFromLow, heldByUser };
    }).filter(o => o.signal && (filter === 'all' || (filter === 'mine' && o.heldByUser)))
      .sort((a, b) => a.pos - b.pos);
  }, [filter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: T.textPrimary, margin: 0, letterSpacing: -0.4 }}>Oportunidades</h1>
        <p style={{ fontSize: 13, color: T.textSecondary, margin: '4px 0 0', lineHeight: 1.5 }}>Activos cerca de zonas de soporte calculadas automáticamente desde el histórico.</p>
      </div>

      {/* Filtro */}
      <div style={{ display: 'flex', gap: 6, padding: 4, background: T.bgSurface, borderRadius: 10, border: `1px solid ${T.borderSubtle}`, alignSelf: 'flex-start' }}>
        {[['all','Todos'],['mine','Solo míos']].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600,
            background: filter === id ? T.bgElevated : 'transparent',
            color: filter === id ? T.textPrimary : T.textSecondary,
            border: 'none', borderRadius: 6, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {/* Lista de oportunidades */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {opportunities.map(o => (
          <OpportunityCard key={o.asset.id} opp={o} T={T} hidden={hidden} onNav={onNav}/>
        ))}
      </div>

      {/* Footer disclaimer */}
      <div style={{ padding: 12, fontSize: 11, color: T.textMuted, lineHeight: 1.5, borderTop: `1px solid ${T.borderSubtle}`, marginTop: 8 }}>
        Las señales son automáticas basadas en soportes y resistencias del histórico. No son recomendación de inversión.
      </div>
    </div>
  );
}

function OpportunityCard({ opp, T, hidden, onNav }) {
  const { asset, pos, signal, label, heldByUser } = opp;
  const price = asset.priceUSD != null ? asset.priceUSD : asset.priceARS;
  const currency = asset.priceUSD != null ? 'USD' : 'ARS';
  const sigConfig = {
    buy:   { c: T.positive, bg: T.positiveSoft },
    watch: { c: T.warning,  bg: T.warningSoft },
    sell:  { c: T.negative, bg: T.negativeSoft },
  }[signal];

  return (
    <div onClick={() => onNav('asset', asset.id)} style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, padding: 14, cursor: 'pointer' }}>
      {/* Banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: sigConfig.c, background: sigConfig.bg, padding: '4px 8px', borderRadius: 6, letterSpacing: 0.5 }}>
          <Icon name={signal === 'buy' ? 'trend-up' : signal === 'sell' ? 'arrow-up' : 'target'} size={11}/>
          {label}
        </span>
        {heldByUser && <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 500, padding: '2px 6px', background: T.bgBase, borderRadius: 4 }}>Tenés</span>}
      </div>

      {/* Asset row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <AssetLogo asset={asset} size={36}/>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{asset.symbol}</span>
            <span style={{ fontSize: 11, color: T.textSecondary }}>{asset.name}</span>
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{asset.type === 'cedear' ? 'CEDEAR · ARS' : asset.type.toUpperCase()}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(price, currency)}</div>
          <div style={{ fontSize: 11, color: asset.ch24 >= 0 ? T.positive : T.negative, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{asset.ch24 >= 0 ? '+' : ''}{asset.ch24.toFixed(2)}%</div>
        </div>
      </div>

      {/* S/R band */}
      <SRBand asset={asset} pos={pos} T={T} currency={currency}/>
    </div>
  );
}

function SRBand({ asset, pos, T, currency }) {
  return (
    <div>
      <div style={{ position: 'relative', height: 32, background: T.bgBase, borderRadius: 8, overflow: 'hidden' }}>
        {/* gradient zones */}
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${T.positiveSoft} 0%, ${T.positiveSoft} 25%, transparent 25%, transparent 75%, ${T.negativeSoft} 75%, ${T.negativeSoft} 100%)` }}/>
        {/* support / resistance markers */}
        <div style={{ position: 'absolute', left: '25%', top: 0, bottom: 0, width: 1, background: T.positive, opacity: 0.5 }}/>
        <div style={{ position: 'absolute', left: '75%', top: 0, bottom: 0, width: 1, background: T.negative, opacity: 0.5 }}/>
        {/* current price marker */}
        <div style={{ position: 'absolute', left: `calc(${Math.max(2, Math.min(98, pos * 100))}% - 6px)`, top: 4, bottom: 4, width: 12, background: T.textPrimary, borderRadius: 3, boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}/>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: T.textMuted, fontFamily: 'ui-monospace, monospace' }}>
        <span><span style={{ color: T.positive }}>S</span> {fmtMoney(asset.srLow, currency)}</span>
        <span style={{ color: T.textSecondary, fontWeight: 600 }}>actual</span>
        <span><span style={{ color: T.negative }}>R</span> {fmtMoney(asset.srHigh, currency)}</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 6. CUENTAS
// ════════════════════════════════════════════════════════════════
function ScreenCuentas({ T, hidden, displayCcy, fxRate }) {
  const [filter, setFilter] = u2S('all'); // all | A | B

  const accounts = u2M(() => {
    return ACCOUNTS.map(a => {
      const holds = HOLDINGS.filter(h => h.accountId === a.id);
      const valueUSD = holds.reduce((s, h) => s + holdingValueUSD(h), 0);
      const positions = holds.length;
      return { ...a, valueUSD, positions };
    }).filter(a => filter === 'all' || a.tag === filter)
      .sort((a, b) => b.valueUSD - a.valueUSD);
  }, [filter]);

  const totalA = accounts.filter(a => a.tag === 'A').reduce((s, a) => s + a.valueUSD, 0);
  const totalB = accounts.filter(a => a.tag === 'B').reduce((s, a) => s + a.valueUSD, 0);
  const totalAll = totalA + totalB;

  const accIcon = { broker: 'briefcase', exchange: 'coins', wallet: 'wallet', bank: 'bank', cash: 'safe' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: T.textPrimary, margin: 0, letterSpacing: -0.4 }}>Cuentas</h1>
        <Btn kind="soft" size="sm" T={T} icon="plus">Nueva</Btn>
      </div>

      {/* Split A / B con barra visual */}
      <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.textSecondary, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10 }}>Distribución por etiqueta</div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: T.bgBase, marginBottom: 10 }}>
          <div style={{ flex: totalA, background: T.info, transition: 'flex .3s' }}/>
          <div style={{ flex: totalB, background: T.warning, transition: 'flex .3s' }}/>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: T.info }}/>
              <TagBadge tag="A" T={T} label="A · DECLARADO"/>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{hidden ? '••••' : fmtMoney(displayCcy === 'USD' ? totalA : totalA * FX[fxRate], displayCcy)}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{hidden ? '•' : `${((totalA/totalAll)*100).toFixed(1)}%`}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: T.warning }}/>
              <TagBadge tag="B" T={T} label="B · PRIVADO"/>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{hidden ? '••••' : fmtMoney(displayCcy === 'USD' ? totalB : totalB * FX[fxRate], displayCcy)}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{hidden ? '•' : `${((totalB/totalAll)*100).toFixed(1)}%`}</div>
          </div>
        </div>
      </div>

      {/* Filtro */}
      <div style={{ display: 'flex', gap: 6, padding: 4, background: T.bgSurface, borderRadius: 10, border: `1px solid ${T.borderSubtle}`, alignSelf: 'flex-start' }}>
        {[['all','Todas'],['A','A · Declarado'],['B','B · Privado']].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 600,
            background: filter === id ? T.bgElevated : 'transparent',
            color: filter === id ? T.textPrimary : T.textSecondary,
            border: 'none', borderRadius: 6, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {/* Lista */}
      <div style={{ background: T.bgSurface, border: `1px solid ${T.borderSubtle}`, borderRadius: 16, overflow: 'hidden' }}>
        {accounts.map((a, i) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px', borderBottom: i < accounts.length - 1 ? `1px solid ${T.borderSubtle}` : 'none', cursor: 'pointer' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: a.tag === 'A' ? T.infoSoft : T.warningSoft, color: a.tag === 'A' ? T.info : T.warning, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={accIcon[a.kind]} size={18}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{a.name}</span>
                <TagBadge tag={a.tag} T={T}/>
              </div>
              <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 1, textTransform: 'capitalize' }}>{a.kind} · {a.positions} {a.positions === 1 ? 'activo' : 'activos'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{hidden ? '••••' : fmtMoney(displayCcy === 'USD' ? a.valueUSD : a.valueUSD * FX[fxRate], displayCcy)}</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2, fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase' }}>{a.currency}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { ScreenChat, ScreenOportunidades, ScreenCuentas });
