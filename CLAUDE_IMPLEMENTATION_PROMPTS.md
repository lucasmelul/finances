# CLAUDE_IMPLEMENTATION_PROMPTS.md

Prompts incrementales para implementar las mejoras sobre la app existente de Portfolio Tracker.

Regla general para todos los prompts:
- No reemplazar el SPEC original.
- No modificar entidades core existentes salvo que sea estrictamente necesario.
- Priorizar cambios additive/derived/computed.
- Mantener compatibilidad con Dexie, Zustand, TanStack Query, React, TypeScript y Tailwind.
- Antes de implementar, revisar el código existente y adaptar nombres, paths y patrones actuales.
- No romper funcionalidades existentes.
- Si hay dudas entre crear algo nuevo o modificar algo existente, preferir módulo nuevo reutilizable.

---

# PROMPT 1 — Portfolio Metrics / Capital Real

Implementá una capa de métricas globales derivadas para mostrar capital real invertido vs valor actual.

Objetivo funcional:
Quiero saber:
- cuánto capital puse realmente,
- cuánto vale hoy,
- cuánto gané/perdí,
- cuánto corresponde a yield,
- performance porcentual total.

Requisitos:
- Crear un cálculo derivado, no persistido.
- No modificar Transaction, Asset, Account ni Portfolio.
- Usar transacciones existentes.
- Convertir todo a USD usando snapshots históricos cuando estén disponibles.
- Si falta fxSnapshot, usar una estrategia fallback clara y documentada.

Métricas:
- totalInvestedUSD
- totalValueUSD
- totalPnLUSD
- totalYieldUSD
- performancePct

Reglas:
- totalInvestedUSD = compras + transfer_in - transfer_out
- totalYieldUSD = suma de transacciones kind='yield'
- totalValueUSD = valuación actual existente del portfolio
- totalPnLUSD = totalValueUSD - totalInvestedUSD
- performancePct = totalPnLUSD / totalInvestedUSD

UX:
- Agregar estas métricas al Home/Hero sin eliminar información existente.
- Mostrar:
  - “Invertiste”
  - “Hoy vale”
  - “Ganancia/Pérdida”
- Respetar modo privacidad si existe.
- Si no hay datos suficientes, mostrar estado vacío claro.

Criterio de aceptación:
- Si cargo una compra de 1000 USD y el portfolio vale 1200 USD, debe mostrar +200 USD / +20%.
- Si hay yield, debe aparecer separado del PnL total.

---

# PROMPT 2 — Liquidity & Idle Capital

Implementá una capa derivada para detectar capital ocioso.

Objetivo funcional:
Quiero saber cuánta plata tengo sin producir rendimiento.

Requisitos:
- No modificar entidades existentes.
- Crear cálculo derivado reutilizable.
- Detectar efectivo y stablecoins sin staking activo.

Métricas:
- idleCashUSD
- idlePct
- deployedPct

Definición de idle:
- activos type='cash'
- stablecoins como USDT, USDC, DAI u otras configurables
- stablecoins que no tengan StakingRule activa asociada

UX:
- Agregar card en Dashboard o Home secundario:
  - “Capital ocioso”
  - monto
  - porcentaje del portfolio
- Si idlePct > 15%, generar un insight de eficiencia.

Criterio de aceptación:
- Si tengo 10.000 USD de portfolio y 2.000 USDC sin staking, idlePct debe ser 20%.
- Si ese USDC tiene staking activo, no debe contarse como idle.

---

# PROMPT 3 — Risk Metrics / Exposure

Implementá métricas de riesgo y exposición del portfolio.

Objetivo funcional:
Quiero entender si estoy demasiado expuesto a crypto, a un activo, o a pocos activos.

Requisitos:
- Crear cálculos derivados.
- No modificar modelos core.
- Usar holdings/valuación actual.

Métricas:
- cryptoExposurePct
- stableExposurePct
- equityExposurePct
- bondExposurePct si aplica
- cashExposurePct si aplica
- concentrationTop1Pct
- concentrationTop3Pct
- largestAssetTicker
- largestAssetPct

Reglas:
- Agrupar por Asset.type.
- Ordenar holdings por valor actual.
- Top 1 y Top 3 se calculan sobre valor total del portfolio.
- Crypto debería incluir BTC, ETH y otros crypto no stable.
- Stable debe separarse de crypto volátil.

UX:
- Agregar sección “Riesgo / Exposición” en Dashboard.
- Mostrar al menos:
  - Crypto %
  - Stable %
  - Top 3 %
  - Activo más grande
- Usar warnings visuales si:
  - BTC > 40%
  - Top 3 > 70%
  - Crypto total > 60%

Criterio de aceptación:
- Si BTC representa 45% del portfolio, debe aparecer warning.
- Si top 3 representan 75%, debe aparecer warning de concentración.

---

# PROMPT 4 — Insights Engine

Implementá un motor de insights automáticos.

Objetivo funcional:
La app debe decirme “qué mirar hoy” o “qué corregir”, no solo mostrar números.

Requisitos:
- Crear módulo puro/derivado.
- No persistir insights en DB inicialmente.
- Los insights se generan a partir de:
  - PortfolioMetrics
  - LiquidityMetrics
  - RiskMetrics
  - Oportunidades existentes si las hay
  - Staking rules si existen

Modelo sugerido:
interface Insight {
  id: string;
  type: 'risk' | 'opportunity' | 'efficiency' | 'performance' | 'staking';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  actionLabel?: string;
  actionTarget?: string;
}

Reglas iniciales:
- BTC > 40% → risk/high o medium según valor.
- Top 3 > 70% → risk/high.
- idlePct > 15% → efficiency/medium.
- stablecoins sin staking → efficiency/medium.
- yield real menor al esperado → staking/medium.
- activo en zona de compra → opportunity/low/medium.
- performancePct negativa → performance/medium.

UX:
- Agregar sección en Home: “Qué hacer hoy”.
- Mostrar máximo 3 insights principales.
- Permitir “ver todos” si hay más.
- Cada insight debe tener título claro, descripción corta y posible acción.
- No usar lenguaje alarmista.

Criterio de aceptación:
- Si hay BTC > 40%, debe generarse insight.
- Si hay capital ocioso > 15%, debe generarse insight.
- Si no hay problemas, mostrar un estado positivo discreto.

---

# PROMPT 5 — Simulation Module Básico

Implementá un módulo de simulación de inversión/DCA.

Objetivo funcional:
Quiero simular escenarios futuros con capital inicial, aporte mensual, plazo y retorno esperado.

Requisitos:
- Crear pantalla nueva “Simulador”.
- No depende de modificar modelos existentes.
- El cálculo debe ser puro y testeable.
- Guardar o no simulaciones queda opcional; priorizar cálculo en memoria.

Inputs:
- initialCapitalUSD
- monthlyContributionUSD
- durationMonths
- expectedAnnualReturnPct

Outputs:
- finalValueUSD
- totalInvestedUSD
- totalReturnUSD
- returnPct
- serie mensual para gráfico

Fórmula:
capitalMes = capitalAnterior * (1 + tasaAnual/12) + aporteMensual

UX:
- Inputs simples, mobile-first.
- Presets:
  - Conservador 5%
  - Medio 8%
  - Agresivo 12%
  - Crypto bullish 25% opcional
- Mostrar:
  - valor final
  - total aportado
  - ganancia estimada
  - gráfico de crecimiento
- Permitir comparar al menos 3 escenarios.

Criterio de aceptación:
- Si pongo 10.000 iniciales, 1.000 mensual, 12 meses, 0% retorno, final debe ser 22.000.
- Con retorno positivo debe componer mensualmente.
- Debe poder usarse sin tener portfolio cargado.

---

# PROMPT 6 — Simulation Module Avanzado sobre Portfolio Real

Extendé el simulador para usar el portfolio actual como punto de partida.

Objetivo funcional:
Quiero simular qué pasa con mi portfolio real ante escenarios de mercado.

Escenarios mínimos:
- BTC x2
- BTC -30%
- ETH x2
- Acciones +20%
- Acciones -20%
- Dólar CCL +20%
- Stablecoins mantienen valor
- Bear market general -30%

Requisitos:
- Usar holdings actuales.
- Aplicar shocks por tipo de activo o ticker.
- No modificar datos reales.
- Resultado en modo “what if”.

Outputs:
- valor actual
- valor simulado
- diferencia absoluta
- diferencia porcentual
- activos que más explican el cambio

UX:
- Nueva pestaña dentro de Simulador: “Sobre mi portfolio”.
- Lista de escenarios rápidos.
- Permitir customizar shocks.
- Mostrar resultado claro:
  - “Tu portfolio pasaría de X a Y”
  - “Diferencia: +Z”

Criterio de aceptación:
- Si BTC es 50% del portfolio y BTC x2, el portfolio total debería subir aproximadamente 50%, manteniendo el resto constante.

---

# PROMPT 7 — AI Chat Rework / Intent-Based Assistant

Refactorizá el chat para que deje de ser un parser rígido y se comporte como asistente de IA.

Objetivo funcional:
Quiero poder escribir de forma natural, incompleta o desordenada, y que el sistema entienda intención, pregunte lo que falta y genere una acción confirmable.

No quiero tener que escribir frases exactas.

Ejemplos que debe entender:
- “compré btc ayer”
- “metí 2k en apple”
- “sumé 500 usdc en nexo”
- “vendí un poco de tesla”
- “cobré staking”
- “cuánto tengo en total?”
- “cuánto tengo en crypto?”
- “simulame 5k por mes durante 2 años”
- “qué tengo sin rendimiento?”
- “cómo viene mi portfolio?”

Nuevo contrato sugerido:
interface ChatIntent {
  intent:
    | 'create_transaction'
    | 'edit_transaction'
    | 'delete_transaction'
    | 'query_portfolio'
    | 'run_simulation'
    | 'search_asset'
    | 'unknown';
  confidence: number;
  extractedData?: Record<string, unknown>;
  missingFields?: string[];
  assistantMessage?: string;
}

Flujo:
1. Usuario escribe texto libre.
2. LLM clasifica intención.
3. Si es transacción, extrae campos posibles:
   - tipo operación
   - asset
   - cantidad
   - monto
   - precio
   - fecha
   - cuenta
   - cartera
   - moneda
4. Si faltan datos críticos, pregunta de forma conversacional.
5. Cuando tiene datos suficientes, muestra preview editable.
6. Usuario confirma.
7. Recién ahí se guarda.

Reglas:
- Nunca mostrar JSON al usuario.
- Nunca guardar sin confirmación.
- Si hay baja confianza, preguntar.
- Si hay múltiples assets posibles, mostrar opciones.
- Si el usuario dice “apple”, resolver AAPL / CEDEAR AAPL preguntando si hace falta.
- Si dice “2k en BTC”, inferir que es monto, no cantidad.
- Si dice “0.05 BTC”, inferir cantidad.
- Si dice “ayer”, resolver fecha.
- Si dice “en Nexo”, resolver account.
- Si no dice cartera, usar default o preguntar según configuración actual.

UX:
- Preview tipo recibo:
  - Operación
  - Activo
  - Cantidad / monto
  - Precio
  - Cuenta
  - Cartera
  - Fecha
- Campos editables inline.
- Botones:
  - Confirmar
  - Editar
  - Cancelar
- Mantener historial conversacional de la sesión.

Criterio de aceptación:
- “metí 2k en btc en nexo” debe generar compra/deposito relacionado a BTC o pedir si fue compra vs transferencia si no está claro.
- “cuánto tengo en total?” debe responder con métricas, no abrir form.
- “simulame 5k por mes a 2 años al 12%” debe abrir o ejecutar simulación.

---

# PROMPT 8 — Asset Search Global

Implementá un buscador global de assets.

Objetivo funcional:
Quiero poder buscar cualquier activo sin tener que cargarlo manualmente primero.

Alcance:
- Crypto
- Stocks USA
- ETFs
- CEDEARs del seed local
- Assets custom existentes

Requisitos:
- Crear hook/servicio de búsqueda reutilizable.
- Buscar primero en catálogo local.
- Luego consultar APIs externas cuando aplique.
- Debounce en input.
- Manejar loading/error/empty.

Resultado de búsqueda:
- ticker
- nombre
- tipo
- precio actual si existe
- moneda
- logo si existe
- fuente

UX:
- Autocomplete en:
  - form de transacción
  - chat fallback
  - pantalla Activos
  - simulador si aplica
- Si el asset no existe localmente, permitir agregarlo al catálogo.
- Para CEDEARs, mostrar claramente:
  - CEDEAR local
  - subyacente
  - ratio si está disponible

Criterio de aceptación:
- Buscar “apple” debe mostrar AAPL stock y AAPL CEDEAR si corresponde.
- Buscar “bitcoin” debe mostrar BTC.
- Si no hay resultados, ofrecer crear asset custom.

---

# PROMPT 9 — Staking Improvements

Mejorá el módulo de staking con análisis de rendimiento real vs esperado.

Objetivo funcional:
Quiero saber si el staking está rindiendo lo prometido y detectar cambios de APY.

Requisitos:
- No romper StakingRule ni YieldAccrual existentes.
- Agregar cálculos derivados.
- Opcional: agregar entidad nueva para snapshot de APY si lo considerás necesario.

Métricas:
- expectedYieldUSD
- actualYieldUSD
- yieldPerformancePct
- averageApyPct
- lastApyPct
- apyChangePct

Reglas:
- expectedYieldUSD se calcula desde StakingRule.
- actualYieldUSD viene de tx kind='yield' corregidas o reales.
- yieldPerformancePct = actual / expected.
- Si baja APY, generar insight/alerta.

UX:
- En pantalla Staking mostrar:
  - esperado
  - cobrado
  - diferencia
  - APY actual
- Badge:
  - “rinde como esperado”
  - “rinde menos de lo esperado”
  - “APY bajó”

Criterio de aceptación:
- Si esperaba 100 y cobré 80, mostrar 80% y warning.
- Si una regla cambia de 12% a 9%, debe quedar visible el cambio.

---

# PROMPT 10 — CEDEAR Breakdown

Agregá desglose de rendimiento de CEDEARs.

Objetivo funcional:
Quiero saber si gané por suba de la acción, por suba del dólar, o por ambos.

Requisitos:
- No modificar Asset ni Transaction.
- Usar datos existentes:
  - precio de compra
  - precio actual
  - fxSnapshot histórico
  - CCL actual
  - precio subyacente si está disponible
  - cedearRatio

Modelo derivado:
interface CedearBreakdown {
  underlyingReturnPct: number;
  fxImpactPct: number;
  totalReturnPct: number;
  purchaseEffectiveUnderlyingUSD?: number;
  currentUnderlyingUSD?: number;
}

UX:
- En detalle de activo CEDEAR mostrar:
  - Acción: +X%
  - Dólar: +Y%
  - Total: +Z%
- Explicar en texto corto:
  - “Tu resultado vino principalmente por dólar”
  - “Tu resultado vino principalmente por la acción”

Criterio de aceptación:
- Si la acción no cambió pero el CCL subió, debe verse ganancia por FX.
- Si el CCL no cambió pero la acción subió, debe verse ganancia por underlying.

---

# PROMPT 11 — Smart Alerts

Implementá un sistema de alertas inteligentes derivadas.

Objetivo funcional:
Quiero que la app me avise cosas accionables, no solo cambios de precio.

Tipos:
- risk
- liquidity
- opportunity
- staking
- data_quality

Alertas iniciales:
- BTC supera 40% del portfolio.
- Top 3 supera 70%.
- Idle cash/stables supera 15%.
- USDC/USDT sin staking.
- Yield real menor al 90% del esperado.
- Asset entra en zona de compra.
- Faltan precios o FX desactualizado.
- Datos offline/stale.

Requisitos:
- Pueden derivarse en runtime.
- No hace falta push notification al principio.
- Integrar con Insights Engine cuando corresponda.

UX:
- Centro de alertas simple.
- Badge en Home si hay alertas high.
- Permitir descartar alerta por sesión.
- No saturar: agrupar alertas similares.

Criterio de aceptación:
- Si se cumple una regla, se ve alerta.
- Si no hay alertas, mostrar estado positivo.

---

# PROMPT 12 — Capital Timeline

Implementá una vista de evolución de capital.

Objetivo funcional:
Quiero ver cuánto fui aportando y cuánto vale hoy en el tiempo.

Modelo derivado:
interface CapitalTimelinePoint {
  date: string;
  investedUSD: number;
  valueUSD: number;
  pnlUSD: number;
}

Reglas:
- Agrupar por mes inicialmente.
- investedUSD acumula aportes netos.
- valueUSD requiere valuación histórica si está disponible.
- Si no hay histórico suficiente, mostrar al menos timeline de aportes.
- Documentar limitaciones si los precios históricos no están completos.

UX:
- Gráfico de dos líneas:
  - capital invertido
  - valor del portfolio
- Debajo:
  - total aportado
  - valor actual
  - diferencia
- Filtros:
  - 6M
  - 1Y
  - All

Criterio de aceptación:
- Si cargué aportes mensuales, debe verse la línea de invested creciendo.
- Si no hay precio histórico, no inventar datos: mostrar fallback honesto.

---

# PROMPT 13 — Home Restructure

Reordená el Home para que sea un cockpit de decisión.

Objetivo funcional:
La Home debe responder rápidamente:
- cuánto tengo,
- cuánto gané,
- qué debería mirar,
- qué riesgos tengo.

Orden sugerido:
1. Hero con valor actual + capital invertido + ganancia.
2. “Qué hacer hoy” con insights.
3. Distribución resumida.
4. Top movers / activos principales.
5. FX card.
6. Acciones rápidas:
   - Registrar operación
   - Simular
   - Buscar asset
   - Ver alertas

Requisitos:
- No eliminar funcionalidades existentes.
- Reusar componentes actuales.
- Mobile-first.
- Mantener densidad alta pero clara.

Criterio de aceptación:
- En un vistazo debo ver capital invertido, valor actual, ganancia y 1-3 insights.

---

# PROMPT 14 — Data Input: CSV / Google Sheets

Agregá una capa opcional de importación de datos.

Objetivo funcional:
Quiero poder cargar operaciones más rápido desde CSV o Google Sheets, sin depender 100% de manual/chat.

Alcance fase 1:
- CSV upload local.
- Mapping manual de columnas.
- Preview antes de importar.
- Validación con Zod o sistema existente.
- Confirmación final.

Columnas mínimas:
- date
- kind
- asset
- qty
- unitPrice
- currency
- account
- portfolio

Reglas:
- Nunca importar directo sin preview.
- Detectar duplicados básicos:
  - misma fecha
  - mismo asset
  - misma qty
  - mismo precio
  - misma cuenta
- Mostrar errores por fila.

Google Sheets:
- Dejar preparado como fase 2.
- Puede empezar como “pegar CSV exportado desde Sheets”.

Criterio de aceptación:
- Subo CSV y veo preview.
- Puedo corregir errores antes de importar.
- No se duplican operaciones obvias.

---

# PROMPT 15 — Final Product QA Pass

Hacé un pase final de producto para revisar consistencia.

Checklist:
- Ninguna mejora rompe el spec original.
- Todo lo nuevo es derivado o modular.
- Home prioriza decisiones.
- Chat permite lenguaje natural.
- Simulador funciona sin portfolio cargado.
- Asset search se usa en form/chat/activos.
- Insights no son alarmistas ni excesivos.
- Si faltan datos, la app lo dice claramente.
- Mobile-first.
- Modo privacidad respetado.
- Estados empty/loading/error implementados.

Output esperado:
- Lista de archivos modificados.
- Resumen funcional.
- Limitaciones conocidas.
- Próximos pasos sugeridos.
