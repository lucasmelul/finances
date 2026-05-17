/**
 * Componente invisible que orquesta el polling de mercado.
 *
 * Por qué un componente y no un hook llamado en App:
 * - Mantiene el `App` declarativo: leés `<Pollers/>` y sabés que la app
 *   tiene fetches en background.
 * - Aísla el lifecycle: si querés desactivar polling temporalmente (ej.
 *   modo offline), basta con desmontarlo.
 * - Cada hook decide si dispara o no (los crypto necesitan que haya assets
 *   cargados). El componente no toma esa decisión — la delega.
 *
 * No renderiza nada. Si en el futuro queremos un toast "fetch falló",
 * acá es el lugar para leer `q.error` y disparar un side-effect.
 */

import { usePollFx, usePollCryptoPrices, usePollUnderlyingPrices } from '@/lib/api/sync';
import { useYieldAccrual } from '@/lib/db/derived';

export function Pollers() {
  usePollFx();
  usePollCryptoPrices();
  usePollUnderlyingPrices();
  useYieldAccrual();
  return null;
}
