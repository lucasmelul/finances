/**
 * What-if simulator: aplica shocks (positivos o negativos) al portfolio actual
 * y muestra el portfolio simulado.
 *
 * Diseño:
 *  - Función pura `simulateWhatIf(holdings, prices, fx, shocks)`.
 *  - Los shocks se definen como `{ scope, deltaPct }` donde scope puede ser:
 *      - `{ kind: 'asset', ticker: 'BTC' }` → un activo específico
 *      - `{ kind: 'type', type: 'crypto' }` → todos los crypto
 *      - `{ kind: 'fx', kind2: 'ccl' }` → mover el CCL (afecta valuación ARS)
 *  - Se aplican en orden; si dos shocks afectan el mismo asset, se componen
 *    multiplicativamente.
 *  - Output: portfolio simulado con valor por asset, total, delta vs actual,
 *    y top contributors al cambio.
 */

import type { Asset, AssetType } from '@/lib/types';
import type { FxView, HoldingAggregate, PriceLookup } from '@/lib/holdings';
import { priceInUSD } from '@/lib/holdings';

// ─── Shocks ────────────────────────────────────────────────────────────────

export type ShockScope =
  | { kind: 'asset'; ticker: string }
  | { kind: 'type'; type: AssetType }
  | { kind: 'fx-ars' }; // sube ARS vs USD (CCL ↑)

export interface Shock {
  id: string;
  label: string;
  scope: ShockScope;
  /** Delta porcentual (puede ser negativo). Ej: 100 = +100% (×2), -30 = -30%. */
  deltaPct: number;
}

// ─── Presets de escenarios ─────────────────────────────────────────────────

export const SCENARIO_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  shocks: Shock[];
}> = [
  {
    id: 'btc-x2',
    label: 'BTC ×2',
    description: 'Bitcoin sube 100% (típico bull market crypto)',
    shocks: [{ id: 'btc', label: 'BTC ×2', scope: { kind: 'asset', ticker: 'BTC' }, deltaPct: 100 }],
  },
  {
    id: 'btc-down30',
    label: 'BTC -30%',
    description: 'Corrección típica de bear market',
    shocks: [{ id: 'btc', label: 'BTC -30%', scope: { kind: 'asset', ticker: 'BTC' }, deltaPct: -30 }],
  },
  {
    id: 'eth-x2',
    label: 'ETH ×2',
    description: 'Ethereum se duplica',
    shocks: [{ id: 'eth', label: 'ETH ×2', scope: { kind: 'asset', ticker: 'ETH' }, deltaPct: 100 }],
  },
  {
    id: 'equity-up20',
    label: 'Acciones +20%',
    description: 'Bull market en acciones (CEDEARs/ETFs/stocks)',
    shocks: [
      { id: 'cedear', label: 'CEDEARs +20%', scope: { kind: 'type', type: 'cedear' }, deltaPct: 20 },
      { id: 'etf', label: 'ETFs +20%', scope: { kind: 'type', type: 'etf' }, deltaPct: 20 },
      { id: 'stock', label: 'Stocks +20%', scope: { kind: 'type', type: 'stock' }, deltaPct: 20 },
    ],
  },
  {
    id: 'equity-down20',
    label: 'Acciones -20%',
    description: 'Caída de mercado equity',
    shocks: [
      { id: 'cedear', label: 'CEDEARs -20%', scope: { kind: 'type', type: 'cedear' }, deltaPct: -20 },
      { id: 'etf', label: 'ETFs -20%', scope: { kind: 'type', type: 'etf' }, deltaPct: -20 },
      { id: 'stock', label: 'Stocks -20%', scope: { kind: 'type', type: 'stock' }, deltaPct: -20 },
    ],
  },
  {
    id: 'ccl-up20',
    label: 'CCL +20%',
    description: 'Devaluación: tu portfolio en USD se mantiene, en ARS sube',
    shocks: [{ id: 'ccl', label: 'CCL +20%', scope: { kind: 'fx-ars' }, deltaPct: 20 }],
  },
  {
    id: 'bear-30',
    label: 'Bear general -30%',
    description: 'Risk-off: cripto y acciones caen 30%, stables y cash mantienen',
    shocks: [
      { id: 'crypto', label: 'Cripto -30%', scope: { kind: 'type', type: 'crypto' }, deltaPct: -30 },
      { id: 'cedear', label: 'CEDEARs -30%', scope: { kind: 'type', type: 'cedear' }, deltaPct: -30 },
      { id: 'etf', label: 'ETFs -30%', scope: { kind: 'type', type: 'etf' }, deltaPct: -30 },
      { id: 'stock', label: 'Stocks -30%', scope: { kind: 'type', type: 'stock' }, deltaPct: -30 },
    ],
  },
];

// ─── Cálculo del what-if ───────────────────────────────────────────────────

export interface WhatIfRowSim {
  assetId: string;
  ticker: string;
  type: AssetType;
  /** Valor actual en USD (sin shocks). */
  currentUSD: number;
  /** Valor simulado en USD (con shocks aplicados). */
  simulatedUSD: number;
  /** Delta absoluto = simulated - current. */
  deltaUSD: number;
  /** Delta % por activo. 0 si current=0. */
  deltaPct: number;
}

export interface WhatIfResult {
  rows: WhatIfRowSim[];
  /** Sumatorias agregadas. */
  currentTotalUSD: number;
  simulatedTotalUSD: number;
  totalDeltaUSD: number;
  /** % de cambio sobre el total. */
  totalDeltaPct: number;
  /** Top 3 que más explican el cambio (por |deltaUSD| desc). */
  topContributors: WhatIfRowSim[];
  /** Excepción: si ningún shock aplica a ningún activo del portfolio. */
  hasImpact: boolean;
  /** Stablecoins NO se shockean — quedan al valor original (mantienen). */
  stableExcluded: boolean;
}

const STABLE_TICKERS = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD']);

/**
 * Determina si un asset queda afectado por un shock dado.
 * Stablecoins NUNCA se afectan por shocks de tipo "crypto" — los excluimos
 * porque su comportamiento es fundamentalmente distinto.
 */
function shockAppliesToAsset(asset: Asset, shock: Shock): boolean {
  // Stables nunca se shockean por shocks de "crypto" o "asset BTC/ETH/etc".
  // Si el caller pone un shock específico al ticker USDT, sí aplica
  // (queda como escape hatch). Para shocks de tipo, las excluimos.
  const isStable =
    asset.type === 'crypto' && STABLE_TICKERS.has(asset.ticker.toUpperCase());

  if (shock.scope.kind === 'asset') {
    return shock.scope.ticker.toUpperCase() === asset.ticker.toUpperCase();
  }
  if (shock.scope.kind === 'type') {
    if (isStable && shock.scope.type === 'crypto') return false;
    return shock.scope.type === asset.type;
  }
  // fx-ars no afecta directo el priceUSD de un asset específico.
  return false;
}

/**
 * Aplica shocks al portfolio. El FX shock (CCL) NO mueve el valor en USD
 * de los assets — solo afectaría la conversión a ARS, que el caller hace
 * después si quiere display ARS.
 */
export function simulateWhatIf({
  holdings,
  assets,
  prices,
  fx,
  shocks,
}: {
  holdings: HoldingAggregate[];
  assets: Asset[];
  prices: Map<string, PriceLookup>;
  fx: FxView;
  shocks: Shock[];
}): WhatIfResult {
  // Agrupar holdings por asset (cross-account/portfolio).
  const byAsset = new Map<string, number>();
  for (const h of holdings) {
    byAsset.set(h.assetId, (byAsset.get(h.assetId) ?? 0) + h.qty);
  }

  const rows: WhatIfRowSim[] = [];
  let stableExcluded = false;

  for (const [assetId, qty] of byAsset) {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) continue;
    const p = prices.get(assetId);
    if (!p) continue;
    const currentUSD = qty * priceInUSD(p, fx);
    if (currentUSD <= 0) continue;

    const isStable =
      asset.type === 'crypto' && STABLE_TICKERS.has(asset.ticker.toUpperCase());

    // Compose shocks: un asset puede ser afectado por varios shocks.
    let multiplier = 1;
    for (const shock of shocks) {
      if (!shockAppliesToAsset(asset, shock)) {
        if (
          isStable &&
          shock.scope.kind === 'type' &&
          shock.scope.type === 'crypto'
        ) {
          stableExcluded = true;
        }
        continue;
      }
      multiplier *= 1 + shock.deltaPct / 100;
    }
    const simulatedUSD = currentUSD * multiplier;

    rows.push({
      assetId,
      ticker: asset.ticker,
      type: asset.type,
      currentUSD,
      simulatedUSD,
      deltaUSD: simulatedUSD - currentUSD,
      deltaPct: ((simulatedUSD - currentUSD) / currentUSD) * 100,
    });
  }

  const currentTotalUSD = rows.reduce((s, r) => s + r.currentUSD, 0);
  const simulatedTotalUSD = rows.reduce((s, r) => s + r.simulatedUSD, 0);
  const totalDeltaUSD = simulatedTotalUSD - currentTotalUSD;
  const totalDeltaPct =
    currentTotalUSD > 0 ? (totalDeltaUSD / currentTotalUSD) * 100 : 0;

  const topContributors = [...rows]
    .filter((r) => Math.abs(r.deltaUSD) > 0.01)
    .sort((a, b) => Math.abs(b.deltaUSD) - Math.abs(a.deltaUSD))
    .slice(0, 3);

  return {
    rows: [...rows].sort((a, b) => b.simulatedUSD - a.simulatedUSD),
    currentTotalUSD,
    simulatedTotalUSD,
    totalDeltaUSD,
    totalDeltaPct,
    topContributors,
    hasImpact: topContributors.length > 0,
    stableExcluded,
  };
}
