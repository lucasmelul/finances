/**
 * CSV import — parser + mapper + validador para alta masiva de transactions.
 *
 * Diseño:
 *  - `parseCSV(text)` → array de filas crudas (objetos `{header: value}`).
 *  - `validateRows(rows, mapping, ctx)` → array de `RowResult` con errores
 *    por fila + tx ya construida si pasa.
 *  - `detectDuplicates(rows, existingTxs)` → marca filas con duplicado
 *    obvio (mismo asset+date+qty+account+price).
 *  - El caller (UI) decide qué hacer con los errores: editar, descartar, omitir.
 *
 * Formato esperado del CSV (mínimo):
 *   date,kind,asset,qty,unitPrice,currency,account,bucket
 *   2026-04-23,buy,AAPL,50,8950,ARS,IOL,largo
 *
 * El delimiter se autodetecta: , o ; (común en exports de Excel ES).
 */

import type {
  Account,
  Asset,
  Currency,
  PortfolioBucket,
  Transaction,
  TxKind,
} from '@/lib/types';
import type { CreateTransactionInput } from '@/lib/db/mutations';

// ─── Parser ────────────────────────────────────────────────────────────────

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Parser CSV mínimo. NO soporta:
 *  - Newlines dentro de comillas (caso raro en exports financieros).
 * Sí soporta:
 *  - Delimiter , o ; (autodetect)
 *  - Quotes "..." con commas internas
 *  - Trim de whitespace
 *  - Líneas vacías ignoradas
 */
export function parseCSV(text: string): ParsedCSV {
  const trimmed = text.replace(/^﻿/, '').trim(); // strip BOM
  if (!trimmed) return { headers: [], rows: [] };

  // Detect delimiter por la primera línea
  const firstLine = trimmed.split(/\r?\n/)[0];
  const delim = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headers = parseLine(lines[0], delim).map((h) => h.trim().toLowerCase());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i], delim);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = (cells[j] ?? '').trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

function parseLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// ─── Mapping ───────────────────────────────────────────────────────────────

/**
 * Mapea nombres de columna del CSV a campos canónicos. El usuario puede ajustar.
 * Default usa los nombres en español + inglés más comunes.
 */
export interface ColumnMapping {
  date: string;
  kind: string;
  asset: string;
  qty: string;
  unitPrice: string;
  currency: string;
  account: string;
  bucket?: string;
  notes?: string;
}

/** Auto-detecta el mapping desde headers cargados. */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const find = (...names: string[]): string =>
    names.find((n) => headers.includes(n)) ?? '';
  return {
    date: find('date', 'fecha', 'dia'),
    kind: find('kind', 'tipo', 'operacion', 'operación', 'side'),
    asset: find('asset', 'ticker', 'activo', 'symbol', 'simbolo', 'símbolo'),
    qty: find('qty', 'cantidad', 'units', 'unidades', 'amount'),
    unitPrice: find('unitprice', 'price', 'precio', 'unit_price', 'precio_unitario'),
    currency: find('currency', 'moneda', 'ccy'),
    account: find('account', 'cuenta', 'broker'),
    bucket: find('bucket', 'cartera', 'portfolio'),
    notes: find('notes', 'notas', 'memo'),
  };
}

// ─── Validación ────────────────────────────────────────────────────────────

export interface RowError {
  field: string;
  message: string;
}

export interface RowResult {
  rowIndex: number; // 0-based desde la primera fila de datos
  raw: Record<string, string>;
  errors: RowError[];
  /** Tx normalizada lista para `createTransaction`. Solo si errors=[]. */
  tx?: CreateTransactionInput;
  /** Si match con tx existente: misma fecha+asset+qty+price+account. */
  isDuplicate: boolean;
}

const KIND_ALIASES: Record<string, TxKind> = {
  buy: 'buy',
  compra: 'buy',
  comprar: 'buy',
  c: 'buy',
  sell: 'sell',
  venta: 'sell',
  vender: 'sell',
  v: 'sell',
  yield: 'yield',
  rendimiento: 'yield',
  dividendo: 'yield',
  staking: 'yield',
  transfer_in: 'transfer_in',
  ingreso: 'transfer_in',
  in: 'transfer_in',
  transfer_out: 'transfer_out',
  egreso: 'transfer_out',
  out: 'transfer_out',
  fee: 'fee',
  comision: 'fee',
  comisión: 'fee',
};

const BUCKET_ALIASES: Record<string, PortfolioBucket> = {
  corto: 'corto',
  short: 'corto',
  mediano: 'medio',
  medio: 'medio',
  medium: 'medio',
  largo: 'largo',
  long: 'largo',
  hodl: 'largo',
  trade: 'trade',
  trading: 'trade',
};

const CURRENCY_VALID: Currency[] = ['ARS', 'USD', 'USDT', 'BTC', 'EUR'];

export interface ValidateContext {
  assets: Asset[];
  accounts: Account[];
  /** Para detectar duplicados. */
  existingTxs: Transaction[];
}

export function validateRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  ctx: ValidateContext,
): RowResult[] {
  return rows.map((raw, rowIndex) => {
    const errors: RowError[] = [];
    const get = (key: keyof ColumnMapping): string =>
      mapping[key] ? (raw[mapping[key]!] ?? '') : '';

    // 1. Date
    const dateRaw = get('date');
    let date = '';
    if (!dateRaw) {
      errors.push({ field: 'date', message: 'Fecha requerida' });
    } else {
      const d = parseFlexibleDate(dateRaw);
      if (!d) errors.push({ field: 'date', message: `Fecha inválida: ${dateRaw}` });
      else date = d;
    }

    // 2. Kind
    const kindRaw = get('kind').toLowerCase().trim();
    const kind = KIND_ALIASES[kindRaw];
    if (!kind) errors.push({ field: 'kind', message: `Tipo inválido: ${kindRaw || '(vacío)'}` });

    // 3. Asset
    const tickerRaw = get('asset').toUpperCase().trim();
    const asset = ctx.assets.find((a) => a.ticker.toUpperCase() === tickerRaw);
    if (!asset) {
      errors.push({
        field: 'asset',
        message: `Activo no encontrado: ${tickerRaw || '(vacío)'}`,
      });
    }

    // 4. qty
    const qtyRaw = get('qty');
    const qty = parseNumber(qtyRaw);
    if (qty == null || qty <= 0) {
      errors.push({ field: 'qty', message: `Cantidad inválida: ${qtyRaw}` });
    }

    // 5. unitPrice (yield puede ser 0)
    const priceRaw = get('unitPrice');
    const unitPrice = parseNumber(priceRaw);
    if (unitPrice == null || unitPrice < 0) {
      errors.push({ field: 'unitPrice', message: `Precio inválido: ${priceRaw}` });
    }

    // 6. currency
    let currency: Currency = (asset?.currency ?? 'USD') as Currency;
    const ccyRaw = get('currency').toUpperCase().trim();
    if (ccyRaw) {
      if (CURRENCY_VALID.includes(ccyRaw as Currency)) {
        currency = ccyRaw as Currency;
      } else {
        errors.push({ field: 'currency', message: `Moneda inválida: ${ccyRaw}` });
      }
    }

    // 7. account
    const accountRaw = get('account').trim();
    const account = ctx.accounts.find(
      (a) => a.name.toLowerCase() === accountRaw.toLowerCase(),
    );
    if (!account) {
      errors.push({
        field: 'account',
        message: `Cuenta no encontrada: ${accountRaw || '(vacío)'}`,
      });
    }

    // 8. bucket (opcional, default largo)
    const bucketRaw = get('bucket').toLowerCase().trim();
    const bucket = bucketRaw ? BUCKET_ALIASES[bucketRaw] : 'largo';
    if (bucketRaw && !bucket) {
      errors.push({ field: 'bucket', message: `Cartera inválida: ${bucketRaw}` });
    }

    const notes = get('notes') || undefined;

    let tx: CreateTransactionInput | undefined;
    if (errors.length === 0 && asset && account && kind && qty != null && unitPrice != null) {
      tx = {
        kind,
        assetId: asset.id,
        accountId: account.id,
        bucket: bucket ?? 'largo',
        qty,
        unitPrice,
        priceCurrency: currency,
        date,
        notes,
        source: 'import',
      };
    }

    // Duplicate check (best-effort): mismo asset+date+qty+account+kind+price
    const isDuplicate = !!tx && ctx.existingTxs.some(
      (t) =>
        t.assetId === tx!.assetId &&
        t.accountId === tx!.accountId &&
        t.kind === tx!.kind &&
        Math.abs(t.qty - tx!.qty) < 1e-8 &&
        Math.abs(t.unitPrice - tx!.unitPrice) < 1e-4 &&
        t.date.slice(0, 10) === tx!.date!.slice(0, 10),
    );

    return { rowIndex, raw, errors, tx, isDuplicate };
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseNumber(s: string): number | null {
  if (!s) return null;
  // Acepta "1.234,56" (es-AR), "1,234.56" (en-US), "1234.56" plain
  let normalized = s.trim();
  // Detect locale: si tiene coma como decimal (último char antes del último número)
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  if (hasComma && hasDot) {
    // Asumimos punto como miles, coma como decimal (formato es-AR)
    const lastDot = normalized.lastIndexOf('.');
    const lastComma = normalized.lastIndexOf(',');
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  }
  const n = parseFloat(normalized);
  return isFinite(n) ? n : null;
}

/**
 * Acepta YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY. Devuelve ISO o null.
 */
function parseFlexibleDate(s: string): string | null {
  // ISO directo
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  // DD/MM/YYYY o DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
    const date = new Date(year, parseInt(mo) - 1, parseInt(d));
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }
  return null;
}
