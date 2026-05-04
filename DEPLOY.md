# Deploy

App 100% client-side: PWA + IndexedDB local + APIs públicas con CORS.
**No requiere backend** ni base de datos remota.

## Recomendado: Vercel

Lo más fácil. Free tier suficiente (100 GB bandwidth/mes, builds ilimitados,
custom domain con SSL gratis).

### Pasos

#### 1. Subir el código a GitHub

Si todavía no tenés repo:

```bash
cd /Users/lucasmelul/IA/finances
git init
git add .
git commit -m "Initial commit"
gh repo create portfolio-tracker --private --source=. --remote=origin --push
```

(Si no tenés `gh` instalado: creá el repo a mano en github.com y luego
`git remote add origin <url>` + `git push -u origin main`.)

> **Nota**: `.env.local` está en `.gitignore` — la API key de Gemini NO se
> sube al repo. La vas a configurar en Vercel directamente.

#### 2. Importar en Vercel

1. Andá a [vercel.com/new](https://vercel.com/new) y entrá con tu cuenta de GitHub
2. **Import Project** → seleccioná el repo `portfolio-tracker`
3. Vercel detecta auto que es Vite (gracias a `vercel.json` ya commiteado)
4. **Antes de "Deploy"**, expandir **Environment Variables** y agregar:
   - `VITE_GEMINI_API_KEY` = tu key de [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - (opcional) `VITE_TWELVEDATA_KEY` = tu key de [twelvedata.com](https://twelvedata.com)
   - (opcional) `VITE_ANTHROPIC_API_KEY` = si querés usar Claude en vez de Gemini
5. Click **Deploy**

URL pública lista en ~1 minuto.

#### 3. Próximos pushes

`git push` automáticamente dispara un nuevo deploy. Las branches que no son
`main` quedan en URLs de preview separadas.

---

## Alternativa: Cloudflare Pages

Free tier más generoso (bandwidth ilimitado). Mismo flow:

1. Subir repo a GitHub
2. [pages.cloudflare.com](https://pages.cloudflare.com) → **Create a project**
3. Conectar GitHub → seleccionar repo
4. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: `20` (variable `NODE_VERSION=20`)
5. Environment variables (igual que arriba): `VITE_GEMINI_API_KEY`, etc.
6. **Save and Deploy**

> Para SPA routing (que `/oportunidades` no devuelva 404 al refrescar) creá
> un archivo `public/_redirects` con: `/* /index.html 200`

---

## Variables de entorno

### Mínimas para que ande

| Variable | De dónde sacarla | Para qué |
|---|---|---|
| `VITE_GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (gratis) | Chat IA: parsing de operaciones por lenguaje natural |

Sin esta key el chat cae al parser regex local — funciona pero entiende menos.

### Opcionales

| Variable | De dónde sacarla | Para qué |
|---|---|---|
| `VITE_TWELVEDATA_KEY` | [twelvedata.com/account/api-keys](https://twelvedata.com/account/api-keys) (free tier 8/min) | Precios de subyacentes USA (CEDEAR breakdown) |
| `VITE_ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) (pago, mejor calidad que Gemini) | Si lo definís, el chat usa Claude en vez de Gemini |

Sin Twelve Data, los CEDEARs muestran el último precio cacheado pero el
breakdown "ganaste por acción vs por dólar" no se actualiza.

---

## Verificación post-deploy

1. Abrí la URL pública en el celular y desktop
2. Confirmá que aparece la card "Datos de demostración cargados" (significa
   que IndexedDB sembró bien)
3. Andá a Settings → "Empezar limpio" para borrar los datos demo
4. Creá una cuenta y registrá una operación desde el chat
5. Verificá que las cotizaciones FX cargan (CCL, MEP, blue, oficial al pie del
   FX card)

### Si algo no anda

| Síntoma | Causa probable | Solución |
|---|---|---|
| "/cuentas" devuelve 404 al refrescar | Faltan rewrites SPA | Vercel: ya está en `vercel.json`. Cloudflare: agregar `public/_redirects` |
| Chat dice "No pude entender" siempre | Falta `VITE_GEMINI_API_KEY` | Revisar env vars en Vercel/CF dashboard, redeploy |
| Datos no persisten al cerrar tab | IndexedDB bloqueado (Safari incógnito) | Usar otro browser o salir de incógnito |
| Precios cripto no actualizan | CoinGecko free tier rate limit | Esperar 1-2 min; si persiste, Settings → ver consola del browser |

---

## Sin deploy: correr local

```bash
nvm use 20  # vite 5 necesita Node ≥18
npm install
npm run dev
# → http://localhost:5173
```

`.env.local` en la raíz con tus keys (ver `.env.example`).

---

## Sync entre devices (futuro)

IndexedDB queda en el browser de cada device. Si querés sincronizar tu
portfolio entre celular y desktop:
- Phase 2: integrar Supabase como backend opcional
- Workaround manual: Settings → "Exportar JSON" / "Importar JSON" (todavía no
  implementado, abre un issue si lo necesitás)
