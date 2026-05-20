/**
 * Cliente Anthropic Messages API + tool definitions para el chat.
 *
 * Diseño:
 *  - Una sola función `interpretMessage(text, ctx)` que pide al LLM clasificar
 *    intent + extraer datos. Devuelve `ChatIntent` (forma cerrada).
 *  - Si no hay `VITE_ANTHROPIC_API_KEY`, exponemos `hasAnthropic = false` y
 *    el caller cae al regex stub.
 *  - Browser usage: SDK con `dangerouslyAllowBrowser: true` (POC). En
 *    producción el call debería ir por un backend proxy para no exponer
 *    la key — está documentado en SPEC §7.
 *
 * Tools que ofrecemos al modelo:
 *  - `create_transaction`: alta de tx (la principal)
 *  - `query_portfolio`: responde con métrica (total, por tipo, por cuenta)
 *  - `run_simulation`: abre el simulador con inputs prefijados
 *  - `search_asset`: busca un activo
 *
 * El modelo decide cuál (o ninguna). Si extrae datos parciales, devuelve
 * `missingFields` y `assistantMessage` con la pregunta de slot-filling.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Account, Asset } from '@/lib/types';

// ─── Tipos públicos ────────────────────────────────────────────────────────

export type ChatIntent =
  | { type: 'unknown'; assistantMessage: string }
  | {
      type: 'create_transaction';
      data: ExtractedTransactionData;
      missingFields: string[];
      assistantMessage: string;
    }
  | {
      type: 'create_transfer';
      data: ExtractedTransferData;
      missingFields: string[];
      assistantMessage: string;
    }
  | {
      type: 'create_swap';
      data: ExtractedSwapData;
      missingFields: string[];
      assistantMessage: string;
    }
  | {
      type: 'query_portfolio';
      query: 'total' | 'by_type' | 'by_account' | 'idle' | 'pnl';
      filter?: string; // ej. "crypto", "Binance", "BTC"
      assistantMessage: string;
    }
  | {
      type: 'run_simulation';
      initialCapitalUSD?: number;
      monthlyContributionUSD?: number;
      durationMonths?: number;
      expectedAnnualReturnPct?: number;
      assistantMessage: string;
    }
  | {
      type: 'search_asset';
      query: string;
      assistantMessage: string;
    };

export interface ExtractedTransferData {
  /** Ticker del activo transferido. */
  ticker?: string;
  /** Cantidad en unidades del activo (no en USD). */
  amount?: number;
  /** Nombre de la cuenta de origen. */
  fromAccountName?: string;
  /** Nombre de la cuenta de destino. Ausente = retiro puro. */
  toAccountName?: string;
  /** Bucket/cartera. */
  bucket?: 'corto' | 'medio' | 'largo' | 'trade';
  /** ISO date. */
  date?: string;
  notes?: string;
}

export interface ExtractedSwapData {
  /** Ticker del activo que entregás. */
  fromTicker?: string;
  /** Cantidad que entregás. */
  fromQty?: number;
  /** Ticker del activo que recibís. */
  toTicker?: string;
  /** Cantidad que recibís. Puede omitirse si el usuario solo menciona uno. */
  toQty?: number;
  /** Cuenta donde ocurre el swap. */
  accountName?: string;
  bucket?: 'corto' | 'medio' | 'largo' | 'trade';
  date?: string;
  notes?: string;
}

export interface ExtractedTransactionData {
  kind?: 'buy' | 'sell' | 'yield' | 'transfer_in' | 'transfer_out';
  /** Ticker mencionado (no resuelto a assetId — eso lo hace el caller). */
  ticker?: string;
  /** Cantidad de unidades. Excluyente con `amountUSD`. */
  qty?: number;
  /** Monto en USD (cuando el usuario dice "metí 2k en BTC"). */
  amountUSD?: number;
  /** Precio unitario si se mencionó. */
  unitPrice?: number;
  /** Moneda del precio: ARS, USD, USDT. */
  priceCurrency?: 'ARS' | 'USD' | 'USDT';
  /** Cuenta mencionada (nombre). */
  accountName?: string;
  /** Bucket explícito si lo nombró. */
  bucket?: 'corto' | 'medio' | 'largo' | 'trade';
  /** ISO date — el modelo resuelve "ayer", "hoy", "el 23 de abril". */
  date?: string;
  /** Nota adicional (P2P, regalo, dca, etc.). */
  notes?: string;
}

// ─── Setup ─────────────────────────────────────────────────────────────────

function getApiKey(): string | undefined {
  const k = import.meta.env.VITE_ANTHROPIC_API_KEY;
  return k && k.length > 10 ? k : undefined;
}

export const hasAnthropic = !!getApiKey();

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const key = getApiKey();
    if (!key) throw new Error('VITE_ANTHROPIC_API_KEY no configurada.');
    client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  }
  return client;
}

// ─── Tool definitions ─────────────────────────────────────────────────────

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'create_transaction',
    description:
      'Registra una operación financiera del usuario (compra, venta, yield, transferencia). ' +
      'Extraé todos los campos que puedas inferir del texto. Si falta algo importante (qty/amount, ticker, kind), incluilo en `missingFields` y armá una pregunta amigable en `assistantMessage`. ' +
      'Resolvé fechas relativas a ISO (hoy, ayer, hace X días). Si dice "X k" interpretá como amount en USD; si dice "0.05 BTC" interpretá como qty.',
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['buy', 'sell', 'yield', 'transfer_in', 'transfer_out'],
        },
        ticker: { type: 'string' },
        qty: { type: 'number' },
        amountUSD: { type: 'number' },
        unitPrice: { type: 'number' },
        priceCurrency: { type: 'string', enum: ['ARS', 'USD', 'USDT'] },
        accountName: { type: 'string' },
        bucket: {
          type: 'string',
          enum: ['corto', 'medio', 'largo', 'trade'],
        },
        date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        notes: { type: 'string' },
        missingFields: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Lista de campos críticos faltantes (ticker, qty, kind). Vacío si todo está claro.',
        },
        assistantMessage: {
          type: 'string',
          description:
            'Mensaje natural para mostrar al usuario. Si missingFields está vacío: "Listo, revisá el recibo". Si no: pregunta de slot-filling.',
        },
      },
      required: ['assistantMessage'],
    },
  },
  {
    name: 'create_transfer',
    description:
      'Registra un depósito, retiro o transferencia de activos entre cuentas. ' +
      'Usá esta tool (no create_transaction) cuando el usuario diga "deposité", "ingresé", "retiré", "saqué", "pasé de X a Y", "moví", "transferí". ' +
      'Si falta el ticker o alguna cuenta requerida, ponelos en missingFields.',
    input_schema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Ticker del activo (BTC, USDT, USD, ARS, etc.)' },
        amount: { type: 'number', description: 'Cantidad en unidades del activo (no en USD)' },
        fromAccountName: { type: 'string', description: 'Cuenta de origen. Omitir para depósitos puros.' },
        toAccountName: { type: 'string', description: 'Cuenta de destino. Omitir para retiros puros.' },
        bucket: { type: 'string', enum: ['corto', 'medio', 'largo', 'trade'] },
        date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        notes: { type: 'string' },
        missingFields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Campos críticos faltantes. Vacío si todo está claro.',
        },
        assistantMessage: { type: 'string' },
      },
      required: ['assistantMessage'],
    },
  },
  {
    name: 'create_swap',
    description:
      'Registra un intercambio (swap) entre dos activos en la misma cuenta. ' +
      'Usá esta tool cuando el usuario diga "swapeé", "cambié X por Y", "intercambié", "convertí X en Y", "pasé X a Y" dentro de la misma plataforma. ' +
      'Diferencia con create_transfer: acá hay DOS activos distintos involucrados. ' +
      'Si falta fromTicker, toTicker, fromQty o toQty, ponelos en missingFields.',
    input_schema: {
      type: 'object',
      properties: {
        fromTicker: { type: 'string', description: 'Ticker del activo que entregás (ej. USDT)' },
        fromQty: { type: 'number', description: 'Cantidad que entregás' },
        toTicker: { type: 'string', description: 'Ticker del activo que recibís (ej. BTC)' },
        toQty: { type: 'number', description: 'Cantidad que recibís' },
        accountName: { type: 'string', description: 'Nombre de la cuenta/plataforma donde ocurre el swap' },
        bucket: { type: 'string', enum: ['corto', 'medio', 'largo', 'trade'] },
        date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        notes: { type: 'string' },
        missingFields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Campos críticos faltantes. Vacío si todo está claro.',
        },
        assistantMessage: { type: 'string' },
      },
      required: ['assistantMessage'],
    },
  },
  {
    name: 'query_portfolio',
    description:
      'Responde una pregunta del usuario sobre su portfolio (total, por tipo, por cuenta, capital ocioso, PnL). ' +
      'No necesitás los datos reales — el sistema los resuelve. Solo extraé qué quiere ver y armá la respuesta cuando llegue el resultado.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          enum: ['total', 'by_type', 'by_account', 'idle', 'pnl'],
        },
        filter: {
          type: 'string',
          description:
            'Filtro adicional: ticker (BTC), tipo (crypto), o nombre de cuenta (Binance).',
        },
        assistantMessage: { type: 'string' },
      },
      required: ['query', 'assistantMessage'],
    },
  },
  {
    name: 'run_simulation',
    description:
      'Abre el simulador con los parámetros del usuario. Ejemplos: "simulame 5k por mes 2 años al 12%".',
    input_schema: {
      type: 'object',
      properties: {
        initialCapitalUSD: { type: 'number' },
        monthlyContributionUSD: { type: 'number' },
        durationMonths: { type: 'number' },
        expectedAnnualReturnPct: { type: 'number' },
        assistantMessage: { type: 'string' },
      },
      required: ['assistantMessage'],
    },
  },
  {
    name: 'search_asset',
    description:
      'Busca un activo en la biblioteca + APIs externas. Usar cuando el usuario dice "buscá", "qué es X", o pide info sobre un ticker no cargado.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        assistantMessage: { type: 'string' },
      },
      required: ['query', 'assistantMessage'],
    },
  },
];

// ─── Interpretación ───────────────────────────────────────────────────────

interface InterpretContext {
  assets: Asset[];
  accounts: Account[];
  /** Para que el LLM resuelva fechas relativas. */
  todayISO: string;
}

const SYSTEM_PROMPT = `Sos el asistente del Portfolio Tracker, una app argentina para registrar inversiones (cripto, CEDEARs, ETFs, bonos, fondos).

Reglas:
- Respondé en español rioplatense, breve y casual ("Dale", "Listo", "Perfecto").
- Si el usuario describe una operación, usá la tool create_transaction.
- Si pregunta por su portfolio, usá query_portfolio.
- Si pide simular, usá run_simulation.
- Si busca un asset, usá search_asset.
- Si no entendés, devolvé text plano sin tool_use con un mensaje amigable.

Convenciones AR:
- "compré X tickr" → kind=buy
- "vendí X" → kind=sell
- "cobré staking", "rendimiento" → kind=yield
- "metí 2k en BTC" → es amountUSD (no qty), porque dice una cantidad de plata
- "0.05 BTC" → es qty
- "ayer", "hoy", "anteayer" → resolver a ISO
- "en Binance/Lemon/Belo/IOL" → accountName
- Buckets: corto (<6m), mediano/medio (6m-2a), largo (HODL), trade (especulativo)
- Default bucket = "largo" si no se aclara

Cuándo usar create_swap (NO create_transaction):
- "swapeé 500 USDT por 0.005 BTC en Nexo" → fromTicker=USDT, fromQty=500, toTicker=BTC, toQty=0.005
- "cambié 1000 USDT en ETH" → fromTicker=USDT, fromQty=1000, toTicker=ETH
- "intercambié 200 USDC por NEXO" → create_swap
- "convertí mis USDT en BTC" → create_swap

Cuándo usar create_transfer (NO create_transaction ni create_swap):
- "deposité 1000 USD en Nexo" → depósito puro (sin fromAccountName, toAccountName=Nexo)
- "ingresé plata en Binance" → depósito puro
- "retiré 500 USD de Nexo" → retiro puro (fromAccountName=Nexo, sin toAccountName)
- "saqué 200 USDT de BingX" → retiro puro
- "pasé 0.01 BTC de Binance a Nexo" → entre cuentas (fromAccountName=Binance, toAccountName=Nexo)
- "moví 1000 USDT de BingX a Galicia" → entre cuentas
- "transferí 500 dólares de Nexo a mi banco" → retiro puro

Si falta info crítica para create_transaction (qty/amount, ticker, kind), agregá los campos a missingFields y armá una pregunta amigable. Nunca inventes valores.`;

/**
 * Llama a Claude para interpretar el mensaje. Si falla la API o no hay key,
 * el caller (chat) tiene que catchear y caer al stub.
 */
export async function interpretMessage(
  text: string,
  ctx: InterpretContext,
): Promise<ChatIntent> {
  const c = getClient();

  // Le damos al modelo un contexto compacto: tickers cargados y nombres de
  // cuentas. Eso le permite reconocer "AAPL" o "Binance" sin alucinar.
  const tickers = ctx.assets.map((a) => a.ticker).join(', ');
  const accountNames = ctx.accounts.map((a) => a.name).join(', ');
  const assetCurrencies = ctx.assets.map((a) => `${a.ticker}=${a.currency}`).join(', ');

  const userContext = `Hoy es ${ctx.todayISO}. Tickers cargados: ${tickers}. ` +
    `Moneda de cotización por ticker: ${assetCurrencies || '(ninguno)'}. ` +
    `IMPORTANTE: interpretá los precios en la moneda configurada para cada ticker. ` +
    `Cuentas: ${accountNames}.`;

  const response = await c.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages: [
      { role: 'user', content: `${userContext}\n\nMensaje del usuario: ${text}` },
    ],
  });

  // Parsear: priorizamos el primer tool_use que veamos.
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      return parseToolUse(block);
    }
  }
  // Sin tool_use → fallback a texto plano.
  const textBlock = response.content.find((b) => b.type === 'text');
  return {
    type: 'unknown',
    assistantMessage:
      textBlock && textBlock.type === 'text'
        ? textBlock.text
        : 'No te entendí. Probá: "compré 0.05 BTC a 95000 en Binance".',
  };
}

function parseToolUse(block: Anthropic.Messages.ToolUseBlock): ChatIntent {
  const input = block.input as Record<string, unknown>;
  const msg = (input.assistantMessage as string) ?? 'Listo.';

  switch (block.name) {
    case 'create_transaction':
      return {
        type: 'create_transaction',
        data: pickTransactionData(input),
        missingFields: Array.isArray(input.missingFields)
          ? (input.missingFields as string[])
          : [],
        assistantMessage: msg,
      };
    case 'create_transfer':
      return {
        type: 'create_transfer',
        data: {
          ticker: input.ticker as string | undefined,
          amount: input.amount as number | undefined,
          fromAccountName: input.fromAccountName as string | undefined,
          toAccountName: input.toAccountName as string | undefined,
          bucket: input.bucket as ExtractedTransferData['bucket'],
          date: input.date as string | undefined,
          notes: input.notes as string | undefined,
        },
        missingFields: Array.isArray(input.missingFields)
          ? (input.missingFields as string[])
          : [],
        assistantMessage: msg,
      };
    case 'create_swap':
      return {
        type: 'create_swap',
        data: {
          fromTicker: input.fromTicker as string | undefined,
          fromQty: input.fromQty as number | undefined,
          toTicker: input.toTicker as string | undefined,
          toQty: input.toQty as number | undefined,
          accountName: input.accountName as string | undefined,
          bucket: input.bucket as ExtractedSwapData['bucket'],
          date: input.date as string | undefined,
          notes: input.notes as string | undefined,
        },
        missingFields: Array.isArray(input.missingFields)
          ? (input.missingFields as string[])
          : [],
        assistantMessage: msg,
      };
    case 'query_portfolio':
      return {
        type: 'query_portfolio',
        query: (input.query as 'total') ?? 'total',
        filter: input.filter as string | undefined,
        assistantMessage: msg,
      };
    case 'run_simulation':
      return {
        type: 'run_simulation',
        initialCapitalUSD: input.initialCapitalUSD as number | undefined,
        monthlyContributionUSD: input.monthlyContributionUSD as number | undefined,
        durationMonths: input.durationMonths as number | undefined,
        expectedAnnualReturnPct: input.expectedAnnualReturnPct as number | undefined,
        assistantMessage: msg,
      };
    case 'search_asset':
      return {
        type: 'search_asset',
        query: (input.query as string) ?? '',
        assistantMessage: msg,
      };
    default:
      return { type: 'unknown', assistantMessage: msg };
  }
}

function pickTransactionData(input: Record<string, unknown>): ExtractedTransactionData {
  return {
    kind: input.kind as ExtractedTransactionData['kind'],
    ticker: input.ticker as string | undefined,
    qty: input.qty as number | undefined,
    amountUSD: input.amountUSD as number | undefined,
    unitPrice: input.unitPrice as number | undefined,
    priceCurrency: input.priceCurrency as ExtractedTransactionData['priceCurrency'],
    accountName: input.accountName as string | undefined,
    bucket: input.bucket as ExtractedTransactionData['bucket'],
    date: input.date as string | undefined,
    notes: input.notes as string | undefined,
  };
}
