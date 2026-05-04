# Portfolio Tracker — Especificación Técnica v0.1

> App personal para registrar y monitorear inversiones (CEDEARs, ETFs, fondos, cripto, bonos, efectivo, staking) en contexto argentino, con valuación multi-moneda en tiempo real y diferenciación blanco/negro.

---

## 1. Visión y referencias

- **Inspiración UX**: Delta by eToro — limpia, mobile-first, dark mode por defecto, números grandes, tarjetas por activo, gráficos minimalistas.
- **Audiencia**: usuario final (yo) en v1. En v2+ pensada para usuarios no expertos en inversiones (lenguaje simple, sin jerga avanzada).
- **Plataforma**: Web App (PWA instalable), responsive desde 320px hasta desktop.
- **Idioma**: Español (AR).
- **Principio rector**: **mantenimiento cero**. La app debe servir sin que yo le dedique tiempo. Esto implica:
  - Defaults agresivos (cartera default, precio actual auto, snapshot FX automático).
  - Automatizaciones siempre que sean confiables (yield de staking, S/R, valuación CEDEAR).
  - Chat por texto desde v1 como input primario (más rápido que rellenar form).
  - Form como fallback estructurado.

---

## 2. Stack técnico

| Capa | Elección | Por qué |
|---|---|---|
| Build | **Vite** + React + TypeScript | Liviano, sin SSR innecesario para una app cliente |
| UI | **Tailwind CSS** + **shadcn/ui** | Componentes prearmados, dark mode nativo, mobile-first |
| Estado cliente | **Zustand** | Mínimo boilerplate, ideal para UI state |
| Estado servidor / cache APIs | **TanStack Query** | Polling, retry, cache de precios |
| DB local | **Dexie** (IndexedDB) | Persistencia offline, fácil migración a Supabase |
| Forms | **React Hook Form** + **Zod** | Validación tipada |
| Charts | **Recharts** | Suficiente para donuts, líneas, barras |
| Routing | **React Router** | Estándar |
| PWA | **vite-plugin-pwa** | Service worker + manifest auto |
| Fechas | **date-fns** | Tree-shakeable |
| LLM (parser de chat) | **Claude API (Sonnet 4.5)** | Mejor adherencia a JSON estructurado |
| Backend futuro (Fase 4) | **Supabase** | Auth + Postgres + Realtime + RLS |

---

## 3. Modelo de datos

### 3.1 Entidades core

```ts
type Currency = 'ARS' | 'USD' | 'USDT' | 'BTC' | 'EUR'; // extensible

type FxKind = 'CCL' | 'MEP' | 'BLUE' | 'OFICIAL' | 'CRYPTO';

type Color = 'blanco' | 'negro';

type AccountKind =
  | 'broker'        // IOL, Bull, Cocos, etc.
  | 'exchange'      // Binance, Lemon, Belo, etc.
  | 'wallet'        // self-custody cripto
  | 'bank'          // CBU pesos/USD
  | 'cash';         // efectivo físico

interface Account {
  id: string;
  name: string;          // "IOL", "Binance Lucas", "Caja fuerte USD"
  kind: AccountKind;
  color: Color;          // blanco | negro (inmutable, define tributación)
  currency?: Currency;   // moneda principal de la cuenta (informativo)
  notes?: string;
  archivedAt?: string;
}

type AssetType =
  | 'cedear'
  | 'stock'      // acción extranjera directa
  | 'etf'
  | 'fci'        // fondo común argentino
  | 'crypto'
  | 'bond'
  | 'cash';      // efectivo en moneda

interface Asset {
  id: string;
  type: AssetType;
  ticker: string;        // "AAPL", "BTC", "AL30", "USD"
  name: string;          // "Apple Inc.", "Bitcoin"
  currency: Currency;    // moneda de cotización del activo
  // CEDEAR-specific
  underlyingTicker?: string;  // "AAPL" cuando type = cedear
  cedearRatio?: number;       // ej: 10 (10 CEDEARs = 1 acción)
  // Cripto
  coingeckoId?: string;       // "bitcoin"
  // Bono
  isin?: string;
}

type PortfolioBucket = 'corto' | 'mediano' | 'largo' | 'trade';

interface Portfolio {
  id: string;
  name: string;          // "Largo plazo - jubilación", "Trade BTC"
  bucket: PortfolioBucket;
  isDefault?: boolean;
  color?: string;        // para UI
  notes?: string;
}

type TxKind =
  | 'buy'
  | 'sell'
  | 'transfer_in'    // depósito de efectivo / transferencia entre cuentas
  | 'transfer_out'
  | 'yield'          // staking, intereses, dividendos cobrados
  | 'fee'
  | 'fx'             // conversión entre monedas (ej: ARS → USD MEP)
  | 'adjustment';    // ajuste manual de saldo

interface Transaction {
  id: string;
  kind: TxKind;
  date: string;             // ISO
  accountId: string;
  portfolioId: string;      // toda compra va a una cartera
  assetId: string;
  qty: number;              // negativo en sell
  unitPrice: number;        // en `priceCurrency`
  priceCurrency: Currency;
  fee?: number;
  feeCurrency?: Currency;
  // Para registrar el FX al que se ejecutó (snapshot histórico)
  fxSnapshot?: {
    ccl?: number;
    mep?: number;
    blue?: number;
    oficial?: number;
  };
  notes?: string;
  source: 'form' | 'chat' | 'auto-yield' | 'import';
  createdAt: string;
}

interface StakingRule {
  id: string;
  assetId: string;
  accountId: string;
  portfolioId: string;
  apyPct: number;            // rendimiento anual %
  payoutFrequency: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate?: string;
  active: boolean;
}

interface YieldAccrual {
  id: string;
  ruleId?: string;           // si vino de regla automática
  txId: string;              // tx kind=yield asociada
  expected: number;          // calculado
  actual?: number;           // si el usuario corrigió
  correctedAt?: string;
}

interface WatchlistEntry {
  id: string;
  assetId: string;
  buyZoneLow?: number;       // precio donde es "oportunidad"
  buyZoneHigh?: number;
  support?: number;
  resistance?: number;
  notes?: string;
}

interface PriceCache {
  assetId: string;
  price: number;
  currency: Currency;
  fetchedAt: string;
  source: string;
}

interface FxRateCache {
  kind: FxKind;
  buy: number;
  sell: number;
  fetchedAt: string;
}
```

### 3.2 Reglas e invariantes

- `Account.color` es **inmutable** una vez creada (mover plata entre blanco/negro requiere `tx fx` o `transfer` explícito que deja huella).
- Cada `Transaction` hereda `color` desde su `Account`. Reportes filtran por color.
- Un mismo `Asset` puede aparecer en múltiples `Portfolio` y `Account` simultáneamente (ej: BTC en HODL largo + BTC en trade).
- `Portfolio` es ortogonal a `Account`: una compra de BTC en Binance puede ir a la cartera "trade" o "largo".
- Tiene que existir **al menos una `Portfolio` default por bucket** o una global default.

---

## 4. Cálculos clave

### 4.1 Costo de adquisición: **FIFO por (asset, account, portfolio)**

- Cada `sell` consume lotes de compra en orden cronológico dentro del scope `(asset, account, portfolio)`.
- Permite que la misma posición de BTC en cartera "largo" no se vea afectada por trades en cartera "trade".
- PnL realizado = `precio_venta - costo_FIFO` (en moneda de la transacción + valuado a ARS y USD del momento).

### 4.2 CEDEARs (cálculo automático)

Cuando se compra un CEDEAR:
1. Se guarda `qty` (cantidad de CEDEARs) y `unitPrice` en ARS.
2. Se calcula y muestra:
   - **Acciones reales equivalentes** = `qty / cedearRatio`
   - **Precio efectivo por acción real (USD)** = `(qty * unitPrice) / (qty / cedearRatio) / fxCCL`  
     simplificado: `unitPrice * cedearRatio / fxCCL`
   - **Comparación con precio NYSE/NASDAQ del subyacente**: muestra si pagaste sobreprecio o descuento vs mercado externo.
3. El `cedearRatio` se mantiene en una tabla seed (ver Anexo A) actualizable.

### 4.3 Valuación multi-moneda

Cada activo se valúa en **3 monedas en paralelo**:
- Moneda nativa del activo
- **USD blanco** = MEP (efectivo) o CCL (CEDEARs/acciones extranjeras)
- **USD negro** = Blue
- **ARS** = al dólar correspondiente

Regla de conversión por color de cuenta:
- `Account.color === 'blanco'` → USD = MEP/CCL según asset
- `Account.color === 'negro'` → USD = Blue

### 4.4 Staking / yield automático

- `StakingRule` corre un job cliente al abrir la app: para cada regla activa, calcula los devengamientos pendientes desde `lastAccrualDate` y crea `Transaction(kind='yield')` automáticas.
- Cada accrual genera un `YieldAccrual` con `expected`. Si el usuario edita el saldo cobrado, se guarda `actual` y `correctedAt`.
- El yield **NO afecta el costo FIFO**; se contabiliza como rendimiento separado.

### 4.5 DCA (Dollar-Cost Average) por activo

> "¿A qué precio promedio compré X?" — la pregunta más frecuente al evaluar una posición.

**Definición**: el DCA de un activo es el costo promedio ponderado por cantidad invertida, considerando **todas las compras** de ese activo (en todas las cuentas y carteras del usuario), expresado en una moneda estable (USD por default).

**Fórmula**:

```
DCA_USD(asset) = Σ (qty_i × precio_i_USD) / Σ qty_i
```

donde `i` itera sobre las transacciones `kind='buy'` y `kind='transfer_in'` del activo. Las ventas (`sell`) **no cambian el DCA** — solo bajan la cantidad restante (consistente con FIFO §4.1: el promedio de los lotes que quedan se mantiene).

**Vista por moneda**:
- DCA en USD usando `fxSnapshot` de cada tx (no FX actual) — preserva fidelidad histórica
- DCA en moneda nativa cuando todas las compras fueron en la misma moneda (típico CEDEAR comprado siempre en ARS)
- Si hay mix de monedas, mostrar solo USD

**Comparación con precio actual**:
- `delta_pct = (precio_actual - DCA) / DCA × 100`
- Color: verde si `delta > 0` (estás "in the money"), rojo si `delta < 0`
- Mostrado siempre que se muestra DCA — sin esto el número solo es ruido

**Yields no afectan DCA**: las txs `kind='yield'` (staking, dividendos) suman cantidad pero entran a costo cero — esto sube el DCA "efectivo" del usuario hacia abajo (lo "diluye" para mejor), reflejando que esa parte de la posición fue gratuita.

**Persistencia**: el DCA es **derivado**, no se guarda. Se recomputa con `useMemo` cada vez que cambia la lista de transactions. Costo: O(N) sobre N=tx_de_ese_asset, totalmente aceptable.

**UI**:
- **Asset detail**: card destacada con DCA en USD + delta vs precio actual (verde/rojo) + breakdown por cuenta si hay >1 lote
- **Mis activos** (Inicio/Carteras): subtítulo opcional "DCA: US$ X · ±Y%" debajo de la cantidad
- **Modo privacidad**: el DCA también se enmascara con `••••`

### 4.6 Reportes v1 (lo mínimo útil)

1. **Dashboard global**: valor total (ARS / USD blanco / USD negro), variación 24h / 7d / 30d, donut por tipo de activo.
2. **Por cartera**: valor, % del total, PnL no realizado, yield acumulado.
3. **Por color**: blanco vs negro (totales y % respecto del patrimonio).
4. **Por cuenta**: holdings detallados.
5. **Histórico de operaciones**: tabla filtrable por fecha / activo / cartera / cuenta / tipo.
6. **Yield acumulado**: total cobrado por staking/intereses, por mes.
7. **Distribución**: pie chart por activo, por cartera, por color, por moneda.

---

## 5. Módulos / pantallas

### 5.1 Navegación principal (bottom-tab en mobile, sidebar en desktop)

1. **Inicio** — vista rápida (valor total, top movers, accesos rápidos)
2. **Carteras** — vista por bucket (corto/mediano/largo/trade)
3. **➕ Operar** — botón central tipo FAB → chat + form
4. **Dashboard** — métricas analíticas, distribución, oportunidades, reportes
5. **Más** — Cuentas, Activos, Staking, Configuración

### 5.2 Detalle por pantalla

#### 🏠 Inicio
- Hero card con valor total (toggle ARS / USD blanco / USD negro / total combinado)
- Variación % en 24h
- Lista compacta: top movers del día
- Acceso rápido (FAB) a "Registrar operación"
- Card de cotizaciones de FX (CCL / MEP / Blue / Oficial)

#### 📂 Carteras
- Tabs por bucket (corto / mediano / largo / trade)
- Cards por cartera con: valor, PnL, yield, % asignación
- Tap → detalle con holdings, gráfico histórico, transacciones

#### 💬 Operar (chat + form)
- **Tab Chat**: input de texto. El usuario escribe libre ("compré 50 cedears AAPL a 8500"), Claude Sonnet parsea y devuelve un objeto editable. Confirmación obligatoria antes de guardar.
- **Tab Form**: campos estructurados (tipo, asset autocomplete, cantidad, precio (default = precio actual), fecha (default = hoy), cuenta, cartera).
- Default de cartera: la marcada como `isDefault` o la última usada.

#### 📊 Dashboard
Pensado como cockpit analítico, separado de Inicio. Tabs:

- **Métricas**: KPIs por período (24h / 7d / 30d / YTD / All-time):
  - Valor total y delta absoluto/%
  - PnL realizado vs no realizado
  - Yield acumulado (staking + intereses + dividendos)
  - Mejor / peor activo del período
  - Cash disponible
  - Tasa efectiva anual del yield
- **Distribución**: donuts/treemaps interactivos:
  - Por tipo de activo (CEDEAR, cripto, bonos, cash, etc.)
  - Por cartera (bucket)
  - Por color (blanco vs negro)
  - Por moneda
  - Por cuenta/exchange
- **Oportunidades**: ver 5.2 abajo.
- **Reportes**:
  - Histórico de operaciones (filtrable por fecha/activo/cuenta/cartera/tipo)
  - Yield mensual
  - Vista impositiva (snapshot al 31/12 para Bienes Personales) — separa blanco/negro
  - Exportar a CSV/JSON

#### 🎯 Oportunidades (dentro de Dashboard)
Soportes y resistencias **calculados automáticamente** desde el histórico (Yahoo Finance / CoinGecko `/coins/{id}/market_chart`). Heurística:

- **Soporte** = mínimo de cierres en últimos 30 días (afinable por activo).
- **Resistencia** = máximo de cierres en últimos 30 días.
- **Zona de compra** = banda inferior, definida como `[soporte, soporte * 1.03]` (soporte +3%).
- **Pivot points** complementarios: P = (H + L + C) / 3 del día anterior, S1/R1 derivados.

UI:
- Lista de activos del catálogo + tenencias actuales del usuario.
- Para cada uno: precio actual, soporte, resistencia, banda visual.
- Badge **"🟢 EN ZONA DE COMPRA"** si `price <= soporte * 1.03`.
- Filtro: "solo mis activos" / "todos".
- Tap → detalle con gráfico (línea + bandas de S/R).

> Si en implementación las APIs públicas no devuelven histórico confiable para algún tipo (ej. bonos AR), ese tipo se excluye del módulo en lugar de pedirle al usuario datos manuales.

#### ⚙️ Más
- **Cuentas**: CRUD, toggle archivada, marcar color (inmutable post-creación).
- **Activos**: catálogo + buscador. Permite agregar custom (ej: bono que no esté). Constraint de unicidad por `(type, ticker)` para evitar duplicados.
- **Staking**: CRUD de reglas, ver accruals pendientes, corregir actuals.
- **Configuración**: moneda default de display, fuentes de precio, API keys (Claude), backup local (export JSON), tema.

---

## 6. Integraciones externas (todas gratuitas/públicas)

| Dato | Fuente | Endpoint | Frecuencia |
|---|---|---|---|
| Dólar CCL/MEP/Blue/Oficial | **DolarAPI** | `https://dolarapi.com/v1/dolares` | Polling 30s |
| Cripto (precios) | **CoinGecko** | `https://api.coingecko.com/api/v3/simple/price` | Polling 30s |
| Acciones US / ETFs | **Yahoo Finance** (no oficial vía `query1.finance.yahoo.com`) o **Stooq CSV** | endpoint público | Polling 30s |
| CEDEARs (precio ARS) | **Derivado**: `precio_subyacente_USD * fx_CCL / cedearRatio` | calculado | mismo polling |
| Bonos AR | **BYMA Data** público (ver feasibility) o **Rava scraping ligero** | a confirmar Fase 2 | Polling 60s |
| FCI | **CAFCI** público | `https://api.cafci.org.ar/...` | Polling 5min |

> **Nota**: el precio de CEDEARs lo derivamos del subyacente + CCL en lugar de scrapear BYMA. Es más confiable, no requiere scraping, y refleja el "valor justo".

### 6.1 LLM Parser (chat)

- **Modelo**: Claude Sonnet 4.5 vía API directa.
- **Prompt**: system con catálogo de activos y cuentas del usuario + few-shot de ejemplos en castellano AR.
- **Output**: JSON con shape de `Transaction` parcial. Siempre mostrar al usuario para confirmar/editar.
- **Fallback**: si el JSON no parsea o faltan campos, abre el form pre-llenado con lo que sí entendió.

---

## 7. PWA & Offline

- Service worker cachea shell + último snapshot de precios.
- Mutaciones (nuevas tx) se persisten local primero (Dexie), se sincronizan a Supabase cuando hay red (Fase 4).
- Indicador de "última actualización" en cada precio.

---

## 8. Seguridad

- **v1 (local-only)**: PIN opcional al abrir la app, datos en IndexedDB sin encriptar (mismo nivel que cualquier app web).
- **v4 (Supabase)**: auth con email/password + magic link, RLS por user_id, opcional 2FA.
- **API keys de LLM**: guardadas localmente (IndexedDB), nunca se envían a un backend en v1. En v4 se puede mover a Supabase Edge Function como proxy.

---

## 9. Diseño

> 📐 **El handoff completo de diseño está en [`DESIGN_BRIEF.md`](./DESIGN_BRIEF.md)** — documento autocontenido con contexto de producto, referencias (Delta by eToro como primaria), sistema de diseño, lista de pantallas y entregables. Pasarle ese archivo al equipo/herramienta de diseño.
>
> Esta sección del spec resume las decisiones de diseño que impactan a desarrollo. Para cualquier ambigüedad visual, el `DESIGN_BRIEF.md` y los mockups que produzca son la fuente de verdad.

### 9.1 Personalidad y referencias

- **Mood**: confiable, claro, premium pero accesible. Nada de jerga financiera intimidante.
- **Tono**: amigable y directo. Lenguaje en español rioplatense neutro.
- **Referencias visuales**:
  - **Delta by eToro** — referencia primaria (estructura de portfolio, cards, modos de visualización)
  - **Robinhood** — simplicidad, animación de precios
  - **Cocos Capital** — tono local AR, integración CEDEAR
  - **Wealthsimple** — claridad de reportes
- **Principios de diseño**:
  1. **Mobile-first** con gestos naturales (swipe, long press, pull-to-refresh).
  2. **Densidad alta sin caos**: muchos números pero con jerarquía clara.
  3. **Color con propósito**: verde/rojo solo para PnL, no decoración.
  4. **Datos críticos en 1 tap**: nunca obligar a navegar 3 niveles para ver un saldo.
  5. **Mantenimiento cero**: defaults inteligentes, autocomplete, "usar valor actual" como botón visible.

### 9.2 Tema y paleta

**Modo oscuro como default** (estándar en apps financieras serias, reduce fatiga durante chequeos frecuentes). Modo claro opcional en v2.

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
| `positive` | `#10B981` | Ganancias, in-the-money, badge "en zona de compra" |
| `negative` | `#EF4444` | Pérdidas |
| `warning` | `#F59E0B` | Badge "negro", alertas |
| `info` | `#3B82F6` | Tags neutrales, badge "blanco" |

### 9.3 Tipografía

- **Familia principal**: `Inter` o `Geist` (sans-serif geométrica, legible en mobile).
- **Tabular numbers** habilitados (`font-variant-numeric: tabular-nums`) en todo número monetario para alineación.
- **Escala**:
  | Token | Size | Weight | Uso |
  |---|---|---|---|
  | `display` | 2.5rem | 600 | Hero (valor total) |
  | `h1` | 1.75rem | 600 | Título de sección |
  | `h2` | 1.25rem | 600 | Card titles |
  | `body` | 1rem | 400 | Texto general |
  | `body-strong` | 1rem | 600 | Valores destacados |
  | `caption` | 0.875rem | 400 | Labels secundarios |
  | `micro` | 0.75rem | 500 | Timestamps, badges |

### 9.4 Espaciado y forma

- **Spacing scale** (px): 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64.
- **Radii**: `lg` (12px) para inputs, `xl` (16px) para cards, `2xl` (24px) para sheets/modales, `full` para badges/avatars.
- **Sombras**: mínimas en dark; preferir bordes sutiles a elevación.

### 9.5 Iconografía

- **Lucide React** para UI icons (open source, set coherente).
- **Logos de tickers**: CoinGecko para cripto; caché local para acciones (logos.gov / clearbit fallback).
- Tamaños estándar: 16, 20, 24 px.

### 9.6 Componentes core a diseñar

1. **AppShell**
   - Bottom nav mobile: 5 items con CTA central tipo FAB para "Operar"
   - Sidebar desktop colapsable
   - Header con switch de moneda de display (ARS / USD blanco / USD negro / total)

2. **Asset Card**
   - Logo, ticker, nombre
   - Holdings (cantidad)
   - Valor actual (en moneda activa)
   - PnL absoluto + %
   - Mini sparkline (últimos 7d)
   - Variantes "up" / "down" / "flat"

3. **KPI Card**
   - Label
   - Valor grande
   - Delta % vs período (24h / 7d / 30d / YTD)
   - Tendencia mini

4. **Tx Row**
   - Tipo (icono color: compra / venta / yield / transfer / fx / fee)
   - Asset + cuenta + cartera
   - Cantidad y precio
   - Fecha relativa
   - Tap → bottom sheet con detalle / editar / eliminar

5. **Chat bubble + parsed preview**
   - Burbuja del usuario (texto libre)
   - Burbuja del sistema mostrando la transacción parseada en formato amigable (NO JSON crudo: layout tipo recibo con campos editables inline)
   - Botones: Confirmar / Editar / Cancelar
   - Indicador de "parseando…" durante la llamada al LLM

6. **Form de transacción**
   - Stepper o single-page mobile-friendly
   - Selector de tipo (segmented control)
   - Asset autocomplete con logo
   - Cantidad + Precio (con toggle "usar precio actual")
   - Fecha (default = hoy)
   - Cuenta (con badge blanco/negro)
   - Cartera (chips de bucket)

7. **Donut / Treemap de distribución**
   - Centro: total + label
   - Slices interactivos
   - Leyenda lateral en desktop, debajo en mobile

8. **Sparkline / Line chart**
   - Sin grilla pesada
   - Tooltip flotante con valor + fecha
   - Variante con bandas (soporte/resistencia overlay para Oportunidades)

9. **Empty / Loading / Error states**
   - Empty: ilustración minimal + CTA principal
   - Loading: skeletons (no spinners)
   - Error: mensaje claro + retry

10. **Bottom sheet / Modal**
    - Editar tx, ver detalle de activo, configurar staking, etc.
    - Drag-to-dismiss en mobile

11. **Badge color blanco/negro**
    - Chip pequeño al lado del nombre de cuenta
    - Blanco: outline azul tenue
    - Negro: fill ámbar tenue

12. **Banner "EN ZONA DE COMPRA"**
    - Componente destacado para Oportunidades
    - Color positivo + icono de tendencia

### 9.7 Pantallas a diseñar (handoff list)

| # | Pantalla | Notas clave |
|---|---|---|
| 1 | **Onboarding** | 3 pasos: bienvenida, crear primera cuenta (con color), agregar primer activo |
| 2 | **Inicio** | Hero valor total + switch moneda, top movers, FX card, FAB Operar |
| 3 | **Dashboard – Métricas** | KPIs por período seleccionable |
| 4 | **Dashboard – Distribución** | Donuts por tipo / cartera / color / moneda / cuenta |
| 5 | **Dashboard – Oportunidades** | Lista con S/R, banda visual, badge zona de compra |
| 6 | **Dashboard – Reportes** | Histórico filtrable, yield mensual, vista impositiva, export |
| 7 | **Carteras (lista)** | Tabs por bucket, cards de carteras |
| 8 | **Cartera (detalle)** | Holdings, gráfico histórico, transacciones |
| 9 | **Activo (detalle)** | Precio actual, gráfico, holdings totales por cartera, transacciones, datos CEDEAR si aplica |
| 10 | **Operar – Chat** | Conversación + preview de tx parseada |
| 11 | **Operar – Form** | Form completo paso a paso |
| 12 | **Cuentas (lista + alta)** | CRUD con badge de color (inmutable) |
| 13 | **Activos (catálogo)** | Buscador, alta de custom, constraint de unicidad visible |
| 14 | **Staking** | Reglas activas, accruals pendientes, corrección manual |
| 15 | **Configuración** | Moneda default de display, API keys, backup local, tema |
| 16 | **Más** | Hub de accesos secundarios |

### 9.8 Microinteracciones

- **Flash de precio**: animación verde/rojo breve al actualizar polling.
- **Pull-to-refresh** en mobile.
- **Swipe en tx row** → editar / eliminar.
- **Long press** en activo → quick action sheet.
- **Skeleton transitions** al primer load.
- **Toast** de confirmación post-guardado de tx (con undo).

### 9.9 Accesibilidad

- Contraste mínimo WCAG AA en todos los textos.
- Áreas tappables ≥ 44×44 px.
- Labels en todos los iconos sin texto (lectores de pantalla).
- Navegación por teclado completa en desktop.
- Foco visible (no remover outline sin reemplazar).

### 9.10 Entregables esperados del proceso de diseño

- [ ] **Design tokens** en formato consumible (JSON / Tailwind config preset).
- [ ] **Set de componentes** en Figma con variantes y estados.
- [ ] **Mockups** de las 16 pantallas (mobile + desktop responsive).
- [ ] **Estados** (empty / loading / error) por pantalla relevante.
- [ ] **Microinteracciones críticas** especificadas (idealmente con prototipo).
- [ ] **Modo claro** (opcional, v2).

---

## 10. Roadmap por fases

### Fase 1 — MVP local (objetivo: usable en 3-4 semanas)
- [ ] Setup Vite + React + TS + Tailwind + shadcn/ui + PWA
- [ ] Implementar sistema de diseño (tokens + componentes core de §9)
- [ ] Modelo de datos en Dexie + seeds de assets/CEDEARs
- [ ] CRUD de Cuentas, Carteras, Activos
- [ ] Form para registrar transacciones (todas las kinds)
- [ ] **Chat con Claude API** (parser de texto → tx, con preview/confirm)
- [ ] Cálculo FIFO + valuación multi-moneda (CCL/MEP/Blue por color)
- [ ] CEDEARs: cálculo de acciones reales y precio efectivo vs subyacente
- [ ] Integración DolarAPI + CoinGecko + Yahoo Finance (polling 30s)
- [ ] Inicio + Carteras (vistas básicas)

### Fase 2 — Dashboard + Oportunidades
- [ ] Módulo Dashboard completo (Métricas + Distribución + Reportes)
- [ ] Módulo Oportunidades con S/R automáticos
- [ ] Charts históricos por activo y por cartera
- [ ] Reportes CSV + vista impositiva (Bienes Personales)
- [ ] Bonos AR y FCI (si las APIs públicas lo permiten)

### Fase 3 — Staking + automatizaciones
- [ ] Staking con reglas automáticas + corrección manual de actuals
- [ ] Dividendos / intereses recurrentes
- [ ] Notificaciones PWA (zonas de compra, yield cobrado)

### Fase 4 — Cloud sync
- [ ] Supabase (auth + DB + RLS)
- [ ] Sync bidireccional Dexie ↔ Supabase
- [ ] Multi-device

### Fase 5 — Multi-usuario / share
- [ ] Compartir cartera read-only
- [ ] Onboarding amigable para no-expertos
- [ ] Tutoriales contextuales

---

## 11. Decisiones cerradas

| # | Decisión | Resolución |
|---|---|---|
| 1 | Ratio de CEDEARs | **Tabla estática** seed en `src/data/cedears.ts` con los ~50 más comunes. Actualización manual del seed cuando cambian splits/ratios. |
| 2 | Histórico de precios | **APIs públicas** (Yahoo Finance para acciones/ETF, CoinGecko para cripto). Sin doble persistencia local. |
| 3 | Soporte / resistencia | **Cálculo automático** desde histórico (rolling min/max 30d + pivot points). Sin entrada manual. Si una clase de activo no tiene histórico confiable vía API pública, se excluye del módulo Oportunidades. |
| 4 | Unicidad de assets | **Constraint** por `(type, ticker)`. Un solo BTC, un solo AAPL CEDEAR, etc. |
| 5 | LLM parser | **Claude Sonnet 4.5** vía API directa (mejor adherencia a JSON estructurado). |
| 6 | Costo de adquisición | **FIFO por (asset, account, portfolio)** — permite que el HODL no se mezcle con trades. |
| 7 | Chat con audio | **Fuera de scope v1.** Solo texto. |
| 8 | Plataforma | **PWA web** (Vite + React + TS). |

---

## Anexo A — Seed de CEDEARs (extracto)

| Ticker AR | Subyacente | Ratio | Currency |
|---|---|---|---|
| AAPL | AAPL | 10 | USD |
| MSFT | MSFT | 10 | USD |
| GOOGL | GOOGL | 20 | USD |
| AMZN | AMZN | 4 | USD |
| KO | KO | 5 | USD |
| TSLA | TSLA | 30 | USD |
| MELI | MELI | 4 | USD |
| BRK.B | BRK.B | 50 | USD |
| ... | ... | ... | ... |

(Lista completa al implementar — ~80 CEDEARs activos en BYMA.)

---

## Anexo B — Ejemplos de input de chat

```
"compré 100 cedears de aapl a 8500 en iol para largo plazo"
→ { kind: buy, asset: AAPL (cedear), qty: 100, unitPrice: 8500, priceCurrency: ARS,
    accountId: <IOL>, portfolioId: <largo-default> }

"vendí 0.05 btc a 65000 usd en binance"
→ { kind: sell, asset: BTC, qty: 0.05, unitPrice: 65000, priceCurrency: USD,
    accountId: <Binance>, portfolioId: <último usado o default> }

"cobré 12 usdt de staking en binance"
→ { kind: yield, asset: USDT, qty: 12, unitPrice: 1, priceCurrency: USD,
    accountId: <Binance>, portfolioId: <auto> }
```
