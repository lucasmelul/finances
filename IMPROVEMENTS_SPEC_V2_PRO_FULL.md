# IMPROVEMENTS_SPEC_V2_PRO_FULL.md

## CONTEXTO
Este documento extiende el SPEC original sin modificar entidades existentes.
Todo lo agregado es DERIVADO o MODULAR.

---

## 1. PORTFOLIO METRICS

Objetivo: medir capital real vs rendimiento

interface PortfolioMetrics {
  totalInvestedUSD: number;
  totalValueUSD: number;
  totalPnLUSD: number;
  totalYieldUSD: number;
  performancePct: number;
}

Reglas:
- Invested = sum(buy + transfer_in - transfer_out)
- Yield = tx.kind === 'yield'
- PnL = value - invested

UI:
Invertiste / Hoy / Ganancia

---

## 2. LIQUIDEZ

interface LiquidityMetrics {
  idleCashUSD: number;
  idlePct: number;
}

Idle:
- cash
- stablecoins sin staking

Insight:
> idle > 15% → capital ocioso

---

## 3. RIESGO

interface RiskMetrics {
  cryptoExposurePct: number;
  concentrationTop3Pct: number;
}

---

## 4. INSIGHTS ENGINE

interface Insight {
  type: 'risk' | 'efficiency' | 'performance';
  title: string;
  description: string;
}

Reglas:
- BTC > 40%
- idle > 15%
- performance baja

---

## 5. SIMULADOR

interface SimulationInput {
  initialCapitalUSD: number;
  monthlyContributionUSD: number;
  durationMonths: number;
  expectedReturnPct: number;
}

Formula:
capital = capital * (1 + r/12) + aporte

Outputs:
- valor final
- retorno

---

## 6. CHAT IA

Objetivo: lenguaje natural

interface ChatIntent {
  intent: 'create' | 'query' | 'simulation';
  confidence: number;
}

Debe entender:
- "compré btc"
- "metí 2k en apple"
- "cuánto tengo"

Flow:
1. interpretar
2. preguntar si falta info
3. preview editable

---

## 7. BUSCADOR DE ASSETS

- autocomplete
- crypto + stocks

---

## 8. STAKING

yieldPerformance = actual / expected

---

## 9. CEDEAR

interface CedearBreakdown {
  underlyingReturnPct: number;
  fxImpactPct: number;
}

---

## 10. ALERTAS

- riesgo
- liquidez
- oportunidades

---

## 11. TIMELINE

interface CapitalTimeline {
  invested: number;
  value: number;
}

---

## 12. HOME

Orden:
1. metrics
2. insights
3. portfolio

---

## PRIORIDAD

1. Chat IA
2. Simulador
3. Metrics
