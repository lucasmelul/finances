# Design Brief — Portfolio Tracker (App de inversiones personal)

> Documento autocontenido para handoff a un equipo de diseño (humano o Claude Design). No requiere leer el SPEC técnico para producir el sistema de diseño y los mockups.

---

## 1. Qué es esta app

Una **PWA personal para registrar y monitorear un portfolio de inversiones** en contexto argentino. Pensada para que su dueño (un único usuario en v1, eventualmente compartible) controle todo su patrimonio invertido desde un solo lugar:

- Acciones, CEDEARs, ETFs, fondos, bonos, cripto, staking, intereses, efectivo.
- Distribuido en múltiples cuentas: brokers (IOL, Bull Market, Cocos), exchanges (Binance, Lemon, Belo), wallets self-custody, bancos, efectivo físico.
- Multi-moneda: ARS, USD (con tres cotizaciones distintas: CCL, MEP, Blue), USDT, BTC, EUR.

**No es una app de trading** (no se ejecutan operaciones, no hay órdenes). Es una app de **registro + valuación + análisis**.

---

## 2. El problema que resuelve

Hoy alguien con un portfolio diversificado en Argentina necesita un Excel con 7 pestañas, dos navegadores abiertos y una calculadora para responder preguntas básicas:

- ¿Cuánto tengo en total, en dólares?
- ¿Y en pesos? ¿A qué cotización?
- ¿Cuánto rindió mi cartera de largo plazo este mes?
- ¿Esta acción está cara o barata respecto a su histórico?
- ¿Cuánto cobré de staking en los últimos 6 meses?

Esta app responde todo eso **en un tap**, manteniéndose actualizada sola.

---

## 3. El usuario y su contexto

### Perfil
- 30-45 años, argentino, hábito de inversor disciplinado pero no profesional.
- Maneja **múltiples cuentas** (típicamente 5-10 entre brokers, exchanges, wallets, bancos).
- No quiere dedicarle tiempo a la app: la idea es **mantenimiento cero** — registrar una operación tiene que tomar 10 segundos.

### Particularidades del contexto argentino que el diseño tiene que reflejar

1. **Tres dólares simultáneos**: la app necesita mostrar valuaciones en CCL, MEP y Blue según la naturaleza del activo. La UI tiene que hacer este lío entendible sin que el usuario tenga que pensarlo.

2. **Plata "blanca" y "negra"**: parte de los activos están declarados (fiscalmente blancos) y parte no (compras de cripto P2P, USD físicos, etc.). Cada cuenta es **una cosa o la otra** (no se mezclan). El usuario quiere ver **totales combinados** y poder **filtrar por color**. Esto NO es opcional ni puede ocultarse: es una dimensión de primera clase.

3. **CEDEARs**: instrumento argentino para invertir en acciones extranjeras. Cada CEDEAR representa una fracción de una acción real (ej: 10 CEDEARs de AAPL = 1 acción de Apple). El usuario quiere ver al mismo tiempo cuántos CEDEARs tiene **y** cuántas acciones reales equivale.

### Mentalidad
- **Curioso pero no obsesivo**: quiere chequear el portfolio 1-3 veces al día, no quedarse mirando velas.
- **Disciplinado**: usa zonas de compra, divide su capital en buckets temporales.
- **Pragmático**: prefiere defaults inteligentes a 50 settings.

---

## 4. Cómo funciona la app (3 ideas centrales)

### 4.1 Carteras por horizonte temporal
El usuario divide su patrimonio en **4 buckets** y los activos pueden estar repartidos en varios al mismo tiempo:

- **Corto plazo** (objetivos < 6 meses)
- **Mediano** (6m - 2 años)
- **Largo** (HODL, jubilación)
- **Trade** (operaciones especulativas con S/R)

Ejemplo: el mismo BTC puede estar **dividido**: 0.5 BTC en "largo plazo" (no se toca) + 0.05 BTC en "trade" (entra y sale con setups). La app trata estas posiciones como independientes.

### 4.2 Registro por chat o por form
- **Chat**: el usuario escribe libre — *"compré 50 cedears de aapl a 8500 en iol para largo plazo"* — y la app le muestra la transacción parseada para que confirme con un tap.
- **Form**: alternativa estructurada cuando el chat no entendió o el usuario prefiere precisión.

El chat es la entrada **primaria**. El form es backup.

### 4.3 Oportunidades
Un módulo que, sin que el usuario configure nada, le dice **qué activos están en zona de compra** según soportes/resistencias calculados automáticamente desde el histórico.

---

## 5. Referencias visuales

### 5.1 Referencia principal: **Delta by eToro**

La app debe **sentirse como Delta**: la misma calidad de mobile-first, la misma sensación de "todo lo importante está visible". Específicamente queremos:

- **Hero del valor total** dominando la pantalla de inicio, con switch entre monedas/períodos.
- **Cards de activos compactas** con logo, ticker, holdings, valor, PnL y mini-sparkline.
- **Vista de portfolio agregada** cruzando múltiples cuentas/exchanges sin que el usuario tenga que entrar a cada una.
- **Watchlist** con assets que no necesariamente tenés (para Oportunidades).
- **Detalle de activo** con tabs: precio, holdings, transacciones, info.
- **Pantalla "operaciones recientes"** tipo timeline.
- **Donut de distribución** con leyenda lateral interactiva.
- **Animación de cambio de precio** sutil (flash verde/rojo).
- **Dark mode** como default.

### 5.2 Referencias secundarias

| App | Qué tomar |
|---|---|
| **Robinhood** | Simplicidad agresiva. Animación de precios. Curva de portfolio en hero. |
| **Cocos Capital** (AR) | Tono local. Cómo presentan CEDEARs. Lenguaje no-jerga. |
| **Wealthsimple** | Claridad de reportes y onboarding. |
| **Apple Stocks** | Densidad de información en cards mobile. |

### 5.3 Lo que NO queremos parecer

- ❌ Bloomberg Terminal (denso, técnico, intimidante).
- ❌ MetaTrader / TradingView (cargado de indicadores y velas).
- ❌ App de banco tradicional (formal, lenta, formularios largos).

---

## 6. Personalidad y principios de diseño

### Mood
**Confiable, claro, premium pero accesible.** Sin jerga financiera intimidante. Datos serios presentados con calidez.

### Principios

1. **Mobile-first.** Gestos naturales: swipe, long press, pull-to-refresh. Pero responsive hasta desktop ancho.
2. **Densidad alta sin caos.** Muchos números — pero con jerarquía clara: lo importante grande, el contexto chico.
3. **Color con propósito.** Verde y rojo solo para PnL. Ámbar solo para "negro". Azul solo para "blanco". Nada decorativo.
4. **Datos críticos en 1 tap.** Nunca obligar a navegar 3 niveles para ver un saldo.
5. **Mantenimiento cero.** Defaults inteligentes, autocomplete agresivo, botón "usar valor actual" siempre visible.
6. **El chat es protagonista.** El input por texto es la forma primaria de cargar operaciones, no una feature secundaria.

---

## 7. Sistema de diseño

### 7.1 Tema

**Modo oscuro como default.** Modo claro opcional en v2. Estándar en apps financieras serias y reduce la fatiga durante chequeos frecuentes.

### 7.2 Paleta

| Token | Hex sugerido | Uso |
|---|---|---|
| `bg-base` | `#0B0E14` | Fondo de app |
| `bg-surface` | `#151923` | Cards, contenedores |
| `bg-elevated` | `#1E2330` | Modales, sheets, popovers |
| `border-subtle` | `#2A3142` | Separadores y bordes |
| `text-primary` | `#F5F7FA` | Títulos, números principales |
| `text-secondary` | `#9AA3B2` | Labels, subtítulos |
| `text-muted` | `#5A6373` | Captions, timestamps |
| `accent` | `#6366F1` | CTAs, links, foco |
| `positive` | `#10B981` | Ganancias, "EN ZONA DE COMPRA" |
| `negative` | `#EF4444` | Pérdidas |
| `warning` | `#F59E0B` | Badge "negro", alertas |
| `info` | `#3B82F6` | Tags neutrales, badge "blanco" |

> Los hex son sugerencias. El equipo de diseño puede ajustarlos manteniendo la semántica.

### 7.3 Tipografía

- **Familia**: `Inter` o `Geist` (sans-serif geométrica, gran legibilidad mobile).
- **Tabular numbers**: habilitados en todo número monetario (`font-variant-numeric: tabular-nums`) para que las columnas alineen.

| Token | Size | Weight | Uso |
|---|---|---|---|
| `display` | 2.5rem | 600 | Hero (valor total) |
| `h1` | 1.75rem | 600 | Título de sección |
| `h2` | 1.25rem | 600 | Card titles |
| `body` | 1rem | 400 | Texto general |
| `body-strong` | 1rem | 600 | Valores destacados |
| `caption` | 0.875rem | 400 | Labels secundarios |
| `micro` | 0.75rem | 500 | Timestamps, badges |

### 7.4 Espaciado y forma

- **Spacing scale (px)**: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64.
- **Radii**: `lg` (12) para inputs, `xl` (16) para cards, `2xl` (24) para sheets/modales, `full` para badges/avatars.
- **Sombras**: mínimas en dark; preferir bordes sutiles a elevación.

### 7.5 Iconografía

- **Lucide React** para UI icons.
- **Logos de tickers**: CoinGecko para cripto, caché local para acciones.
- Tamaños estándar: 16, 20, 24 px.

---

## 8. Componentes core a diseñar

| # | Componente | Qué incluye |
|---|---|---|
| 1 | **AppShell** | Bottom nav mobile (5 items con FAB central "Operar"), sidebar desktop colapsable, header con switch de moneda de display |
| 2 | **Asset Card** | Logo, ticker, nombre, holdings, valor actual, PnL absoluto + %, mini sparkline 7d. Variantes up/down/flat |
| 3 | **KPI Card** | Label, valor grande, delta % con período seleccionable, mini tendencia |
| 4 | **Tx Row** | Tipo (icono color), asset + cuenta + cartera, cantidad y precio, fecha relativa. Tap → bottom sheet detalle |
| 5 | **Chat bubble + parsed preview** | Burbuja usuario + burbuja sistema con tx en formato recibo (no JSON crudo), botones Confirmar / Editar / Cancelar |
| 6 | **Form de transacción** | Selector de tipo, asset autocomplete con logo, cantidad + precio (toggle "usar precio actual"), fecha, cuenta (badge color), cartera (chips bucket) |
| 7 | **Donut / Treemap distribución** | Centro con total, slices interactivos, leyenda lateral en desktop / abajo en mobile |
| 8 | **Sparkline / Line chart** | Sin grilla pesada, tooltip flotante, variante con bandas S/R para Oportunidades |
| 9 | **Empty / Loading / Error** | Empty con CTA, skeletons (no spinners), error con retry |
| 10 | **Bottom sheet / Modal** | Drag-to-dismiss en mobile |
| 11 | **Badge color blanco/negro** | Chip al lado del nombre de cuenta. Blanco = outline azul tenue. Negro = fill ámbar tenue |
| 12 | **Banner "EN ZONA DE COMPRA"** | Componente destacado para Oportunidades, color positivo + icono tendencia |

---

## 9. Pantallas a entregar

| # | Pantalla | Notas clave |
|---|---|---|
| 1 | **Onboarding** | 3 pasos: bienvenida, crear primera cuenta (con color), agregar primer activo |
| 2 | **Inicio** | Hero valor total + switch moneda, top movers, FX card (CCL/MEP/Blue/Oficial), FAB Operar |
| 3 | **Dashboard – Métricas** | KPIs por período seleccionable (24h / 7d / 30d / YTD / All-time): valor total, PnL realizado vs no realizado, yield acumulado, mejor/peor activo |
| 4 | **Dashboard – Distribución** | Donuts: por tipo / cartera / color (blanco vs negro) / moneda / cuenta |
| 5 | **Dashboard – Oportunidades** | Lista con S/R, banda visual, badge "EN ZONA DE COMPRA". Filtro "solo mis activos" / "todos" |
| 6 | **Dashboard – Reportes** | Histórico filtrable, yield mensual, vista impositiva (snapshot 31/12 para Bienes Personales — separa blanco/negro), export CSV |
| 7 | **Carteras (lista)** | Tabs por bucket (corto/mediano/largo/trade), cards de carteras |
| 8 | **Cartera (detalle)** | Holdings, gráfico histórico, transacciones |
| 9 | **Activo (detalle)** | Precio actual, gráfico, holdings totales por cartera, transacciones, datos CEDEAR si aplica (acciones reales equivalentes + precio efectivo vs subyacente) |
| 10 | **Operar – Chat** | Conversación + preview de tx parseada estilo recibo |
| 11 | **Operar – Form** | Form completo paso a paso |
| 12 | **Cuentas (lista + alta)** | CRUD con badge de color (color inmutable post-creación) |
| 13 | **Activos (catálogo)** | Buscador, alta de custom, constraint unicidad visible |
| 14 | **Staking** | Reglas activas, accruals pendientes (esperado vs cobrado), corrección manual |
| 15 | **Configuración** | Moneda default de display, API keys (Claude), backup local export JSON, tema |
| 16 | **Más** | Hub de accesos secundarios |

---

## 10. Estados y microinteracciones

### Estados por pantalla
- **Empty**: ilustración minimal + CTA principal claro.
- **Loading**: skeletons (no spinners).
- **Error**: mensaje en lenguaje humano + botón retry.
- **Stale data**: indicador sutil de "última actualización hace X" cuando el polling falla.

### Microinteracciones críticas
- **Flash de precio**: animación verde/rojo breve al actualizar polling.
- **Pull-to-refresh** en mobile.
- **Swipe en tx row**: acción rápida editar / eliminar.
- **Long press en activo**: quick action sheet (registrar compra, ver detalle, agregar a watchlist).
- **Skeleton transitions** al primer load (sin jumps).
- **Toast con undo** post-guardado de tx.
- **Transición chat → preview** que sienta que el sistema "entendió".

---

## 11. Accesibilidad

- Contraste mínimo **WCAG AA** en todos los textos.
- Áreas tappables ≥ **44×44 px**.
- **Labels** en todos los iconos sin texto (lectores de pantalla).
- Navegación por teclado completa en desktop.
- Foco visible (no remover outline sin reemplazar).

---

## 12. Entregables esperados

- [ ] **Design tokens** en formato consumible (JSON / Tailwind config preset).
- [ ] **Set de componentes** en Figma con variantes y estados.
- [ ] **Mockups** de las 16 pantallas (mobile + desktop responsive).
- [ ] **Estados** (empty / loading / error) por pantalla relevante.
- [ ] **Microinteracciones críticas** especificadas (idealmente con prototipo en Figma).
- [ ] **Modo claro** (opcional, v2).

---

## 13. Restricciones técnicas que impactan al diseño

- Stack frontend: **React + Tailwind + shadcn/ui**. El sistema de diseño debe ser implementable sobre esta base (preferir tokens compatibles con Tailwind config).
- **PWA**: la app debe verse bien instalada como app nativa en iOS/Android. Considerar safe areas (notch, home indicator).
- **Polling cada 30s**: los componentes que muestren precios deben tener un estado visual de "actualizando" sutil, no intrusivo.
- **Offline tolerante**: cuando no hay red, mostrar último valor cacheado + indicador de "sin conexión".

---

## 14. Glosario rápido

- **CEDEAR**: certificado argentino que representa una fracción de una acción extranjera. Cotiza en ARS en BYMA.
- **CCL** (Contado con Liquidación): cotización del USD que surge de comprar un activo en ARS y venderlo en USD en el exterior. Se usa para valuar CEDEARs.
- **MEP** (Mercado Electrónico de Pagos): otra cotización USD legal, similar al CCL pero liquidando localmente. Se usa para USD efectivo blanco.
- **Blue**: cotización informal del USD (mercado paralelo). Se usa para activos "negros".
- **Bucket**: cartera por horizonte (corto / mediano / largo / trade).
- **Yield**: rendimiento periódico (staking, intereses, dividendos). NO afecta el costo de adquisición.
- **FIFO**: First In First Out. Cuando vendés, se considera vendido lo que compraste primero.
