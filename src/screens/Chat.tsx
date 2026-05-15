/**
 * Chat para registrar operaciones por lenguaje natural.
 *
 * Decisión clave del scope: SOLO texto. El diseño tenía botón de mic + audio
 * messages, pero el usuario explícitamente lo descartó (con texto va bien
 * para empezar). Si vuelve, agregamos un mic-icon → speech-to-text → mismo
 * pipeline; los placeholders de UI ya están preparados.
 *
 * Pipeline:
 *  1. Usuario escribe "compré 0.05 BTC a 95400 en Binance"
 *  2. Stub local hace pattern-match básico (amount + ticker + price + venue)
 *  3. ParsedReceipt muestra el "recibo" con estado: pending | confirmed | cancelled
 *  4. Confirmar → `createTransaction()` → la tx aparece en Inicio/Asset/etc.
 *
 * Phase 2 reemplaza el stub por una llamada a Anthropic Messages API
 * (con tool_use) para parsing real. La UI no cambia.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { fmt, fmtMoney, fmtTime } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { TagBadge } from '@/components/ui/TagBadge';
import { BucketChip } from '@/components/ui/BucketChip';
import { useAccounts, useAssets } from '@/lib/db/queries';
import { usePortfolioMetrics, usePriceMap, useRiskMetrics, useLiquidityMetrics } from '@/lib/db/derived';
import { createAsset, createTransaction, createTransfer, deleteTransaction } from '@/lib/db/mutations';
import { CEDEARS } from '@/data/cedears';
import { hasAI, interpretMessage, type ChatIntent } from '@/lib/api/chat-ai';
import type { ExtractedTransactionData, ExtractedTransferData } from '@/lib/api/anthropic';
import { TxForm } from '@/components/forms/TxForm';
import type { Account, Asset, PortfolioBucket, Currency, TxKind } from '@/lib/types';

// ─── Modelos del chat ──────────────────────────────────────────────────────

/** Estado del recibo dentro del flujo. */
type ReceiptStatus = 'pending' | 'confirmed' | 'cancelled' | 'error';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  /** Si el mensaje tiene un recibo de operación. */
  parsed?: ParsedTx;
  /** Si el mensaje tiene un recibo de transferencia/retiro. */
  parsedTransfer?: ParsedTransfer;
  /** Estado del recibo. */
  status?: ReceiptStatus;
  /** Mensaje de error si `status === 'error'`. */
  errorText?: string;
  /** ID de la tx persistida (para undo de operaciones simples). */
  persistedTxId?: string;
  /** IDs de txs persistidas (para undo de transferencias — pueden ser 2). */
  persistedTxIds?: string[];
}

interface ParsedTx {
  kind: TxKind;
  assetId: string;
  qty: number;
  unitPrice?: number;
  priceCurrency: Currency;
  total: number;
  totalCurrency: Currency;
  accountId: string;
  bucket: PortfolioBucket;
  date: string;
  /** Fields que llenó el sistema (para mostrar chips "auto"). */
  autoFilled: string[];
}

interface ParsedTransfer {
  assetId: string;
  qty: number;
  fromAccountId: string;
  /** Ausente = retiro puro (sale del portfolio). */
  toAccountId?: string;
  bucket: PortfolioBucket;
  date: string;
}

// ─── Stub de parser local ──────────────────────────────────────────────────

/**
 * Parser ingenuo en regex — solo cubre los casos más comunes:
 *  "compré 0.05 BTC a 95400 en Binance"
 *  "vendí 10 NVDA a 8200"
 *
 * Reemplazar por Anthropic Messages API en Phase 2 (ver SPEC §7).
 */
async function stubParse(
  text: string,
  assets: Asset[],
  accounts: Account[],
): Promise<ParsedTx | null> {
  const lower = text.toLowerCase();
  const isBuy = /\b(comp|compr|compré|compre)/.test(lower);
  const isSell = /\b(vend|vendí|vende|vendi)/.test(lower);
  if (!isBuy && !isSell) return null;

  // Cantidad + ticker
  const m = text.match(/(\d+(?:[.,]\d+)?)\s+([a-zA-Z]+)/);
  if (!m) return null;
  const qty = parseFloat(m[1].replace(',', '.'));
  const tickerRaw = m[2].toUpperCase();
  let asset: Asset | undefined = assets.find((a) => a.ticker === tickerRaw);
  if (!asset) {
    const cedear = CEDEARS.find((c) => c.ticker === tickerRaw);
    if (cedear) {
      try {
        asset = await createAsset({
          ticker: cedear.ticker,
          name: cedear.name,
          type: 'cedear',
          currency: 'ARS',
          cedearRatio: cedear.ratio,
          underlyingTicker: cedear.underlyingTicker,
        });
      } catch {
        return null;
      }
    }
  }
  if (!asset) return null;

  // Precio (a XYZ, "a 95400")
  const priceMatch = text.match(/a\s+(\d+(?:[.,]\d+)?)/i);
  const unitPrice = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : undefined;

  // Cuenta (opcional). Si el texto menciona una cuenta, usamos esa. Si no,
  // tomamos la primera del mismo `kind` que el asset (cripto → exchange/wallet,
  // CEDEAR/bono → broker), para que el default sea razonable.
  const accountMatch = accounts.find((a) =>
    new RegExp(`\\b${escapeRegex(a.name)}\\b`, 'i').test(text),
  );
  const fallback = pickDefaultAccount(asset, accounts);
  const account = accountMatch ?? fallback;
  if (!account) return null;

  const priceCurrency: Currency = asset.currency;
  const total = unitPrice ? qty * unitPrice : 0;
  const autoFilled: string[] = ['date'];
  if (!unitPrice) autoFilled.push('priceUSD');
  if (!accountMatch) autoFilled.push('account');

  return {
    kind: isBuy ? 'buy' : 'sell',
    assetId: asset.id,
    qty,
    unitPrice,
    priceCurrency,
    total,
    totalCurrency: priceCurrency,
    accountId: account.id,
    bucket: 'largo', // default — el usuario puede cambiarlo en el recibo
    date: new Date().toISOString(),
    autoFilled,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickDefaultAccount(asset: Asset, accounts: Account[]): Account | undefined {
  if (accounts.length === 0) return undefined;
  // Cripto → preferimos exchange o wallet
  if (asset.type === 'crypto') {
    return (
      accounts.find((a) => a.kind === 'exchange') ??
      accounts.find((a) => a.kind === 'wallet') ??
      accounts[0]
    );
  }
  // CEDEAR / bono / etf / fondo → broker
  return accounts.find((a) => a.kind === 'broker') ?? accounts[0];
}

// ─── Pantalla ──────────────────────────────────────────────────────────────

export function Chat() {
  const accounts = useAccounts();
  const assets = useAssets();
  const prices = usePriceMap();
  const portfolio = usePortfolioMetrics();
  const risk = useRiskMetrics();
  const liquidity = useLiquidityMetrics();
  const location = useLocation();
  const navigate = useNavigate();
  // Prefill cuando llegamos desde "Operar TICKER" en Asset.
  const prefillTicker = (location.state as { prefill?: string } | null)?.prefill;
  const [input, setInput] = useState(prefillTicker ? `compré X ${prefillTicker} a Y` : '');
  const [isThinking, setIsThinking] = useState(false);
  // Modo del input: 'chat' (default, lenguaje natural) o 'form' (campos
  // estructurados — alternativa cuando el chat falla o se quiere precisión).
  const [mode, setMode] = useState<'chat' | 'form'>('chat');
  // Si llegamos con prefill de "Operar TICKER", precargamos el activo en el form.
  const prefillAsset = prefillTicker
    ? assets?.find((a) => a.ticker === prefillTicker)
    : undefined;
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: hasAI
        ? 'Decime qué hacemos. "compré btc ayer", "metí 2k en apple", "cuánto tengo?", "simulame 5k por mes"…'
        : 'Contame qué operaste. Por ejemplo: "compré 0.05 BTC a 95400 en Binance".',
      timestamp: new Date().toISOString(),
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al fondo cuando llega un mensaje nuevo.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  /**
   * Pipeline:
   *  1. Mostrar mensaje del usuario.
   *  2. Si hay Anthropic key, pedir interpretación (intent + datos).
   *  3. Resolver intent: tx receipt / query / simulación / search.
   *  4. Fallback al regex stub si Anthropic falla o no está configurado.
   */
  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || !accounts || !assets) return;

    const userMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');

    // Camino 1: AI si está disponible.
    if (hasAI) {
      setIsThinking(true);
      try {
        const intent = await interpretMessage(trimmed, {
          assets,
          accounts,
          todayISO: new Date().toISOString().slice(0, 10),
        });
        const replyMsg = await handleIntent(intent);
        setMessages((m) => [...m, replyMsg]);
      } catch (err) {
        // Si Anthropic falla (rate limit, key inválida, red), caemos al stub.
        console.warn('[chat] Anthropic falló, usando stub:', err);
        await addStubReply(trimmed);
      } finally {
        setIsThinking(false);
      }
      return;
    }

    // Camino 2: stub local.
    await addStubReply(trimmed);
  }

  /**
   * Convierte un `ChatIntent` a un mensaje del asistente. Para `create_transaction`
   * resuelve ticker→assetId y account_name→accountId; si falta info adjunta una
   * pregunta de slot-filling. Para queries genera la respuesta inline.
   */
  async function handleIntent(intent: ChatIntent): Promise<ChatMessage> {
    const ts = new Date().toISOString();
    const id = `m-${Date.now()}`;

    if (intent.type === 'create_transaction') {
      const parsed = await resolveTransactionData(intent.data, assets ?? [], accounts ?? []);
      // Si no pudimos resolver el ticker (no está en library ni en seeds), avisamos.
      if (!parsed && intent.data.ticker) {
        return {
          id,
          role: 'assistant',
          text:
            intent.assistantMessage +
            `\n\nNo encontré "${intent.data.ticker.toUpperCase()}" en tu biblioteca. Buscalo desde la lupita arriba para agregarlo y volvé a intentar.`,
          timestamp: ts,
        };
      }
      return {
        id,
        role: 'assistant',
        text: intent.assistantMessage,
        timestamp: ts,
        parsed: parsed ?? undefined,
        status: parsed ? 'pending' : undefined,
      };
    }
    if (intent.type === 'create_transfer') {
      const parsedTransfer = resolveTransferData(intent.data, assets ?? [], accounts ?? []);
      if (!parsedTransfer) {
        return {
          id,
          role: 'assistant',
          text: intent.assistantMessage + (intent.missingFields.length
            ? ''
            : '\n\nNo pude resolver el activo o la cuenta. Chequeá que estén cargados.'),
          timestamp: ts,
        };
      }
      return {
        id,
        role: 'assistant',
        text: intent.assistantMessage,
        timestamp: ts,
        parsedTransfer,
        status: 'pending',
      };
    }
    if (intent.type === 'query_portfolio') {
      const answer = answerQuery(intent.query, intent.filter, {
        portfolio,
        risk,
        liquidity,
      });
      return {
        id,
        role: 'assistant',
        text: `${intent.assistantMessage}\n\n${answer}`,
        timestamp: ts,
      };
    }
    if (intent.type === 'run_simulation') {
      // Navegamos al simulador. El usuario pierde el contexto del chat
      // pero entra al simulador con sus inputs ya cargados.
      navigate('/simulador');
      return {
        id,
        role: 'assistant',
        text:
          intent.assistantMessage ||
          'Te abrí el simulador con tus parámetros. Cargá el resto y mirá la proyección.',
        timestamp: ts,
      };
    }
    if (intent.type === 'search_asset') {
      return {
        id,
        role: 'assistant',
        text: `${intent.assistantMessage}\n\nUsá la lupita arriba para buscar "${intent.query}".`,
        timestamp: ts,
      };
    }
    return { id, role: 'assistant', text: intent.assistantMessage, timestamp: ts };
  }

  /** Fallback al regex local si no hay AI o falla. */
  async function addStubReply(trimmed: string) {
    if (!assets || !accounts) return;
    const parsed = await stubParse(trimmed, assets, accounts);
    setMessages((m) => [
      ...m,
      {
        id: `m-${Date.now() + 1}`,
        role: 'assistant',
        text: parsed
          ? 'Listo. Revisá el recibo y confirmá:'
          : 'No pude entenderlo. Probá: "compré 0.05 BTC a 95400 en Binance".',
        timestamp: new Date().toISOString(),
        parsed: parsed ?? undefined,
        status: parsed ? 'pending' : undefined,
      },
    ]);
  }

  /**
   * Confirma un recibo: persiste a Dexie y marca el mensaje como confirmed.
   * El optimistic flow + try/catch cubre el caso "tx falló" — guardamos el
   * error en el mensaje y mostramos un retry.
   */
  const handleConfirm = useCallback(async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.parsed) return;
    const p = msg.parsed;
    if (p.unitPrice == null) {
      // Edge case: no pudimos parsear precio. Forzar al usuario a editar
      // antes de persistir (por ahora no tenemos editor, así que cancelamos
      // y pedimos reintento).
      setMessages((all) =>
        all.map((m) =>
          m.id === msgId
            ? { ...m, status: 'error', errorText: 'Falta el precio. Editá el mensaje y reenviá.' }
            : m,
        ),
      );
      return;
    }

    try {
      const persisted = await createTransaction({
        kind: p.kind,
        assetId: p.assetId,
        accountId: p.accountId,
        bucket: p.bucket,
        qty: p.qty,
        unitPrice: p.unitPrice,
        priceCurrency: p.priceCurrency,
        date: p.date,
        source: 'chat',
      });
      setMessages((all) =>
        all.map((m) =>
          m.id === msgId ? { ...m, status: 'confirmed', persistedTxId: persisted.id } : m,
        ),
      );
    } catch (err) {
      setMessages((all) =>
        all.map((m) =>
          m.id === msgId
            ? {
                ...m,
                status: 'error',
                errorText: err instanceof Error ? err.message : 'Error desconocido',
              }
            : m,
        ),
      );
    }
  }, [messages]);

  const handleCancel = useCallback((msgId: string) => {
    setMessages((all) =>
      all.map((m) => (m.id === msgId ? { ...m, status: 'cancelled' } : m)),
    );
  }, []);

  const handleConfirmTransfer = useCallback(async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.parsedTransfer) return;
    const p = msg.parsedTransfer;
    try {
      const txs = await createTransfer({
        assetId: p.assetId,
        fromAccountId: p.fromAccountId,
        toAccountId: p.toAccountId,
        bucket: p.bucket,
        qty: p.qty,
        unitPrice: 1,          // para transfers no rastreamos precio unitario
        priceCurrency: 'USD',
        date: `${p.date}T12:00:00.000Z`,
        source: 'chat',
      });
      setMessages((all) =>
        all.map((m) =>
          m.id === msgId
            ? { ...m, status: 'confirmed', persistedTxIds: txs.map((t) => t.id) }
            : m,
        ),
      );
    } catch (err) {
      setMessages((all) =>
        all.map((m) =>
          m.id === msgId
            ? { ...m, status: 'error', errorText: err instanceof Error ? err.message : 'Error' }
            : m,
        ),
      );
    }
  }, [messages]);

  const handleUndoTransfer = useCallback(async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.persistedTxIds?.length) return;
    try {
      for (const txId of msg.persistedTxIds) await deleteTransaction(txId);
      setMessages((all) =>
        all.map((m) =>
          m.id === msgId ? { ...m, status: 'cancelled', persistedTxIds: undefined } : m,
        ),
      );
    } catch (err) {
      console.error('No se pudo deshacer la transferencia', err);
    }
  }, [messages]);

  /**
   * Deshace una tx ya confirmada. Borra de Dexie + marca el mensaje como
   * cancelled. Útil cuando el usuario se da cuenta tarde de un error de tipeo
   * (ej. precio cargado en escala equivocada).
   */
  const handleUndo = useCallback(async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.persistedTxId) return;
    try {
      await deleteTransaction(msg.persistedTxId);
      setMessages((all) =>
        all.map((m) =>
          m.id === msgId
            ? { ...m, status: 'cancelled', persistedTxId: undefined }
            : m,
        ),
      );
    } catch (err) {
      console.error('No se pudo deshacer la tx', err);
    }
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      {/* Tabs Chat / Form (SPEC §5.2) */}
      <div className="flex flex-none gap-1 rounded-[10px] border border-border-subtle bg-bg-surface p-1 self-start mb-2 ml-1">
        <button
          type="button"
          onClick={() => setMode('chat')}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
            mode === 'chat'
              ? 'bg-bg-elevated text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => setMode('form')}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
            mode === 'form'
              ? 'bg-bg-elevated text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          Form
        </button>
      </div>

      {mode === 'form' ? (
        // ─── Form mode: alternativa estructurada ──────────────────────────
        <div className="flex-1 overflow-y-auto pb-3">
          <TxForm
            mode={{
              kind: 'create',
              initial: prefillAsset ? { assetId: prefillAsset.id } : undefined,
            }}
            onSuccess={() => {
              // Vuelve al chat con un mensaje de confirmación amigable.
              setMode('chat');
              setMessages((m) => [
                ...m,
                {
                  id: `m-${Date.now()}`,
                  role: 'assistant',
                  text: '✓ Operación creada desde el form.',
                  timestamp: new Date().toISOString(),
                },
              ]);
            }}
          />
        </div>
      ) : (
        // ─── Chat mode (default) ──────────────────────────────────────────
        <>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pb-3">
            {messages.map((msg) => (
              <Message
                key={msg.id}
                msg={msg}
                assets={assets ?? []}
                accounts={accounts ?? []}
                marketPrice={msg.parsed ? prices?.get(msg.parsed.assetId)?.price : undefined}
                onConfirm={() => handleConfirm(msg.id)}
                onCancel={() => handleCancel(msg.id)}
                onUndo={() => handleUndo(msg.id)}
                onConfirmTransfer={() => handleConfirmTransfer(msg.id)}
                onUndoTransfer={() => handleUndoTransfer(msg.id)}
              />
            ))}
            {isThinking && (
              <div className="flex items-center gap-2 px-1 text-[12px] text-text-muted">
                <span className="inline-flex gap-0.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted" />
                  <span
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted"
                    style={{ animationDelay: '0.15s' }}
                  />
                  <span
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted"
                    style={{ animationDelay: '0.3s' }}
                  />
                </span>
                Pensando…
              </div>
            )}
          </div>

          {/* Composer (text-only — sin mic, decisión de scope) */}
          <div className="flex items-center gap-2 border-t border-border-subtle bg-bg-base px-3 py-3 safe-bottom">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            hasAI
              ? 'Comprá BTC, vende NVDA, ¿cuánto tengo? simulame…'
              : 'Compré 0.05 BTC a 95400 en Binance'
          }
          className={cn(
            'h-11 flex-1 rounded-xl border border-border-subtle bg-bg-surface px-3.5 text-sm text-text-primary',
            'placeholder:text-text-muted focus:border-accent focus:outline-none',
          )}
          autoComplete="off"
          autoFocus
        />
            <Button
              variant="primary"
              size="md"
              onClick={handleSend}
              disabled={!input.trim() || isThinking}
              aria-label="Enviar mensaje"
            >
              <Icon name="send" size={16} />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Resolución de intent → ParsedTx ──────────────────────────────────────

/**
 * Convierte los datos extraídos por el LLM a un `ParsedTx` listo para mostrar
 * en el recibo. Resuelve ticker → assetId y accountName → accountId con match
 * laxo (case-insensitive). Si falta info crítica (sin ticker, sin qty/amount,
 * sin precio), devuelve null y el chat muestra solo el `assistantMessage`
 * (que el LLM ya armó con la pregunta de slot-filling).
 */
async function resolveTransactionData(
  data: ExtractedTransactionData,
  assets: Asset[],
  accounts: Account[],
): Promise<ParsedTx | null> {
  if (!data.kind || !data.ticker) return null;

  // Match de asset por ticker (UPPER, exact). Si no está en la biblioteca,
  // intentamos auto-crearlo desde el seed de CEDEARs — así el flujo
  // "compré 1 MELI" funciona aunque MELI no esté cargado todavía.
  const ticker = data.ticker.toUpperCase();
  let asset = assets.find((a) => a.ticker.toUpperCase() === ticker);
  if (!asset) {
    const cedear = CEDEARS.find((c) => c.ticker.toUpperCase() === ticker);
    if (cedear) {
      try {
        asset = await createAsset({
          ticker: cedear.ticker,
          name: cedear.name,
          type: 'cedear',
          currency: 'ARS',
          cedearRatio: cedear.ratio,
          underlyingTicker: cedear.underlyingTicker,
        });
      } catch {
        return null;
      }
    }
  }
  if (!asset) return null;

  // qty: si vino directo úsala. Si vino amountUSD y precio, derivá. Si solo
  // vino amountUSD sin precio, usá el precio actual del cache (lo agrega el
  // resolver del receipt — acá dejamos qty=0 y unitPrice=undefined para que
  // ParsedReceipt complete con autoFilled).
  let qty = data.qty;
  let unitPrice = data.unitPrice;
  if (qty == null && data.amountUSD != null && unitPrice != null && unitPrice > 0) {
    qty = data.amountUSD / unitPrice;
  }
  if (qty == null) return null;

  // Account: por nombre, fallback al picker default por tipo de asset.
  let account: Account | undefined;
  if (data.accountName) {
    const lname = data.accountName.toLowerCase();
    account = accounts.find((a) => a.name.toLowerCase() === lname);
  }
  if (!account) account = pickDefaultAccount(asset, accounts);
  if (!account) return null;

  const priceCurrency: Currency =
    (data.priceCurrency as Currency | undefined) ?? asset.currency;
  const total = unitPrice ? qty * unitPrice : 0;

  // autoFilled: marcamos los campos que el LLM dejó vacíos y rellenó el
  // sistema (precio actual, fecha hoy, cuenta default). El receipt los
  // muestra con chip "auto" para transparencia.
  const autoFilled: string[] = [];
  if (!data.date) autoFilled.push('date');
  if (data.unitPrice == null) autoFilled.push('priceUSD');
  if (!data.accountName) autoFilled.push('account');

  return {
    kind: data.kind as TxKind,
    assetId: asset.id,
    qty,
    unitPrice,
    priceCurrency,
    total,
    totalCurrency: priceCurrency,
    accountId: account.id,
    bucket: (data.bucket as PortfolioBucket | undefined) ?? 'largo',
    date: data.date ?? new Date().toISOString().slice(0, 10),
    autoFilled,
  };
}

// ─── Resolución de transfer intent ────────────────────────────────────────

function resolveTransferData(
  data: ExtractedTransferData,
  assets: Asset[],
  accounts: Account[],
): ParsedTransfer | null {
  if (!data.ticker || data.amount == null) return null;

  const ticker = data.ticker.toUpperCase();
  const asset = assets.find((a) => a.ticker.toUpperCase() === ticker);
  if (!asset) return null;

  // Cuenta de origen: obligatoria
  const fromAccount = data.fromAccountName
    ? accounts.find((a) => a.name.toLowerCase() === data.fromAccountName!.toLowerCase())
    : undefined;
  if (!fromAccount) return null;

  // Cuenta de destino: opcional (ausente = retiro puro)
  const toAccount = data.toAccountName
    ? accounts.find((a) => a.name.toLowerCase() === data.toAccountName!.toLowerCase())
    : undefined;

  return {
    assetId: asset.id,
    qty: data.amount,
    fromAccountId: fromAccount.id,
    toAccountId: toAccount?.id,
    bucket: data.bucket ?? 'medio',
    date: data.date ?? new Date().toISOString().slice(0, 10),
  };
}

// ─── Respuestas a queries del portfolio ───────────────────────────────────

/**
 * Genera una respuesta corta para `query_portfolio`. Mantenemos las respuestas
 * en una sola línea para que se sientan "casuales" en el chat. Si las métricas
 * aún no cargaron, devolvemos un mensaje gris.
 */
function answerQuery(
  query: 'total' | 'by_type' | 'by_account' | 'idle' | 'pnl',
  filter: string | undefined,
  ctx: {
    portfolio: import('@/lib/metrics').PortfolioMetrics | undefined;
    risk: import('@/lib/metrics').RiskMetrics | undefined;
    liquidity: import('@/lib/metrics').LiquidityMetrics | undefined;
  },
): string {
  const { portfolio, risk, liquidity } = ctx;
  if (!portfolio) return '_(Cargando datos…)_';

  switch (query) {
    case 'total':
      return `Tenés **${fmtMoney(portfolio.totalValueUSD, 'USD')}** en total. Invertiste ${fmtMoney(portfolio.totalInvestedUSD, 'USD')}, así que estás ${portfolio.totalPnLUSD >= 0 ? '+' : ''}${fmtMoney(portfolio.totalPnLUSD, 'USD')} (${portfolio.performancePct >= 0 ? '+' : ''}${portfolio.performancePct.toFixed(1)}%).`;
    case 'pnl':
      return `Tu PnL: ${portfolio.totalPnLUSD >= 0 ? '+' : ''}${fmtMoney(portfolio.totalPnLUSD, 'USD')} (${portfolio.performancePct >= 0 ? '+' : ''}${portfolio.performancePct.toFixed(1)}%) sobre ${fmtMoney(portfolio.totalInvestedUSD, 'USD')} invertidos.`;
    case 'idle':
      if (!liquidity) return '_(Calculando…)_';
      return `Tenés **${fmtMoney(liquidity.idleCashUSD, 'USD')}** sin generar rendimiento (${liquidity.idlePct.toFixed(1)}% del portfolio).`;
    case 'by_type': {
      if (!risk) return '_(Calculando…)_';
      const target = (filter ?? '').toLowerCase();
      if (target.includes('crypto') || target.includes('cripto')) {
        return `Cripto = ${risk.cryptoExposurePct.toFixed(1)}% del portfolio.`;
      }
      if (target.includes('stable')) {
        return `Stables = ${risk.stableExposurePct.toFixed(1)}% del portfolio.`;
      }
      if (target.includes('cedear') || target.includes('etf') || target.includes('acci')) {
        return `Acciones (CEDEAR + ETF + stocks) = ${risk.equityExposurePct.toFixed(1)}% del portfolio.`;
      }
      return `Distribución: cripto ${risk.cryptoExposurePct.toFixed(1)}% · stables ${risk.stableExposurePct.toFixed(1)}% · acciones ${risk.equityExposurePct.toFixed(1)}% · bonos ${risk.bondExposurePct.toFixed(1)}% · cash ${risk.cashExposurePct.toFixed(1)}%.`;
    }
    case 'by_account':
      return `Para detalle por cuenta, abrí la pestaña Cuentas — tenés el split A/B y el valor por cada una.`;
    default:
      return '_(Sin info para esta consulta.)_';
  }
}

// ─── Sub-componentes ───────────────────────────────────────────────────────

function Message({
  msg,
  assets,
  accounts,
  marketPrice,
  onConfirm,
  onCancel,
  onUndo,
  onConfirmTransfer,
  onUndoTransfer,
}: {
  msg: ChatMessage;
  assets: Asset[];
  accounts: Account[];
  marketPrice?: number;
  onConfirm: () => void;
  onCancel: () => void;
  onUndo: () => void;
  onConfirmTransfer: () => void;
  onUndoTransfer: () => void;
}) {
  const isUser = msg.role === 'user';
  const time = fmtTime(new Date(msg.timestamp));

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm',
          isUser
            ? 'bg-accent text-white'
            : 'bg-bg-surface text-text-primary border border-border-subtle',
        )}
      >
        {msg.text}
      </div>
      {msg.parsed && (
        <ParsedReceipt
          parsed={msg.parsed}
          status={msg.status ?? 'pending'}
          errorText={msg.errorText}
          assets={assets}
          accounts={accounts}
          marketPrice={marketPrice}
          canUndo={!!msg.persistedTxId && msg.status === 'confirmed'}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onUndo={onUndo}
        />
      )}
      {msg.parsedTransfer && (
        <TransferReceipt
          parsed={msg.parsedTransfer}
          status={msg.status ?? 'pending'}
          errorText={msg.errorText}
          assets={assets}
          accounts={accounts}
          canUndo={!!msg.persistedTxIds?.length && msg.status === 'confirmed'}
          onConfirm={onConfirmTransfer}
          onCancel={onCancel}
          onUndo={onUndoTransfer}
        />
      )}
      <div className="px-1 font-mono text-[10px] text-text-muted">{time}</div>
    </div>
  );
}

function ParsedReceipt({
  parsed,
  status,
  errorText,
  assets,
  accounts,
  marketPrice,
  canUndo,
  onConfirm,
  onCancel,
  onUndo,
}: {
  parsed: ParsedTx;
  status: ReceiptStatus;
  errorText?: string;
  assets: Asset[];
  accounts: Account[];
  /** Precio actual de mercado en moneda nativa (USD para cripto/ETF, ARS para CEDEAR). */
  marketPrice?: number;
  /** Si está en true, muestra botón "Deshacer" en estado confirmed. */
  canUndo: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onUndo: () => void;
}) {
  const asset = assets.find((a) => a.id === parsed.assetId);
  const account = accounts.find((a) => a.id === parsed.accountId);
  if (!asset || !account) return null;

  const decimals = asset.type === 'crypto' ? 4 : 0;
  const priceLabel =
    parsed.unitPrice != null
      ? fmtMoney(parsed.unitPrice, parsed.priceCurrency)
      : '—';

  // Cuando la tx ya está confirmada o cancelada, el recibo se "achica" a un
  // estado de read-only para que la conversación quede como historial limpio.
  const readonly = status === 'confirmed' || status === 'cancelled';

  // Detectar precio atípico: si difiere >20% del mercado, hay altísimas
  // chances de que sea un error de tipeo (ej. "20 SPY a 3000" cuando SPY
  // vale 587, o agarrar la escala equivocada). Mostramos un warning visible
  // pero NO bloqueamos — el usuario decide.
  const deviation = computePriceDeviation(parsed.unitPrice, marketPrice);

  return (
    <div
      className={cn(
        'w-full max-w-[85%] rounded-2xl border bg-bg-surface p-3.5 transition-opacity',
        readonly ? 'border-border-subtle/60 opacity-70' : 'border-border-subtle',
        status === 'error' && 'border-negative/40',
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Recibo · {parsed.kind === 'buy' ? 'Compra' : parsed.kind === 'sell' ? 'Venta' : 'Yield'}
          {status === 'confirmed' && (
            <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-positive/[0.14] px-1.5 py-0.5 text-positive">
              <Icon name="check" size={10} /> guardada
            </span>
          )}
          {status === 'cancelled' && (
            <span className="ml-2 rounded bg-text-muted/15 px-1.5 py-0.5 text-text-muted">
              cancelada
            </span>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Field label="Cantidad" value={`${fmt(parsed.qty, decimals)} ${asset.ticker}`} />
        <Field
          label="Precio"
          value={priceLabel}
          flag={parsed.autoFilled.includes('priceUSD') ? 'precio actual' : null}
        />
        <Field label="Total" value={fmtMoney(parsed.total, parsed.totalCurrency)} bold />
        <Field
          label="Cuenta"
          value={
            <span className="inline-flex items-center gap-1.5">
              {account.name} <TagBadge tag={account.tag} />
            </span>
          }
          flag={parsed.autoFilled.includes('account') ? 'auto' : null}
        />
        <Field label="Cartera" value={<BucketChip bucket={parsed.bucket} small />} />
        <Field
          label="Fecha"
          value={new Date(parsed.date).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
          flag={parsed.autoFilled.includes('date') ? 'hoy' : null}
        />
      </div>
      {status === 'error' && errorText && (
        <div className="mt-2 rounded-md bg-negative/[0.12] px-2 py-1.5 text-[11px] text-negative">
          {errorText}
        </div>
      )}
      {deviation && !readonly && (
        <div className="mt-2 rounded-md bg-warning/[0.14] px-2 py-1.5 text-[11px] text-warning">
          ⚠️ Precio atípico: difiere{' '}
          <strong>{deviation.pctText}</strong> del mercado actual (
          {fmtMoney(deviation.market, parsed.priceCurrency)}). Revisá la escala
          o la moneda antes de confirmar.
        </div>
      )}
      {!readonly && (
        <div className="mt-3 flex gap-2">
          <Button variant="ghost" size="sm" full onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" full onClick={onConfirm} leftIcon="check">
            {status === 'error' ? 'Reintentar' : 'Confirmar'}
          </Button>
        </div>
      )}
      {canUndo && (
        <div className="mt-3">
          <Button variant="danger" size="sm" full onClick={onUndo} leftIcon="x">
            Deshacer
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Calcula la desviación porcentual entre `unitPrice` (lo que cargó el usuario)
 * y `marketPrice` (lo que reporta el polling). Si la diferencia es < 20%,
 * devuelve null — no vale la pena mostrar warning para fluctuaciones normales.
 *
 * Si no tenemos `marketPrice` (asset sin polling — ej. CEDEAR), no warning:
 * mejor falso negativo que falso positivo molesto.
 */
function computePriceDeviation(
  unitPrice: number | undefined,
  marketPrice: number | undefined,
): { pct: number; pctText: string; market: number } | null {
  if (unitPrice == null || marketPrice == null || marketPrice === 0) return null;
  const pct = ((unitPrice - marketPrice) / marketPrice) * 100;
  if (Math.abs(pct) < 20) return null;
  const sign = pct > 0 ? '+' : '';
  return {
    pct,
    pctText: `${sign}${pct.toFixed(0)}%`,
    market: marketPrice,
  };
}

// ─── Recibo de transferencia/retiro ───────────────────────────────────────

function TransferReceipt({
  parsed,
  status,
  errorText,
  assets,
  accounts,
  canUndo,
  onConfirm,
  onCancel,
  onUndo,
}: {
  parsed: ParsedTransfer;
  status: ReceiptStatus;
  errorText?: string;
  assets: Asset[];
  accounts: Account[];
  canUndo: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onUndo: () => void;
}) {
  const asset = assets.find((a) => a.id === parsed.assetId);
  const fromAccount = accounts.find((a) => a.id === parsed.fromAccountId);
  const toAccount = accounts.find((a) => a.id === parsed.toAccountId);

  const isRetiro = !parsed.toAccountId;
  const isDone = status === 'confirmed' || status === 'cancelled';

  return (
    <div className="w-full max-w-[85%] overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface text-[13px]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-elevated px-3.5 py-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-info/[0.14] text-info">
          <Icon name="arrow-up" size={13} />
        </div>
        <span className="font-semibold text-text-primary">
          {isRetiro ? 'Retiro' : 'Transferencia'}
        </span>
        {status === 'confirmed' && (
          <span className="ml-auto text-[11px] font-medium text-positive">✓ Registrado</span>
        )}
        {status === 'cancelled' && (
          <span className="ml-auto text-[11px] text-text-muted">Cancelado</span>
        )}
        {status === 'error' && (
          <span className="ml-auto text-[11px] text-negative">Error</span>
        )}
      </div>

      {/* Detalle */}
      <div className="space-y-1.5 px-3.5 py-3">
        <ReceiptRow label="Activo" value={asset ? `${asset.ticker} — ${asset.name}` : parsed.assetId} />
        <ReceiptRow label="Cantidad" value={fmt(parsed.qty, 4)} />
        <ReceiptRow label="Desde" value={fromAccount?.name ?? parsed.fromAccountId} />
        <ReceiptRow
          label="Hacia"
          value={toAccount?.name ?? (isRetiro ? 'Externo (fuera del portfolio)' : '—')}
        />
        <ReceiptRow label="Fecha" value={parsed.date} />
      </div>

      {/* Acciones */}
      {!isDone && (
        <div className="flex gap-2 border-t border-border-subtle px-3.5 py-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-border-subtle py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-bg-elevated"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-accent py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Confirmar
          </button>
        </div>
      )}
      {canUndo && (
        <div className="border-t border-border-subtle px-3.5 py-2">
          <button
            type="button"
            onClick={onUndo}
            className="text-[11px] text-text-muted underline underline-offset-2 hover:text-text-secondary"
          >
            Deshacer
          </button>
        </div>
      )}
      {status === 'error' && errorText && (
        <div className="border-t border-border-subtle px-3.5 py-2 text-[11px] text-negative">
          {errorText}
        </div>
      )}
    </div>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className="text-right font-medium text-text-primary">{value}</span>
    </div>
  );
}
