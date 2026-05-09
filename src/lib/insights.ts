/**
 * Insights Engine — genera "qué mirar hoy" desde las métricas derivadas.
 *
 * Diseño:
 *  - Función pura `generateInsights(ctx)` que recibe métricas y devuelve un
 *    array de Insight ordenados por severidad descendente.
 *  - NO se persiste en DB (Phase 1). Si en el futuro queremos
 *    "descartar permanentemente" un insight, agregamos `dismissedInsights`
 *    al UIStore.
 *  - El severity sirve para ordenar y para el badge del Home.
 *  - Las reglas son del SPEC V2 §4 + extras de baja severidad para que el
 *    Home siempre muestre algo útil incluso cuando todo está bien.
 *
 * Tono: amigable y accionable. Nunca alarmista (cumple con el "principio
 * rector" del SPEC §1: "Nada de jerga financiera intimidante").
 */

import type { LiquidityMetrics, PortfolioMetrics, RiskMetrics } from './metrics';
import type { StakingSummary } from './staking';

export type InsightType =
  | 'risk'
  | 'opportunity'
  | 'efficiency'
  | 'performance'
  | 'staking'
  | 'data_quality';

export type InsightSeverity = 'low' | 'medium' | 'high';

export interface Insight {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  /** Texto del CTA (ej. "Ver oportunidades"). Opcional. */
  actionLabel?: string;
  /** Path al que navega el CTA (ej. "/oportunidades"). */
  actionTarget?: string;
}

export interface InsightContext {
  portfolio?: PortfolioMetrics;
  liquidity?: LiquidityMetrics;
  risk?: RiskMetrics;
  /** Cantidad de oportunidades en zona de compra (precomputado por el caller). */
  opportunitiesInBuyZone?: number;
  /** Edad del FX cache en segundos (precomputado). >5min → data_quality alert. */
  fxAgeSeconds?: number;
  /** Edad del precio cripto más fresco. >2min → data_quality alert. */
  pricesAgeSeconds?: number;
  /** Resumen de staking — para detectar reglas que no rinden lo esperado. */
  staking?: StakingSummary;
}

// ─── Reglas individuales ───────────────────────────────────────────────────
//
// Cada regla es una función que mira el ctx y opcionalmente devuelve un
// Insight. Mantenerlas pequeñas hace que sea fácil sumar reglas nuevas en
// PROMPT 11 (Smart Alerts) sin tocar el motor.

type Rule = (ctx: InsightContext) => Insight | null;

/** Concentración: el activo más grande pesa demasiado. */
const ruleHighSingleAsset: Rule = ({ risk }) => {
  if (!risk || !risk.largestAssetTicker) return null;
  if (risk.largestAssetPct < 40) return null;
  const isCritical = risk.largestAssetPct > 60;
  return {
    id: 'risk-largest-asset',
    type: 'risk',
    severity: isCritical ? 'high' : 'medium',
    title: `${risk.largestAssetTicker} es ${risk.largestAssetPct.toFixed(0)}% del portfolio`,
    description: isCritical
      ? 'Concentración alta en un solo activo. Un movimiento adverso te impacta fuerte.'
      : 'Concentración considerable. Considerá diversificar si no es intencional.',
    actionLabel: 'Ver distribución',
    actionTarget: '/carteras',
  };
};

/** Concentración top-3 (excluyente con la regla de single asset). */
const ruleTop3Concentration: Rule = ({ risk }) => {
  if (!risk) return null;
  if (risk.concentrationTop3Pct < 70) return null;
  return {
    id: 'risk-top3',
    type: 'risk',
    severity: risk.concentrationTop3Pct > 85 ? 'high' : 'medium',
    title: `Top 3 activos = ${risk.concentrationTop3Pct.toFixed(0)}% del portfolio`,
    description:
      'Tres activos concentran la mayoría de tu capital. Buena para conviction, riesgosa si no es intencional.',
    actionLabel: 'Ver activos',
    actionTarget: '/carteras',
  };
};

/** Cripto total (sumando todas las cryptos no-stable) demasiado alto. */
const ruleCryptoExposure: Rule = ({ risk }) => {
  if (!risk) return null;
  if (risk.cryptoExposurePct < 60) return null;
  return {
    id: 'risk-crypto-heavy',
    type: 'risk',
    severity: 'medium',
    title: `Cripto = ${risk.cryptoExposurePct.toFixed(0)}% del portfolio`,
    description:
      'Tu portfolio está fuertemente expuesto a cripto. Volatilidad esperable.',
  };
};

/** Capital ocioso. Stables sin staking + cash. */
const ruleIdleCapital: Rule = ({ liquidity, portfolio }) => {
  if (!liquidity || !portfolio) return null;
  if (liquidity.idlePct < 15) return null;
  if (portfolio.totalValueUSD < 100) return null; // ignorar portfolios mini
  const top = liquidity.breakdown[0];
  return {
    id: 'efficiency-idle',
    type: 'efficiency',
    severity: liquidity.idlePct > 30 ? 'medium' : 'low',
    title: `${liquidity.idlePct.toFixed(0)}% de tu capital está ocioso`,
    description: top
      ? `Tenés ${top.ticker} sin generar rendimiento. Considerá staking o despliegue.`
      : 'Hay capital sin producir rendimiento.',
    actionLabel: 'Ver cuentas',
    actionTarget: '/cuentas',
  };
};

/** Performance negativa significativa. */
const rulePerformanceDown: Rule = ({ portfolio }) => {
  if (!portfolio || !portfolio.hasCompleteData) return null;
  if (portfolio.totalInvestedUSD < 500) return null;
  if (portfolio.performancePct >= -5) return null;
  const isCritical = portfolio.performancePct < -20;
  return {
    id: 'performance-down',
    type: 'performance',
    severity: isCritical ? 'high' : 'medium',
    title: `Tu portfolio está ${portfolio.performancePct.toFixed(1)}% abajo`,
    description: isCritical
      ? 'Caída fuerte vs lo invertido. Revisá si es por mercado o por algún activo concreto.'
      : 'Estás abajo del costo. Mantené la calma y revisá la composición.',
  };
};

/** Performance positiva fuerte (insight bueno). */
const rulePerformanceUp: Rule = ({ portfolio }) => {
  if (!portfolio || !portfolio.hasCompleteData) return null;
  if (portfolio.totalInvestedUSD < 500) return null;
  if (portfolio.performancePct < 20) return null;
  return {
    id: 'performance-up',
    type: 'performance',
    severity: 'low',
    title: `Tu portfolio está +${portfolio.performancePct.toFixed(1)}%`,
    description:
      'Buen momento para evaluar si tomás ganancias parciales o seguís el plan.',
  };
};

/** Oportunidades en zona de compra. */
const ruleBuyOpportunities: Rule = ({ opportunitiesInBuyZone }) => {
  if (!opportunitiesInBuyZone || opportunitiesInBuyZone === 0) return null;
  return {
    id: 'opportunity-buy-zone',
    type: 'opportunity',
    severity: 'low',
    title:
      opportunitiesInBuyZone === 1
        ? 'Hay 1 activo en zona de compra'
        : `Hay ${opportunitiesInBuyZone} activos en zona de compra`,
    description: 'Precios cercanos al soporte según el cálculo automático de S/R.',
    actionLabel: 'Ver oportunidades',
    actionTarget: '/oportunidades',
  };
};

/** Staking: hay reglas activas que rinden por debajo del 90% esperado. */
const ruleStakingUnderperform: Rule = ({ staking }) => {
  if (!staking || staking.rulesBelowThreshold === 0) return null;
  const n = staking.rulesBelowThreshold;
  return {
    id: 'staking-underperform',
    type: 'staking',
    severity: 'medium',
    title:
      n === 1
        ? '1 regla de staking rinde menos de lo esperado'
        : `${n} reglas de staking rinden menos de lo esperado`,
    description:
      'El yield real está por debajo del 90% del APY que cargaste. Revisá el APY actual.',
    actionLabel: 'Ver staking',
    actionTarget: '/staking',
  };
};

/** Datos incompletos: avisar para que el usuario sepa que la métrica es parcial. */
const ruleDataQuality: Rule = ({ portfolio }) => {
  if (!portfolio) return null;
  if (portfolio.hasCompleteData) return null;
  return {
    id: 'data-quality-incomplete',
    type: 'data_quality',
    severity: 'low',
    title: 'Datos parciales en algunas operaciones',
    description:
      'Algunas tx no tienen FX snapshot. Las métricas son estimaciones. Editá las tx en Operaciones.',
    actionLabel: 'Ver operaciones',
    actionTarget: '/operaciones',
  };
};

/** FX desactualizado: feed se quedó frenado. */
const ruleFxStale: Rule = ({ fxAgeSeconds }) => {
  if (fxAgeSeconds == null) return null;
  if (fxAgeSeconds < 300) return null; // <5 min está OK
  const min = Math.round(fxAgeSeconds / 60);
  return {
    id: 'data-fx-stale',
    type: 'data_quality',
    severity: fxAgeSeconds > 1800 ? 'medium' : 'low',
    title: `FX desactualizado (hace ${min}m)`,
    description:
      'No se pudo refrescar la cotización del USD. Las conversiones ARS↔USD pueden estar desfasadas.',
  };
};

/** Precios cripto desactualizados — síntoma típico de tab inactivo o red caída. */
const rulePricesStale: Rule = ({ pricesAgeSeconds }) => {
  if (pricesAgeSeconds == null) return null;
  if (pricesAgeSeconds < 180) return null;
  const min = Math.round(pricesAgeSeconds / 60);
  return {
    id: 'data-prices-stale',
    type: 'data_quality',
    severity: pricesAgeSeconds > 600 ? 'medium' : 'low',
    title: `Precios cripto desactualizados (hace ${min}m)`,
    description:
      'El polling no está refrescando. Si abriste la app después de un rato, dale unos segundos.',
  };
};

/** Stables ociosas: mucho porcentaje en stablecoins sin staking. */
const ruleIdleStables: Rule = ({ risk, portfolio }) => {
  if (!risk || !portfolio) return null;
  if (risk.stableExposurePct < 20) return null;
  if (portfolio.totalValueUSD < 200) return null;
  return {
    id: 'efficiency-idle-stables',
    type: 'efficiency',
    severity: risk.stableExposurePct > 40 ? 'medium' : 'low',
    title: `${risk.stableExposurePct.toFixed(0)}% en stablecoins paradas`,
    description:
      'Tenés mucha liquidez en stables sin generar rendimiento. Considerá hacer staking o moverlas a un activo productivo.',
    actionLabel: 'Ver staking',
    actionTarget: '/staking',
  };
};

/** Falta de equities: portfolio sin acciones, CEDEARs ni ETFs. */
const ruleLowDiversification: Rule = ({ risk, portfolio }) => {
  if (!risk || !portfolio) return null;
  if (portfolio.totalValueUSD < 1000) return null;
  if (risk.equityExposurePct >= 5) return null;
  // Solo aplica si el portfolio NO es principalmente cash/stables
  const investedPct = 100 - risk.stableExposurePct - risk.cashExposurePct;
  if (investedPct < 10) return null;
  return {
    id: 'risk-no-equity',
    type: 'risk',
    severity: 'low',
    title: 'Sin exposición a acciones o CEDEARs',
    description:
      'Agregar equities (CEDEARs, ETFs) puede bajar la volatilidad del portfolio. El S&P 500 históricamente rindió ~10% anual.',
    actionLabel: 'Buscar activos',
    actionTarget: '/chat',
  };
};

/** Estado positivo: si nada disparó, mostrar un mensaje neutro/discreto. */
const ruleAllGood: Rule = ({ portfolio, risk, liquidity }) => {
  // Solo se emite si TODAS las reglas previas devolverían null (este check
  // se hace en `generateInsights` después de filtrar). Por eso devolvemos
  // siempre un insight low de tipo `performance` y dejamos que el ranking
  // lo desplace si hay otros.
  if (!portfolio || !risk || !liquidity) return null;
  return {
    id: 'all-good',
    type: 'performance',
    severity: 'low',
    title: 'Tu portfolio se ve sano',
    description: 'Sin alertas relevantes. Buen momento para revisar tu plan a futuro.',
  };
};

// ─── Motor ─────────────────────────────────────────────────────────────────

const RULES: Rule[] = [
  ruleHighSingleAsset,
  ruleTop3Concentration,
  ruleCryptoExposure,
  ruleIdleCapital,
  ruleIdleStables,
  rulePerformanceDown,
  rulePerformanceUp,
  ruleStakingUnderperform,
  ruleLowDiversification,
  ruleBuyOpportunities,
  ruleFxStale,
  rulePricesStale,
  ruleDataQuality,
];

/**
 * Genera la lista de insights aplicables. Ordena por severity (high → low)
 * y luego por orden de declaración (las reglas más críticas listadas primero
 * en `RULES` pesan más al desempatar).
 *
 * Si no se generó ningún insight problema, agrega un "all good" como
 * fallback positivo (cumple SPEC V2 §4: "Si no hay problemas, mostrar un
 * estado positivo discreto").
 */
export function generateInsights(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  for (const rule of RULES) {
    const r = rule(ctx);
    if (r) out.push(r);
  }
  // Si no hay nada accionable Y hay datos suficientes, sumamos el all-good.
  const accionable = out.filter((i) => i.type !== 'data_quality');
  if (accionable.length === 0) {
    const ok = ruleAllGood(ctx);
    if (ok) out.push(ok);
  }

  // Sort: severity desc, luego mantener orden de RULES para desempate.
  const sevOrder: Record<InsightSeverity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
}
