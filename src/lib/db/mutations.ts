/**
 * Capa de escritura. Centraliza todos los `db.X.add/put/update` para que:
 *  1. Las screens NO toquen Dexie directo (testabilidad + invariantes).
 *  2. Cada mutación valide pre-condiciones (ej. nombre de cuenta único).
 *  3. Los IDs y `createdAt` se generen acá (no en cada caller).
 *
 * Convenciones:
 *  - Las mutaciones devuelven el objeto persistido (con `id`/`createdAt` ya
 *    asignados) para que la UI pueda hacer optimistic updates si quiere.
 *  - Throws con mensajes legibles que la UI puede mostrar tal cual.
 *  - NO escriben a `priceCache` / `fxRateCache` — eso es del polling layer.
 */

import { db } from './schema';
import { newId } from '@/lib/utils';
import { loadLatestFxSnapshot } from './fxSnapshot';
import type {
  Account,
  AccountKind,
  AccountTag,
  Asset,
  AssetType,
  Currency,
  PortfolioBucket,
  StakingRule,
  Transaction,
  TxKind,
} from '@/lib/types';
import { portfolioIdForBucket } from '@/data/portfolios';

// ─── Transactions ──────────────────────────────────────────────────────────

export interface CreateTransactionInput {
  kind: TxKind;
  assetId: string;
  accountId: string;
  /** Si se provee `bucket`, se resuelve el portfolio default; si no, pasar `portfolioId`. */
  bucket?: PortfolioBucket;
  portfolioId?: string;
  qty: number;
  unitPrice: number;
  priceCurrency: Currency;
  date?: string; // ISO; default = ahora
  fee?: number;
  feeCurrency?: Currency;
  notes?: string;
  source?: Transaction['source'];
}

/**
 * Crea una transacción manual (form / chat). Defaults sensatos:
 *  - `date` = ahora si no se pasa
 *  - `portfolioId` se resuelve desde `bucket` si no se pasa explícito
 *  - `fxSnapshot` se rellena con el FX vigente para preservar el costo histórico
 *
 * Validaciones mínimas — Phase 2 agrega: que la cuenta existe, que el asset
 * existe, que la cantidad sea > 0, etc. Por ahora confiamos en el caller
 * (los forms ya validan con Zod).
 */
export async function createTransaction(
  input: CreateTransactionInput,
): Promise<Transaction> {
  if (input.qty <= 0) throw new Error('La cantidad debe ser mayor a 0.');
  if (input.unitPrice < 0) throw new Error('El precio no puede ser negativo.');

  const now = new Date().toISOString();
  const portfolioId =
    input.portfolioId ??
    (input.bucket ? portfolioIdForBucket(input.bucket) : undefined);
  if (!portfolioId) {
    throw new Error('createTransaction: requiere `portfolioId` o `bucket`.');
  }

  // Snapshot FX al momento de la tx — congela el costo USD aunque el CCL
  // cambie después (clave para que el PnL histórico no "respire").
  const latestFx = await loadLatestFxSnapshot();

  const tx: Transaction = {
    id: newId(),
    kind: input.kind,
    date: input.date ?? now,
    accountId: input.accountId,
    portfolioId,
    assetId: input.assetId,
    qty: input.qty,
    unitPrice: input.unitPrice,
    priceCurrency: input.priceCurrency,
    fee: input.fee,
    feeCurrency: input.feeCurrency,
    fxSnapshot: latestFx,
    notes: input.notes,
    source: input.source ?? 'form',
    createdAt: now,
  };

  await db.transactions.add(tx);
  return tx;
}

// ─── Transfer (retiro / entre cuentas) ────────────────────────────────────

export interface CreateTransferInput {
  assetId: string;
  /** Cuenta de origen. Requerido para retiros y transferencias. Omitir para depósitos puros. */
  fromAccountId?: string;
  /** Cuenta de destino. Requerido para depósitos y transferencias. Omitir para retiros puros. */
  toAccountId?: string;
  bucket?: PortfolioBucket;
  portfolioId?: string;
  qty: number;
  unitPrice: number;
  priceCurrency: Currency;
  date?: string;
  notes?: string;
}

/**
 * Registra un depósito, retiro o transferencia entre cuentas.
 *
 *  - **Depósito** (solo `toAccountId`): crea un `transfer_in`. Dinero nuevo entra al portfolio.
 *  - **Retiro** (solo `fromAccountId`): crea un `transfer_out`. Dinero sale del portfolio.
 *  - **Entre cuentas** (ambos): crea `transfer_out` + `transfer_in` atómicamente.
 *
 * Devuelve las transacciones creadas (1 o 2).
 */
export async function createTransfer(input: CreateTransferInput): Promise<Transaction[]> {
  if (!input.fromAccountId && !input.toAccountId) {
    throw new Error('createTransfer: requiere al menos fromAccountId o toAccountId.');
  }
  if (input.fromAccountId && input.toAccountId && input.fromAccountId === input.toAccountId) {
    throw new Error('La cuenta de destino debe ser distinta a la de origen.');
  }

  const now = new Date().toISOString();
  const portfolioId =
    input.portfolioId ??
    (input.bucket ? portfolioIdForBucket(input.bucket) : portfolioIdForBucket('medio'));
  const latestFx = await loadLatestFxSnapshot();

  const base = {
    assetId: input.assetId,
    portfolioId,
    qty: input.qty,
    unitPrice: input.unitPrice,
    priceCurrency: input.priceCurrency,
    date: input.date ?? now,
    fxSnapshot: latestFx,
    notes: input.notes,
    source: 'form' as const,
    createdAt: now,
  };

  const txs: Transaction[] = [];

  // Leg de salida (retiro o transferencia)
  if (input.fromAccountId) {
    txs.push({
      id: newId(),
      kind: 'transfer_out',
      accountId: input.fromAccountId,
      ...base,
    });
  }

  // Leg de entrada (depósito o transferencia)
  if (input.toAccountId) {
    txs.push({
      id: newId(),
      kind: 'transfer_in',
      accountId: input.toAccountId,
      ...base,
    });
  }

  await db.transaction('rw', db.transactions, async () => {
    for (const tx of txs) await db.transactions.add(tx);
  });

  return txs;
}

// ─── Accounts ──────────────────────────────────────────────────────────────

export interface CreateAccountInput {
  name: string;
  kind: AccountKind;
  /** Inmutable post-creación — clave fiscal (A=declarado, B=privado). */
  tag: AccountTag;
  currency?: Currency;
  notes?: string;
}

/**
 * Crea una cuenta. Valida que el nombre no exista (case-insensitive) — el
 * usuario no debería tener "IOL" y "iol" como cuentas distintas, son la
 * misma operativamente.
 */
export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error('El nombre de la cuenta no puede estar vacío.');

  const existing = await db.accounts.toArray();
  const conflict = existing.find(
    (a) => a.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (conflict) {
    throw new Error(`Ya existe una cuenta llamada "${conflict.name}".`);
  }

  const now = new Date().toISOString();
  const account: Account = {
    id: newId(),
    name: trimmed,
    kind: input.kind,
    tag: input.tag,
    currency: input.currency,
    notes: input.notes,
    createdAt: now,
  };

  await db.accounts.add(account);
  return account;
}

// ─── Update / archive account ──────────────────────────────────────────────

export interface UpdateAccountInput {
  name?: string;
  kind?: AccountKind;
  currency?: Currency;
  notes?: string;
}

export async function updateAccount(
  accountId: string,
  patch: UpdateAccountInput,
): Promise<void> {
  const trimmedName = patch.name?.trim();
  if (trimmedName !== undefined && !trimmedName) {
    throw new Error('El nombre de la cuenta no puede estar vacío.');
  }
  if (trimmedName) {
    const existing = await db.accounts.toArray();
    const conflict = existing.find(
      (a) => a.id !== accountId && a.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    if (conflict) throw new Error(`Ya existe una cuenta llamada "${conflict.name}".`);
    patch = { ...patch, name: trimmedName };
  }
  await db.accounts.update(accountId, patch as Partial<Account>);
}

export async function archiveAccount(accountId: string): Promise<void> {
  await db.accounts.update(accountId, { archivedAt: new Date().toISOString() });
}

export async function unarchiveAccount(accountId: string): Promise<void> {
  await db.accounts.update(accountId, { archivedAt: undefined });
}

// ─── Update tx ─────────────────────────────────────────────────────────────

/**
 * Subset de campos editables de una tx. NO permitimos cambiar `id`,
 * `createdAt`, `source` ni `fxSnapshot` (eso es histórico inmutable).
 *
 * Cambiar `kind` es legítimo (ej. "esto era yield, no compra") aunque
 * impacta FIFO. La UI debería avisarlo cuando lleguemos al motor real.
 */
export interface UpdateTransactionInput {
  kind?: TxKind;
  date?: string;
  accountId?: string;
  portfolioId?: string;
  bucket?: PortfolioBucket;
  assetId?: string;
  qty?: number;
  unitPrice?: number;
  priceCurrency?: Currency;
  fee?: number;
  feeCurrency?: Currency;
  notes?: string;
}

export async function updateTransaction(
  txId: string,
  patch: UpdateTransactionInput,
): Promise<void> {
  // Resolver bucket → portfolioId si vino en `bucket`.
  const { bucket, ...rest } = patch;
  const finalPatch: Partial<Transaction> = { ...rest };
  if (bucket && !patch.portfolioId) {
    finalPatch.portfolioId = portfolioIdForBucket(bucket);
  }
  if (Object.keys(finalPatch).length === 0) return;
  await db.transactions.update(txId, finalPatch);
}

// ─── Assets ────────────────────────────────────────────────────────────────

export interface CreateAssetInput {
  ticker: string;
  name: string;
  type: AssetType;
  currency: Currency;
  /** Logo emoji/letra (opcional). */
  logo?: string;
  /** Color de fondo del logo. */
  logoBg?: string;
  /** Para criptos. */
  coingeckoId?: string;
  /** Para CEDEARs. */
  cedearRatio?: number;
  underlyingTicker?: string;
  isin?: string;
}

/**
 * Crea un Asset (activo) en Dexie. Usado cuando el usuario:
 *  - Encuentra un asset en el SearchDialog y lo "agrega a su biblioteca"
 *  - Define un asset custom no soportado por las APIs
 *
 * El índice `&[type+ticker]` asegura unicidad — si ya existe el mismo
 * (type, ticker), tira error con mensaje legible.
 */
export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  const tickerTrimmed = input.ticker.trim().toUpperCase();
  if (!tickerTrimmed) throw new Error('Ticker requerido.');

  // Pre-check para mensaje más claro que el constraint violation de Dexie.
  const existing = await db.assets
    .where('[type+ticker]')
    .equals([input.type, tickerTrimmed])
    .first();
  if (existing) {
    throw new Error(
      `Ya tenés ${tickerTrimmed} (${input.type}) en tu biblioteca.`,
    );
  }

  const now = new Date().toISOString();
  const asset: Asset = {
    id: newId(),
    ticker: tickerTrimmed,
    name: input.name.trim() || tickerTrimmed,
    type: input.type,
    currency: input.currency,
    logo: input.logo,
    logoBg: input.logoBg,
    coingeckoId: input.coingeckoId,
    cedearRatio: input.cedearRatio,
    underlyingTicker: input.underlyingTicker,
    isin: input.isin,
    createdAt: now,
  };

  await db.assets.add(asset);
  return asset;
}

// ─── Helpers de testing / dev ──────────────────────────────────────────────

/** Borra una transacción por ID. UI: botón "deshacer" en el último confirm. */
export async function deleteTransaction(txId: string): Promise<void> {
  await db.transactions.delete(txId);
}

// ─── Staking rules ─────────────────────────────────────────────────────────

export interface CreateStakingRuleInput {
  assetId: string;
  accountId: string;
  bucket?: PortfolioBucket;
  portfolioId?: string;
  rewardAssetId?: string;
  apyPct: number;
  payoutFrequency: 'daily' | 'weekly' | 'monthly';
  startDate?: string;
  endDate?: string;
  active?: boolean;
}

/**
 * Crea una regla de staking. Por defecto:
 *  - `active: true`
 *  - `startDate: ahora`
 *  - resolve `portfolioId` desde `bucket` si no se pasa
 *
 * Solo permite UNA regla activa por scope `(asset, account, portfolio)` —
 * dos reglas activas concurrentes confunden el cálculo de expected yield.
 * Si ya hay una activa, devolvemos error.
 */
export async function createStakingRule(
  input: CreateStakingRuleInput,
): Promise<StakingRule> {
  const portfolioId =
    input.portfolioId ??
    (input.bucket ? portfolioIdForBucket(input.bucket) : undefined);
  if (!portfolioId) {
    throw new Error('createStakingRule: requiere `portfolioId` o `bucket`.');
  }

  // Conflicto de regla activa.
  const existing = await db.stakingRules
    .where({ assetId: input.assetId, accountId: input.accountId, portfolioId })
    .toArray();
  const hasActive = existing.some((r) => r.active);
  if (hasActive) {
    throw new Error(
      'Ya hay una regla activa para este (activo, cuenta, cartera). Dasactivá la anterior primero.',
    );
  }

  const now = new Date().toISOString();
  const rule: StakingRule = {
    id: newId(),
    assetId: input.assetId,
    accountId: input.accountId,
    portfolioId,
    rewardAssetId: input.rewardAssetId,
    apyPct: input.apyPct,
    payoutFrequency: input.payoutFrequency,
    startDate: input.startDate ?? now,
    endDate: input.endDate,
    active: input.active ?? true,
    createdAt: now,
  };

  await db.stakingRules.add(rule);
  return rule;
}

export async function deactivateStakingRule(ruleId: string): Promise<void> {
  await db.stakingRules.update(ruleId, { active: false });
}

export async function activateStakingRule(ruleId: string): Promise<void> {
  await db.stakingRules.update(ruleId, { active: true });
}

export async function deleteStakingRule(ruleId: string): Promise<void> {
  await db.stakingRules.delete(ruleId);
}
