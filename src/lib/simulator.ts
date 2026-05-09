/**
 * Simulador de inversión — funciones puras y testeables.
 *
 * El SPEC dice "simulación con capital inicial + aporte mensual + plazo +
 * retorno esperado". Hacemos eso + dos extras útiles:
 *  1. Serie mensual completa (para chart).
 *  2. Soporte para múltiples escenarios al mismo input (presets conservador
 *     / medio / agresivo) con un único call.
 *
 * Modelo: capital compone mensualmente. El aporte mensual se aplica al
 * INICIO del mes (suposición conservadora — si fuese al final, el último
 * aporte no compondría).
 *
 *     capital_mes_n = capital_mes_(n-1) × (1 + r/12) + aporte_mensual
 *
 * Retornos en TASA NOMINAL ANUAL — el más natural para el usuario.
 *
 * Aclaración del criterio §5: "Si pongo 10.000 iniciales, 1.000 mensual,
 * 12 meses, 0% retorno, final debe ser 22.000". Implementación cumple:
 *  - mes 1: 10000 × 1.0 + 1000 = 11000
 *  - mes 2: 11000 × 1.0 + 1000 = 12000
 *  - ...
 *  - mes 12: 21000 × 1.0 + 1000 = 22000  ✓
 */

// ─── Inputs y outputs ──────────────────────────────────────────────────────

export interface SimulationInput {
  initialCapitalUSD: number;
  monthlyContributionUSD: number;
  durationMonths: number;
  /** Retorno anual esperado en %. Ej: 8 = 8% anual. */
  expectedAnnualReturnPct: number;
}

export interface SimulationPoint {
  /** 0 = inicial, 1..N = fin del mes. */
  month: number;
  /** Capital total al cierre del mes. */
  capitalUSD: number;
  /** Total aportado hasta ese mes (capital inicial + aportes). */
  contributedUSD: number;
}

export interface SimulationResult {
  finalValueUSD: number;
  totalInvestedUSD: number;
  totalReturnUSD: number;
  /** Return total acumulado (no anualizado). En %. */
  returnPct: number;
  /** Tasa anualizada efectiva (CAGR). En %. */
  cagrPct: number;
  /** Serie completa para gráfico. Incluye el punto 0. */
  series: SimulationPoint[];
}

// ─── Cálculo ───────────────────────────────────────────────────────────────

/**
 * Newton-Raphson para la TIR mensual de un flujo DCA.
 * Cash flows: -initialCapital en t=0, -monthly en t=1..N-1,
 * (finalValue - monthly) en t=N (último aporte neto contra el cobro).
 */
function computeMonthlyIRR(
  initialCapital: number,
  monthlyContribution: number,
  months: number,
  finalValue: number,
): number {
  const cfs = new Array<number>(months + 1).fill(-monthlyContribution);
  cfs[0] = -initialCapital;
  cfs[months] += finalValue; // net inflow at maturity

  let r = 0.008; // 0.8% mensual como punto de partida (~10% anual)
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t <= months; t++) {
      const disc = Math.pow(1 + r, -t);
      npv += cfs[t] * disc;
      if (t > 0) dnpv -= t * cfs[t] * Math.pow(1 + r, -(t + 1));
    }
    if (Math.abs(dnpv) < 1e-12) break;
    const delta = npv / dnpv;
    r -= delta;
    if (r <= -0.999) r = 0.001; // evitar divergencia
    if (Math.abs(delta) < 1e-10) break;
  }
  return r;
}

/**
 * Corre la simulación. Maneja edge cases:
 *  - duración 0 → devuelve solo el punto inicial
 *  - retorno 0 → no compone (resultado = inicial + aportes × meses)
 *  - retorno negativo → válido (escenario bear)
 */
export function runSimulation(input: SimulationInput): SimulationResult {
  const {
    initialCapitalUSD,
    monthlyContributionUSD,
    durationMonths,
    expectedAnnualReturnPct,
  } = input;

  const monthlyRate = expectedAnnualReturnPct / 100 / 12;
  const series: SimulationPoint[] = [
    { month: 0, capitalUSD: initialCapitalUSD, contributedUSD: initialCapitalUSD },
  ];

  let capital = initialCapitalUSD;
  let contributed = initialCapitalUSD;

  for (let m = 1; m <= durationMonths; m++) {
    // Componer y luego aportar (aporte de fin de mes; equivalente a inicio
    // del mes siguiente). Es el modelo más conservador.
    capital = capital * (1 + monthlyRate) + monthlyContributionUSD;
    contributed += monthlyContributionUSD;
    series.push({ month: m, capitalUSD: capital, contributedUSD: contributed });
  }

  const finalValueUSD = capital;
  const totalInvestedUSD = contributed;
  const totalReturnUSD = finalValueUSD - totalInvestedUSD;
  const returnPct =
    totalInvestedUSD > 0 ? (totalReturnUSD / totalInvestedUSD) * 100 : 0;

  // TIR (IRR): tasa interna de retorno mensual, anualizada a efectivo anual.
  // Para DCA con aportes mensuales, la TIR es la métrica correcta — computa
  // el r que iguala el VPN de los flujos reales a 0 (Newton-Raphson).
  // Resultado: debe quedar muy cerca del `expectedAnnualReturnPct` ingresado.
  let cagrPct = 0;
  if (totalInvestedUSD > 0 && durationMonths > 0 && finalValueUSD > 0) {
    const monthlyIRR = computeMonthlyIRR(
      initialCapitalUSD,
      monthlyContributionUSD,
      durationMonths,
      finalValueUSD,
    );
    cagrPct = (Math.pow(1 + monthlyIRR, 12) - 1) * 100;
  }

  return {
    finalValueUSD,
    totalInvestedUSD,
    totalReturnUSD,
    returnPct,
    cagrPct,
    series,
  };
}

// ─── Presets de escenarios ─────────────────────────────────────────────────

export interface ScenarioPreset {
  id: string;
  label: string;
  /** Retorno anual del preset. */
  annualReturnPct: number;
  /** Color para el chart (hex o CSS var). */
  color: string;
  description: string;
}

export const PRESETS: ScenarioPreset[] = [
  {
    id: 'conservative',
    label: 'Conservador',
    annualReturnPct: 5,
    color: '#22D3EE', // cyan / corto
    description: 'Bonos USA, plazos fijos UVA, fondos T+1 conservadores',
  },
  {
    id: 'medium',
    label: 'Medio',
    annualReturnPct: 8,
    color: '#A78BFA', // violet / medio
    description: 'S&P 500 promedio histórico (8-10% anual real)',
  },
  {
    id: 'aggressive',
    label: 'Agresivo',
    annualReturnPct: 12,
    color: '#FB923C', // orange / trade
    description: 'Acciones tech, growth, mercado emergente',
  },
  {
    id: 'crypto-bull',
    label: 'Crypto bullish',
    annualReturnPct: 25,
    color: '#34D399', // green / largo
    description: 'BTC/ETH en ciclo alcista. Volatilidad alta.',
  },
];

/**
 * Corre la simulación contra TODOS los presets — útil para mostrar
 * comparación lado a lado en la UI.
 */
export function runScenarioComparison(
  input: Omit<SimulationInput, 'expectedAnnualReturnPct'>,
): Array<{ preset: ScenarioPreset; result: SimulationResult }> {
  return PRESETS.map((preset) => ({
    preset,
    result: runSimulation({ ...input, expectedAnnualReturnPct: preset.annualReturnPct }),
  }));
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Conversión de "X años" a meses con clamp a positivos. */
export function yearsToMonths(years: number): number {
  return Math.max(0, Math.round(years * 12));
}
