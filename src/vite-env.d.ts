/// <reference types="vite/client" />

/**
 * Tipado de las variables de entorno disponibles en `import.meta.env`.
 *
 * Vite expone solo las que empiezan con `VITE_*`. Para agregar una nueva,
 * declararla acá Y crear `.env.local` (no commiteado) con su valor.
 */
interface ImportMetaEnv {
  /** Twelve Data API key. Si no se setea, usamos `demo` (limitado). */
  readonly VITE_TWELVEDATA_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
