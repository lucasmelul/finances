/**
 * Cliente DolarAPI — cotizaciones del USD en Argentina.
 *
 * Endpoint público (sin auth, con CORS): https://dolarapi.com/v1/dolares
 *
 * Devuelve un array con TODAS las modalidades; nosotros mapeamos las 4 que
 * usa la app (oficial, MEP/bolsa, CCL/contadoconliqui, blue) y descartamos
 * las demás (cripto, mayorista, tarjeta) — esas no son relevantes para
 * conversiones de portfolio. Si más adelante hace falta, basta con ampliar
 * `KIND_MAP` (no toca el resto del código).
 */

import type { FxKind } from '@/lib/types';

// ─── Schema de la respuesta ────────────────────────────────────────────────

interface DolarApiRow {
  /** Código interno: "oficial", "blue", "bolsa" (MEP), "contadoconliqui" (CCL), etc. */
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  fechaActualizacion: string; // ISO
}

/** Mapeo de `casa` → nuestro `FxKind`. Solo las que usamos. */
const KIND_MAP: Record<string, FxKind> = {
  oficial: 'oficial',
  blue: 'blue',
  bolsa: 'mep',
  contadoconliqui: 'ccl',
  cripto: 'crypto',
};

// ─── Tipo de salida normalizada ────────────────────────────────────────────

export interface FxQuote {
  kind: FxKind;
  buy: number;
  sell: number;
  /** Marca de tiempo del proveedor (no del fetch). Útil para detectar feeds frenados. */
  providerUpdatedAt: string;
  /** Marca de tiempo local del fetch — la que persistimos como `fetchedAt`. */
  fetchedAt: string;
}

// ─── Fetch ─────────────────────────────────────────────────────────────────

const ENDPOINT = 'https://dolarapi.com/v1/dolares';

/**
 * Trae las cotizaciones en una sola llamada y devuelve solo las que mapeamos.
 *
 * Errores: si el endpoint falla, lanzamos. TanStack Query lo va a reintentar
 * con backoff exponencial. Si el JSON viene mal-formado (ej. cambió el shape),
 * filtramos con guard — mejor devolver subset que romper la UI.
 */
export async function fetchDolarRates(): Promise<FxQuote[]> {
  const res = await fetch(ENDPOINT, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`DolarAPI ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as DolarApiRow[];
  if (!Array.isArray(json)) {
    throw new Error('DolarAPI devolvió un shape inesperado (no es array)');
  }

  const fetchedAt = new Date().toISOString();
  const out: FxQuote[] = [];
  for (const row of json) {
    const kind = KIND_MAP[row.casa];
    if (!kind) continue;
    if (typeof row.compra !== 'number' || typeof row.venta !== 'number') continue;
    out.push({
      kind,
      buy: row.compra,
      sell: row.venta,
      providerUpdatedAt: row.fechaActualizacion ?? fetchedAt,
      fetchedAt,
    });
  }
  return out;
}
