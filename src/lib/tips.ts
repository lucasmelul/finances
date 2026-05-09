/**
 * Motor de tips y recomendaciones para el carrusel del Home.
 *
 * Genera dos tipos de tarjetas:
 *  1. Dinámicas — alimentadas por los datos reales del portfolio del usuario.
 *     Precios live, rendimiento, activos, capital ocioso, etc.
 *  2. Estáticas — consejos educativos y financieros para el inversor argentino.
 *     Rotan de forma pseudoaleatoria basada en el día del mes.
 *
 * Diseño: función pura sin side effects. El caller provee el contexto.
 */

import type { Asset } from '@/lib/types';
import type { HoldingAggregate, PriceLookup, FxView } from '@/lib/holdings';
import type { PortfolioMetrics, RiskMetrics, LiquidityMetrics } from '@/lib/metrics';
import { fmtMoney } from '@/lib/format';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TipTag =
  | 'Mercado'
  | 'Tu portfolio'
  | 'Educación'
  | 'Oportunidad'
  | 'Estrategia';

export interface TipCard {
  id: string;
  tag: TipTag;
  /** Color del borde izquierdo de la tarjeta. */
  accent: string;
  title: string;
  body: string;
  cta?: { label: string; path: string };
}

// ─── Paleta de colores por tag ────────────────────────────────────────────────

export const TIP_ACCENT: Record<TipTag, string> = {
  Mercado:      'hsl(var(--accent))',
  'Tu portfolio': 'hsl(var(--positive))',
  Educación:    '#A78BFA',
  Oportunidad:  '#FB923C',
  Estrategia:   '#22D3EE',
};

// ─── Tips estáticos ───────────────────────────────────────────────────────────

const STATIC_TIPS: Omit<TipCard, 'id'>[] = [
  {
    tag: 'Educación',
    accent: TIP_ACCENT.Educación,
    title: 'El poder del interés compuesto',
    body: 'US$10k al 8% anual se convierten en US$46k en 20 años sin aportar nada más. La clave es no interrumpir el ciclo.',
  },
  {
    tag: 'Educación',
    accent: TIP_ACCENT.Educación,
    title: 'CEDEARs: dos activos en uno',
    body: 'Al comprar un CEDEAR apostás a la empresa subyacente (ej. AAPL) Y al tipo de cambio CCL. Si el CCL sube, tu CEDEAR en ARS también sube aunque la acción no se mueva.',
  },
  {
    tag: 'Estrategia',
    accent: TIP_ACCENT.Estrategia,
    title: 'DCA: tu mejor herramienta contra la volatilidad',
    body: 'Aportar un monto fijo periódicamente (ej. $500/mes) promedia el precio de entrada. Comprás más cuando baja y menos cuando sube. El resultado: un costo promedio menor al que sentís comprando de golpe.',
  },
  {
    tag: 'Mercado',
    accent: TIP_ACCENT.Mercado,
    title: 'S&P 500: el benchmark que todo portfolio compite',
    body: 'El índice de las 500 empresas más grandes de EE.UU. promedió ~10% anual en los últimos 100 años. Ningún período de 20 años fue negativo.',
  },
  {
    tag: 'Estrategia',
    accent: TIP_ACCENT.Estrategia,
    title: 'Rebalanceo trimestral',
    body: 'Cada 3 meses revisá si tu distribución se alejó del objetivo. Vendé lo que creció demasiado y comprá lo que quedó atrás. Es la versión sistemática de "comprar barato, vender caro".',
  },
  {
    tag: 'Mercado',
    accent: TIP_ACCENT.Mercado,
    title: 'BTC y el halving',
    body: 'Cada ~4 años, el halving reduce a la mitad la emisión de nuevos BTC. Históricamente los 12-18 meses post-halving fueron los mejores períodos alcistas. El próximo fue en abril 2024.',
  },
  {
    tag: 'Educación',
    accent: TIP_ACCENT.Educación,
    title: 'Bonos soberanos: AL30 vs GD35',
    body: 'AL30 (ley argentina) y GD35 (ley New York) son bonos en USD. GD35 tiene mayor protección legal pero cotiza con prima. Para parqueo en USD son una alternativa al plazo fijo dolarizado.',
  },
  {
    tag: 'Estrategia',
    accent: TIP_ACCENT.Estrategia,
    title: 'Regla del fondo de emergencia',
    body: 'Antes de invertir, tené entre 3-6 meses de gastos en cash o activos líquidos (FCI T+0, LECAP). El objetivo es nunca liquidar inversiones en el peor momento.',
  },
  {
    tag: 'Educación',
    accent: TIP_ACCENT.Educación,
    title: 'Stablecoins con rendimiento',
    body: 'USDT/USDC en staking en plataformas serias (Binance, Lemon, Belo) puede rendir 4-8% anual en USD. Mucho mejor que tener el dólar en el colchón.',
  },
  {
    tag: 'Mercado',
    accent: TIP_ACCENT.Mercado,
    title: 'LECAP y LEDES: parking en pesos',
    body: 'Las letras del Tesoro de corto plazo (LECAP/LEDES) ofrecen tasa fija en pesos. Son buenas para estacionar capital mientras decidís dónde invertir, mejor que la caja de ahorro.',
  },
  {
    tag: 'Estrategia',
    accent: TIP_ACCENT.Estrategia,
    title: 'La regla del 4%',
    body: 'En teoría financiera, un portfolio puede sostenerse retirando el 4% anual indefinidamente. A US$500k ahorrados, eso equivale a US$20k/año (~US$1.667/mes) sin tocar el capital.',
  },
  {
    tag: 'Educación',
    accent: TIP_ACCENT.Educación,
    title: 'Correlación: el arte de diversificar bien',
    body: 'Dos activos correlacionados caen juntos. Combiná BTC (cripto) + SPY (acciones EE.UU.) + bonos AR para que no todo baje al mismo tiempo. Diversificar no es tener muchos activos, es tener activos distintos.',
  },
  {
    tag: 'Estrategia',
    accent: TIP_ACCENT.Estrategia,
    title: 'Impuesto a las ganancias en Argentina',
    body: 'CEDEARs y acciones locales tienen exención del impuesto a la renta para personas físicas. Bonos y FCI tributan según el régimen. Consultá con un contador antes de grandes movimientos.',
  },
  {
    tag: 'Mercado',
    accent: TIP_ACCENT.Mercado,
    title: 'ETFs: diversificación instantánea',
    body: 'Comprar SPY = tener fracciones de Apple, Microsoft, Google, y 497 empresas más. Un solo activo, máxima diversificación en acciones EE.UU. con comisión anual de 0.09%.',
  },
];

// ─── Generador de tips dinámicos ──────────────────────────────────────────────

export interface TipsContext {
  assets?: Asset[];
  holdings?: HoldingAggregate[];
  prices?: Map<string, PriceLookup & { ch24Pct?: number }>;
  fx: FxView;
  portfolio?: PortfolioMetrics;
  risk?: RiskMetrics;
  liquidity?: LiquidityMetrics;
}

function buildDynamicTips(ctx: TipsContext): TipCard[] {
  const tips: TipCard[] = [];
  const { assets, prices, portfolio, risk, liquidity } = ctx;

  // 1. Mejor y peor activo del día
  if (prices && assets) {
    let best: { ticker: string; pct: number } | null = null;
    let worst: { ticker: string; pct: number } | null = null;

    for (const [assetId, p] of prices) {
      if (p.ch24Pct == null) continue;
      const asset = assets.find((a) => a.id === assetId);
      if (!asset) continue;
      if (!best || p.ch24Pct > best.pct) best = { ticker: asset.ticker, pct: p.ch24Pct };
      if (!worst || p.ch24Pct < worst.pct) worst = { ticker: asset.ticker, pct: p.ch24Pct };
    }

    if (best && best.pct > 1) {
      tips.push({
        id: 'dyn-best-mover',
        tag: 'Mercado',
        accent: TIP_ACCENT.Mercado,
        title: `${best.ticker} sube ${best.pct.toFixed(1)}% hoy`,
        body: 'Uno de los activos que seguís tuvo un movimiento destacado en las últimas 24 hs.',
        cta: { label: 'Ver activos', path: '/carteras' },
      });
    }

    if (worst && worst.pct < -2) {
      tips.push({
        id: 'dyn-worst-mover',
        tag: 'Oportunidad',
        accent: TIP_ACCENT.Oportunidad,
        title: `${worst.ticker} baja ${Math.abs(worst.pct).toFixed(1)}% hoy`,
        body: 'Las correcciones pueden ser oportunidades de compra para inversores de largo plazo con DCA activo.',
        cta: { label: 'Operar', path: '/chat' },
      });
    }
  }

  // 2. Activo más pesado del portfolio
  if (risk && risk.largestAssetTicker && risk.largestAssetPct > 20) {
    tips.push({
      id: 'dyn-top-holding',
      tag: 'Tu portfolio',
      accent: TIP_ACCENT['Tu portfolio'],
      title: `${risk.largestAssetTicker} es ${risk.largestAssetPct.toFixed(0)}% de tu portfolio`,
      body: risk.largestAssetPct > 50
        ? 'Alta concentración. Pensá si es intencional o si querés diversificar parte hacia otro activo.'
        : 'Es tu posición más grande. Mantenerse actualizado de las noticias de este activo es clave.',
    });
  }

  // 3. Performance del portfolio
  if (portfolio && portfolio.totalInvestedUSD > 500 && portfolio.hasCompleteData) {
    const pct = portfolio.performancePct;
    if (Math.abs(pct) > 3) {
      tips.push({
        id: 'dyn-portfolio-perf',
        tag: 'Tu portfolio',
        accent: TIP_ACCENT['Tu portfolio'],
        title: pct >= 0
          ? `Tus inversiones crecieron ${pct.toFixed(1)}%`
          : `Tu portfolio está ${Math.abs(pct).toFixed(1)}% abajo`,
        body: pct >= 0
          ? `Tenés ${fmtMoney(portfolio.totalValueUSD, 'USD')} vs ${fmtMoney(portfolio.totalInvestedUSD, 'USD')} invertidos. Buen momento para revisar si todo sigue según el plan.`
          : 'Las caídas son parte del ciclo. Revisá si los fundamentos de tus activos siguen intactos antes de tomar decisiones.',
        cta: { label: 'Ver portfolio', path: '/carteras' },
      });
    }
  }

  // 4. Capital ocioso
  if (liquidity && liquidity.idleCashUSD > 200 && portfolio && portfolio.totalValueUSD > 500) {
    const top = liquidity.breakdown[0];
    tips.push({
      id: 'dyn-idle-capital',
      tag: 'Oportunidad',
      accent: TIP_ACCENT.Oportunidad,
      title: `${fmtMoney(liquidity.idleCashUSD, 'USD')} sin generar rendimiento`,
      body: top
        ? `Tus ${top.ticker} están parados. Hacerles staking o moverlos a un activo productivo podría sumar rendimiento extra.`
        : 'Tenés capital que no está generando rendimiento. Considerá desplegarlo.',
      cta: { label: 'Ver staking', path: '/staking' },
    });
  }

  // 5. Distribución (cuando hay sesgo muy claro)
  if (risk) {
    if (risk.bondExposurePct > 50) {
      tips.push({
        id: 'dyn-bond-heavy',
        tag: 'Estrategia',
        accent: TIP_ACCENT.Estrategia,
        title: `${risk.bondExposurePct.toFixed(0)}% en bonos soberanos`,
        body: 'Portafolio conservador en USD. Si tu horizonte es largo plazo, agregar algo de equity puede mejorar el retorno esperado sin sacrificar demasiado estabilidad.',
      });
    } else if (risk.cryptoExposurePct > 60) {
      tips.push({
        id: 'dyn-crypto-heavy',
        tag: 'Estrategia',
        accent: TIP_ACCENT.Estrategia,
        title: `${risk.cryptoExposurePct.toFixed(0)}% en cripto`,
        body: 'Portfolio agresivo. La volatilidad cripto puede ser alta. Considerá partes en bonos o CEDEARs para reducir el drawdown máximo esperado.',
      });
    }
  }

  // 6. Valor total del portfolio (milestone motivacional)
  if (portfolio && portfolio.totalValueUSD > 0) {
    const milestones = [1000, 5000, 10000, 25000, 50000, 100000, 250000];
    const nextMilestone = milestones.find((m) => m > portfolio.totalValueUSD);
    if (nextMilestone) {
      const remaining = nextMilestone - portfolio.totalValueUSD;
      if (remaining < nextMilestone * 0.3) {
        tips.push({
          id: 'dyn-milestone',
          tag: 'Tu portfolio',
          accent: TIP_ACCENT['Tu portfolio'],
          title: `Cerca de ${fmtMoney(nextMilestone, 'USD')}`,
          body: `Te faltan solo ${fmtMoney(remaining, 'USD')} para alcanzar el próximo hito. Seguí el plan.`,
        });
      }
    }
  }

  return tips;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Genera la lista de TipCards ordenada: dinámicos primero, luego estáticos.
 * Los estáticos se mezclan en orden pseudoaleatorio por día del mes para que
 * cada día el usuario vea un conjunto diferente.
 */
export function generateTips(ctx: TipsContext): TipCard[] {
  const dynamic = buildDynamicTips(ctx);

  // Rotar estáticos según el día del mes
  const dayIndex = new Date().getDate() % STATIC_TIPS.length;
  const rotated = [
    ...STATIC_TIPS.slice(dayIndex),
    ...STATIC_TIPS.slice(0, dayIndex),
  ];

  const statics: TipCard[] = rotated.map((t, i) => ({
    ...t,
    id: `static-${i}`,
  }));

  return [...dynamic, ...statics];
}
