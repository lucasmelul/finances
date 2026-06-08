# Portfolio Tracker — Guía de proyecto (estado actual)

> **Para quien retoma esto en una sesión nueva:** este archivo es la fuente de
> verdad del *estado real* del proyecto. `SPEC.md` y los `IMPROVEMENTS_SPEC*`
> son la *intención de diseño* original (útiles como referencia, pero no
> describen lo que está construido hoy). Si hay conflicto, gana este archivo y
> el código.
>
> Última actualización: 2026-06-07.

---

## 1. Qué es

App **personal** (single-user) para registrar y monitorear inversiones en
contexto argentino: CEDEARs, ETFs, acciones, cripto, bonos, FCI, efectivo y
staking. Valuación multi-moneda en tiempo real (ARS / USD) y diferenciación
fiscal **A (declarado) / B (privado)**.

Principio rector: **mantenimiento cero**. Defaults agresivos, automatizaciones
confiables, chat por texto como input primario, form como fallback.

- **100% client-side.** No hay backend. Datos en IndexedDB (Dexie). APIs
  públicas con CORS para precios/FX. Sync opcional entre devices vía GitHub Gist.
- **Idioma:** español rioplatense. Todo el código, comentarios y UI en español.
- **Plataforma:** PWA instalable, responsive (320px → desktop), dark-mode only.

---

## 2. Cómo correr / verificar

```bash
nvm use 20            # Vite 5 necesita Node ≥18
npm install
npm run dev           # → http://localhost:5173
npm run typecheck     # tsc -b --noEmit  (debe salir limpio)
npm run build         # tsc -b && vite build
```

- `.env.local` en la raíz con las keys (ver `.env.example`). **Todas opcionales.**
  Sin ellas la app funciona; el chat cae al parser regex local.
  - `VITE_GEMINI_API_KEY` — parser del chat (gratis, proveedor primario).
  - `VITE_TWELVEDATA_KEY` — precio de subyacentes USA para CEDEAR breakdown.
  - `VITE_ANTHROPIC_API_KEY` — fuerza Claude en vez de Gemini (pago).
- No hay test runner configurado todavía. La verificación es `typecheck` + correr la app.
- Deploy: Vercel (config en `vercel.json`). Detalle completo en `DEPLOY.md`.

---

## 3. Stack

Vite + React 18 + TypeScript · Tailwind (dark only) · **Dexie/IndexedDB**
(persistencia) · **TanStack Query** (polling de precios) · **Zustand**
(`src/lib/store.ts`, UI state) · React Router · React Hook Form + Zod ·
Recharts · Lucide · Sonner (toasts) · vite-plugin-pwa.

Alias: `@/` → `src/`.

---

## 4. Arquitectura — mapa mental

**Patrón de datos (importante):**
1. `<Pollers/>` (montado en `App.tsx`, fuera de las rutas) corre TanStack
   Query cada ~30s contra las APIs públicas.
2. Un `useEffect` espejo escribe el resultado a Dexie (`src/lib/api/sync.ts`).
3. Las pantallas **leen siempre desde Dexie** con `useLiveQuery`
   (`dexie-react-hooks`), nunca del status de la query. Así, si un fetch
   falla, la UI sigue mostrando el último cache.

**Todo lo analítico es derivado y NO se persiste.** Holdings, métricas,
insights, DCA, S/R, performance de staking: se recomputan con `useMemo` desde
transactions + prices + fx. El modelo core (Transaction/Asset/Account/
Portfolio) nunca se toca para agregar features analíticas.

### Estructura de `src/`

```
lib/
  types.ts              Modelo de dominio (ver §5). FUENTE DE VERDAD de tipos.
  db/
    schema.ts           Dexie: tablas + índices + versiones de migración.
    bootstrap.ts        Primer arranque: modo 'demo' vs 'clean' (localStorage).
    queries.ts          Hooks useLiveQuery (useAccounts, useTransactions, ...).
    mutations.ts        Altas/bajas/updates a Dexie.
    derived.ts          useFx, vistas derivadas livianas.
    portability.ts      export/import JSON (replace | merge).
    fxSnapshot.ts       snapshot de FX al momento de cada tx.
    historyCache.ts     cache de histórico de precios en IndexedDB.
  api/
    sync.ts             Pollers (precio cripto + FX + subyacentes) → Dexie.
    dolar.ts            DolarAPI (CCL/MEP/blue/oficial).
    coingecko.ts        precios cripto + sparkline + histórico.
    twelvedata.ts       precio subyacentes USA (CEDEAR breakdown).
    history.ts          histórico de precios para charts y S/R.
    chat-ai.ts          selector de proveedor IA (gemini > anthropic > stub).
    gemini.ts / anthropic.ts   parsers de chat (lenguaje natural → tx).
    gist.ts             sync DB ↔ GitHub Gist privado (PAT en localStorage).
    search.ts           búsqueda global de assets (catálogo + coingecko).
  fifo.ts               motor FIFO por (asset, account, portfolio).
  reconcile.ts          "cerebro" puro de Reconciliar: saldos→plan (swaps/dep/ret).
  holdings.ts           posición agregada + DCA desde lots remanentes (FIFO).
  metrics.ts            PortfolioMetrics / LiquidityMetrics / RiskMetrics.
  insights.ts           Insights Engine ("qué mirar hoy") desde métricas.
  staking.ts            expected vs actual yield, performance %, cross-asset.
  accrual.ts            motor de devengamiento automático de staking/PF.
  sr.ts                 soporte/resistencia (percentil 10/90 sobre histórico).
  simulator.ts          proyección capital inicial + aporte mensual + retorno.
  whatif.ts / timeline.ts / tips.ts / cedear.ts / metrics helpers.
  format.ts / utils.ts / csv.ts   helpers de formato, cn(), export CSV.
data/
  cedears.ts            seed estático de CEDEARs (ticker→underlying→ratio).
  portfolios.ts         carteras default por bucket.
  seed.ts               datos demo del primer arranque.
components/
  shell/                AppShell (decide mobile/desktop), Mobile/DesktopChrome.
  ui/                   primitivos (Button, Input, Dialog, KPI, BucketChip...).
  composite/            AssetRow, TxRow, InsightCard, OpportunityCard, SRBand...
  charts/               Donut, LineChart, Sparkline.
  dialogs/              Nueva/Editar Cuenta, Tx, Activo, Regla Staking, Search...
  forms/                TxForm (form de operación), BucketTransferForm.
  Pollers.tsx           nodo raíz que corre el polling.
screens/                una por ruta (ver §6).
```

---

## 5. Modelo de datos (resumen — el detalle vive en `src/lib/types.ts`)

- **Account**: `tag: 'A' | 'B'` **inmutable** post-creación (A=declarado,
  B=privado; reemplazó el "blanco/negro" del spec original). `kind`: broker /
  exchange / wallet / bank / cash.
- **Asset**: único por `(type, ticker)` (constraint Dexie). `type`: cedear /
  stock / etf / fondo / crypto / bono / cash. CEDEAR lleva `underlyingTicker` +
  `cedearRatio`; cripto lleva `coingeckoId`.
- **Portfolio**: bucket temporal `corto | medio | largo | trade`. Ortogonal a
  Account. Hay default por bucket.
- **Transaction**: `kind` = buy / sell / transfer_in / transfer_out / yield /
  fee / fx / adjustment. Hereda `tag` de su Account. Lleva `fxSnapshot`
  histórico. `source`: form / chat / auto-yield / import.
- **StakingRule**: APY + frecuencia (daily/weekly/monthly/yearly) +
  `rewardAssetId` opcional (cross-asset, ej. stakear USDC y cobrar NEXO).
- **Derivados** (no son tablas): Holding, métricas, DCA, S/R.
- **Cache** (tablas): PriceCache, FxRateCache, PriceHistoryCache.

### Invariantes que NO hay que romper
- `Account.tag` inmutable.
- Asset único por `(type, ticker)`.
- FIFO se calcula por scope `(asset, account, portfolio)` — el HODL de largo no
  se mezcla con los trades.
- Yields (`kind='yield'`) suman cantidad a costo cero: **no afectan el DCA/FIFO**.
- Precio de CEDEAR = derivado (`subyacente_USD × CCL / ratio`), no se scrapea BYMA.

---

## 6. Pantallas (rutas en `src/App.tsx`)

| Ruta | Screen | Estado |
|---|---|---|
| `/` | Inicio | métricas globales + insights + portfolio + FX card |
| `/carteras` `/carteras/:bucket` | Carteras | tabs por bucket, cards de cartera |
| `/asset/:assetId` | AssetDetail | precio, chart, holdings, DCA, CEDEAR breakdown, tx |
| `/oportunidades` | Oportunidades | S/R automáticos, banda visual, zona de compra |
| `/operaciones` | Operaciones | histórico de tx filtrable |
| `/chat` | Chat | input NL → tx (Gemini/Claude/regex), preview editable, historial en localStorage |
| `/simulador` | Simulador | proyección capital + aporte mensual + retorno |
| `/staking` | Staking | reglas, accruals, expected vs actual |
| `/insights` | Insights | listado completo del Insights Engine |
| `/cuentas` | Cuentas | CRUD cuentas (con tag A/B) + entrada a Reconciliar |
| `/reconciliar` `/reconciliar/:accountId` | Reconciliar | saldos finales por (asset×cartera) → deduce swaps/dep/ret (multi-cartera) |
| `/importar` | Importar | import/export JSON, sync Gist |
| `/settings` | Settings | modo demo/limpio, API keys, info |

---

## 7. Estado de implementación

**Construido y funcionando** (typecheck limpio): modelo de datos completo en
Dexie con migraciones · FIFO · holdings + DCA · valuación multi-moneda · polling
FX (DolarAPI) + cripto (CoinGecko) + subyacentes (Twelve Data) · CEDEARs con
ratio y breakdown · chat con Gemini/Claude + fallback regex · simulador ·
métricas/liquidez/riesgo · Insights Engine · staking con accrual automático y
performance · soporte/resistencia + Oportunidades · charts · todas las pantallas
de §6 · import/export JSON (replace+merge) · **sync entre devices vía GitHub
Gist** · bootstrap demo/clean · PWA · **Reconciliar saldo** (por cuenta,
**multi-cartera**: actualizás los saldos finales por scope `(asset, cartera)` y
la app deduce las transacciones: swap con precio implícito desde los deltas —
puede cruzar carteras —, auto-split 1×N, emparejamiento manual N×M,
depósitos/retiros single-sided; txs con `source:'reconcile'` + tag `[recon:UUID]`
para deshacer. Accesible desde el menú y desde el botón "Saldos" en cada cuenta).

**Pendiente / próximos pasos candidatos** (no priorizado por el usuario aún):
- No hay tests automatizados — `fifo.ts`, `metrics.ts`, `simulator.ts`,
  `accrual.ts`, `staking.ts` son funciones puras, candidatas ideales a unit tests.
- Supabase (sync cloud "real" multi-device) sigue siendo Fase futura; hoy el
  workaround es Gist.
- Bonos AR y FCI: dependían de APIs públicas confiables (a confirmar).
- Notificaciones PWA (zonas de compra, yield cobrado).
- Modo claro (opcional).

> Al retomar: si el usuario no dice en qué trabajar, **preguntar** o proponer
> desde esta lista. No asumir.

---

## 8. Convenciones / gotchas

- **Todo en español** (código, nombres, comentarios, UI, commits tipo
  `feat:` / `fix:` / `chore:`).
- Comentarios explican el **por qué**, no el qué — seguir ese estilo (mirar
  headers de archivos en `lib/`, son densos y útiles).
- IDs: `crypto.randomUUID()` en runtime; IDs estáticos cortos solo en seeds.
- Nuevas migraciones de DB = nueva `.version(N)` en `schema.ts`, nunca editar
  versiones viejas.
- Cambios de ratio de CEDEAR (split/reverse): editar `src/data/cedears.ts` y
  actualizar la fecha de "última revisión" del header.
- Yields se atribuyen a su `StakingRule` por el tag `[rule:ID]` en `notes` —
  no romper ese contrato (evita doble conteo).
- API keys siempre en `localStorage` / `import.meta.env`, nunca en la DB ni
  commiteadas.

---

## 9. Documentos relacionados

- `SPEC.md` — spec de diseño original v0.1 (intención; algunos nombres cambiaron:
  blanco/negro → A/B, bucket `mediano` → `medio`).
- `DESIGN_BRIEF.md` — handoff de diseño (Delta by eToro como referencia, tokens,
  componentes, 16 pantallas).
- `IMPROVEMENTS_SPEC.md` / `IMPROVEMENTS_SPEC_V2_PRO_FULL.md` — specs de las
  features analíticas (métricas, insights, simulador, chat IA). Ya implementadas.
- `DEPLOY.md` — deploy en Vercel/Cloudflare + troubleshooting.
- `CLAUDE_IMPLEMENTATION_PROMPTS.md` — prompts de implementación histórica.
- `portfolio-lucas.json` — export real del portfolio del usuario (datos personales).
