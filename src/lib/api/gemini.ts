/**
 * Cliente Google Gemini (REST) — proveedor primario del chat IA.
 *
 * Por qué Gemini:
 *  - Free tier real (15 RPM, 1500 reqs/día, 1M tokens/min).
 *  - Sin tarjeta de crédito.
 *  - Function calling potente (equivalente a Anthropic tool_use).
 *  - REST con CORS abierto → funciona desde browser sin backend.
 *
 * Por qué fetch directo (sin SDK):
 *  - El SDK `@google/generative-ai` agrega ~80KB al bundle.
 *  - La API REST es estable y simple — 1 endpoint, 1 estructura.
 *  - Evitamos otra dependencia transitiva.
 *
 * Modelo: `gemini-1.5-flash` — más barato y rápido. Para parseo de intent
 * es overkill usar Pro.
 *
 * El contrato (`ChatIntent`) es idéntico al de `anthropic.ts` para que el
 * caller (Chat.tsx) no se entere del proveedor.
 */

import type { Account, Asset } from '@/lib/types';
import type { ChatIntent, ExtractedTransactionData } from './anthropic';
import { CEDEARS } from '@/data/cedears';

// ─── Setup ─────────────────────────────────────────────────────────────────

const MODEL = 'gemini-1.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function getApiKey(): string | undefined {
  const k = import.meta.env.VITE_GEMINI_API_KEY;
  return k && k.length > 10 ? k : undefined;
}

export const hasGemini = !!getApiKey();

// ─── Function declarations ─────────────────────────────────────────────────
//
// Mismas tools que Anthropic, pero en formato Gemini:
//   - `functionDeclarations` en lugar de `tools`
//   - `parameters` (no `input_schema`)
//   - mismo JSON Schema interno
//
// Mantenemos los mismos nombres para que el response handler sea genérico.

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, GeminiSchemaProperty>;
    required?: string[];
  };
}

type GeminiSchemaProperty =
  | { type: 'STRING'; description?: string; enum?: string[] }
  | { type: 'NUMBER'; description?: string }
  | { type: 'BOOLEAN'; description?: string }
  | { type: 'ARRAY'; items: { type: 'STRING' }; description?: string };

const FUNCTIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'create_transaction',
    description:
      'Registra una operación financiera del usuario (compra, venta, yield, transferencia). ' +
      'Extraé todos los campos que puedas inferir del texto. Si falta algo importante (qty/amount, ticker, kind), incluilo en `missingFields` y armá una pregunta amigable en `assistantMessage`. ' +
      'Resolvé fechas relativas a ISO (hoy, ayer, hace X días). Si dice "X k" interpretá como amount en USD; si dice "0.05 BTC" interpretá como qty.',
    parameters: {
      type: 'OBJECT',
      properties: {
        kind: {
          type: 'STRING',
          enum: ['buy', 'sell', 'yield', 'transfer_in', 'transfer_out'],
        },
        ticker: { type: 'STRING' },
        qty: { type: 'NUMBER' },
        amountUSD: { type: 'NUMBER' },
        unitPrice: { type: 'NUMBER' },
        priceCurrency: { type: 'STRING', enum: ['ARS', 'USD', 'USDT'] },
        accountName: { type: 'STRING' },
        bucket: {
          type: 'STRING',
          enum: ['corto', 'medio', 'largo', 'trade'],
        },
        date: { type: 'STRING', description: 'ISO date (YYYY-MM-DD)' },
        notes: { type: 'STRING' },
        missingFields: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Campos críticos faltantes (ticker, qty, kind). Vacío si todo está claro.',
        },
        assistantMessage: {
          type: 'STRING',
          description:
            'Mensaje natural para el usuario. Si missingFields vacío: "Listo, revisá el recibo". Si no: pregunta de slot-filling.',
        },
      },
      required: ['assistantMessage'],
    },
  },
  {
    name: 'query_portfolio',
    description:
      'Responde una pregunta sobre el portfolio (total, por tipo, por cuenta, capital ocioso, PnL). ' +
      'No necesitás los datos reales — el sistema los resuelve. Solo extraé qué quiere ver.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          enum: ['total', 'by_type', 'by_account', 'idle', 'pnl'],
        },
        filter: {
          type: 'STRING',
          description: 'Filtro: ticker (BTC), tipo (crypto), cuenta (Binance).',
        },
        assistantMessage: { type: 'STRING' },
      },
      required: ['query', 'assistantMessage'],
    },
  },
  {
    name: 'run_simulation',
    description: 'Abre el simulador con parámetros del usuario. Ej: "simulame 5k por mes 2 años al 12%".',
    parameters: {
      type: 'OBJECT',
      properties: {
        initialCapitalUSD: { type: 'NUMBER' },
        monthlyContributionUSD: { type: 'NUMBER' },
        durationMonths: { type: 'NUMBER' },
        expectedAnnualReturnPct: { type: 'NUMBER' },
        assistantMessage: { type: 'STRING' },
      },
      required: ['assistantMessage'],
    },
  },
  {
    name: 'create_transfer',
    description:
      'Registra un depósito, retiro o transferencia entre cuentas. ' +
      'Usá esta tool (no create_transaction) cuando el usuario diga "deposité", "ingresé", "retiré", "saqué", "pasé de X a Y", "moví", "transferí".',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: { type: 'STRING', description: 'Ticker del activo (BTC, USDT, USD, ARS, etc.)' },
        amount: { type: 'NUMBER', description: 'Cantidad en unidades del activo' },
        fromAccountName: { type: 'STRING', description: 'Cuenta de origen. Omitir para depósitos puros.' },
        toAccountName: { type: 'STRING', description: 'Cuenta de destino. Omitir para retiros puros.' },
        bucket: { type: 'STRING', enum: ['corto', 'medio', 'largo', 'trade'] },
        date: { type: 'STRING', description: 'ISO date (YYYY-MM-DD)' },
        notes: { type: 'STRING' },
        missingFields: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Campos críticos faltantes. Vacío si todo está claro.',
        },
        assistantMessage: { type: 'STRING' },
      },
      required: ['assistantMessage'],
    },
  },
  {
    name: 'search_asset',
    description: 'Busca un activo en biblioteca + APIs externas. Usar para "buscá X", "qué es X".',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING' },
        assistantMessage: { type: 'STRING' },
      },
      required: ['query', 'assistantMessage'],
    },
  },
];

// ─── Prompt del sistema ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sos el asistente del Portfolio Tracker, una app argentina para registrar inversiones (cripto, CEDEARs, ETFs, bonos, fondos).

Reglas:
- Respondé en español rioplatense, breve y casual ("Dale", "Listo", "Perfecto").
- Si el usuario describe una operación de compra/venta/yield, usá create_transaction.
- Si el usuario menciona un retiro o una transferencia entre cuentas, usá create_transfer.
- Si pregunta por su portfolio, usá query_portfolio.
- Si pide simular, usá run_simulation.
- Si busca un asset, usá search_asset.
- Si no entendés, devolvé text plano sin usar tools con un mensaje amigable.

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

Cuándo usar create_transfer (NO create_transaction):
- "deposité 1000 USD en Nexo" → depósito puro (sin fromAccountName, toAccountName=Nexo)
- "ingresé plata en Binance" → depósito puro
- "retiré 500 USD de Nexo" → retiro puro (fromAccountName=Nexo, sin toAccountName)
- "saqué 200 USDT de BingX" → retiro puro
- "pasé 0.01 BTC de Binance a Nexo" → entre cuentas (fromAccountName=Binance, toAccountName=Nexo)
- "moví 1000 USDT de BingX a Galicia" → entre cuentas

Si falta info crítica, agregá los campos a missingFields y armá una pregunta amigable. Nunca inventes valores.`;

// ─── Tipos de respuesta ────────────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<
        | { text: string }
        | { functionCall: { name: string; args: Record<string, unknown> } }
      >;
    };
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code: number; message: string };
}

// ─── Interpretación ───────────────────────────────────────────────────────

interface InterpretContext {
  assets: Asset[];
  accounts: Account[];
  todayISO: string;
}

export async function interpretMessage(
  text: string,
  ctx: InterpretContext,
): Promise<ChatIntent> {
  const key = getApiKey();
  if (!key) throw new Error('VITE_GEMINI_API_KEY no configurada.');

  // Contexto compacto: tickers cargados + tickers del catálogo CEDEAR seed +
  // cuentas. Pasamos el catálogo CEDEAR para que Gemini reconozca tickers
  // como MELI/AAPL/KO aunque el usuario no los haya cargado todavía
  // (el chat downstream auto-crea el Asset desde el seed).
  const tickers = ctx.assets.map((a) => a.ticker).join(', ');
  const cedearTickers = CEDEARS.map((c) => c.ticker).join(', ');
  const accountNames = ctx.accounts.map((a) => a.name).join(', ');
  const userContext =
    `Hoy es ${ctx.todayISO}.\n` +
    `Tickers ya cargados por el usuario: ${tickers || '(ninguno)'}.\n` +
    `CEDEARs disponibles (catálogo BYMA): ${cedearTickers}.\n` +
    `Cuentas: ${accountNames || '(ninguna)'}.\n\n` +
    `Mensaje del usuario: ${text}`;

  const url = `${ENDPOINT}?key=${encodeURIComponent(key)}`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userContext }] }],
    tools: [{ functionDeclarations: FUNCTIONS }],
    generationConfig: {
      temperature: 0.2, // determinístico para parseo de intent
      maxOutputTokens: 1024,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = (await res.json()) as GeminiResponse;
  if (json.error) {
    throw new Error(`Gemini API: ${json.error.message}`);
  }

  // Buscar functionCall primero (intent estructurado).
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if ('functionCall' in part) {
      return parseFunctionCall(part.functionCall);
    }
  }

  // Sin functionCall → texto plano.
  const textPart = parts.find((p): p is { text: string } => 'text' in p);
  return {
    type: 'unknown',
    assistantMessage:
      textPart?.text ?? 'No te entendí. Probá: "compré 0.05 BTC a 95000 en Binance".',
  };
}

function parseFunctionCall(call: {
  name: string;
  args: Record<string, unknown>;
}): ChatIntent {
  const { name, args } = call;
  const msg = (args.assistantMessage as string) ?? 'Listo.';

  switch (name) {
    case 'create_transaction':
      return {
        type: 'create_transaction',
        data: pickTransactionData(args),
        missingFields: Array.isArray(args.missingFields)
          ? (args.missingFields as string[])
          : [],
        assistantMessage: msg,
      };
    case 'create_transfer':
      return {
        type: 'create_transfer',
        data: {
          ticker: args.ticker as string | undefined,
          amount: args.amount as number | undefined,
          fromAccountName: args.fromAccountName as string | undefined,
          toAccountName: args.toAccountName as string | undefined,
          bucket: args.bucket as 'corto' | 'medio' | 'largo' | 'trade' | undefined,
          date: args.date as string | undefined,
          notes: args.notes as string | undefined,
        },
        missingFields: Array.isArray(args.missingFields)
          ? (args.missingFields as string[])
          : [],
        assistantMessage: msg,
      };
    case 'query_portfolio':
      return {
        type: 'query_portfolio',
        query: (args.query as 'total') ?? 'total',
        filter: args.filter as string | undefined,
        assistantMessage: msg,
      };
    case 'run_simulation':
      return {
        type: 'run_simulation',
        initialCapitalUSD: args.initialCapitalUSD as number | undefined,
        monthlyContributionUSD: args.monthlyContributionUSD as number | undefined,
        durationMonths: args.durationMonths as number | undefined,
        expectedAnnualReturnPct: args.expectedAnnualReturnPct as number | undefined,
        assistantMessage: msg,
      };
    case 'search_asset':
      return {
        type: 'search_asset',
        query: (args.query as string) ?? '',
        assistantMessage: msg,
      };
    default:
      return { type: 'unknown', assistantMessage: msg };
  }
}

function pickTransactionData(args: Record<string, unknown>): ExtractedTransactionData {
  return {
    kind: args.kind as ExtractedTransactionData['kind'],
    ticker: args.ticker as string | undefined,
    qty: args.qty as number | undefined,
    amountUSD: args.amountUSD as number | undefined,
    unitPrice: args.unitPrice as number | undefined,
    priceCurrency: args.priceCurrency as ExtractedTransactionData['priceCurrency'],
    accountName: args.accountName as string | undefined,
    bucket: args.bucket as ExtractedTransactionData['bucket'],
    date: args.date as string | undefined,
    notes: args.notes as string | undefined,
  };
}
