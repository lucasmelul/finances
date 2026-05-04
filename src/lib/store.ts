/**
 * Estado global de UI (Zustand). Vive en localStorage para que el usuario
 * recupere sus preferencias entre sesiones.
 *
 * Cosas que NO van acá:
 * - Datos del dominio (assets, holdings, etc.) → IndexedDB / dexie-react-hooks
 * - Datos de fetch (precios, FX) → React Query
 *
 * Solo "qué está mirando el usuario" y "cómo lo está mirando".
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Currency, FxKind } from '@/lib/types';

export interface UIState {
  /** Moneda de display global (afecta totales y filas). */
  displayCurrency: Currency;
  /** Tipo de FX usado para conversiones ARS↔USD (CCL es el default sano). */
  fxKind: FxKind;
  /** Modo privacidad — oculta valores y deltas con bullets. */
  hidden: boolean;
  /**
   * IDs de insights descartados en la sesión actual (no se persisten —
   * vuelven a aparecer en el próximo arranque, así no se "olvidan" alertas
   * crónicas que el usuario debería seguir viendo).
   */
  dismissedInsightIds: string[];

  setDisplayCurrency: (c: Currency) => void;
  setFxKind: (k: FxKind) => void;
  toggleHidden: () => void;
  dismissInsight: (id: string) => void;
  resetDismissed: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      displayCurrency: 'USD',
      fxKind: 'ccl',
      hidden: false,
      dismissedInsightIds: [],
      setDisplayCurrency: (displayCurrency) => set({ displayCurrency }),
      setFxKind: (fxKind) => set({ fxKind }),
      toggleHidden: () => set((s) => ({ hidden: !s.hidden })),
      dismissInsight: (id) =>
        set((s) =>
          s.dismissedInsightIds.includes(id)
            ? s
            : { dismissedInsightIds: [...s.dismissedInsightIds, id] },
        ),
      resetDismissed: () => set({ dismissedInsightIds: [] }),
    }),
    {
      name: 'portfolio-ui',
      // Solo persistir preferencias, no callbacks.
      partialize: (s) => ({
        displayCurrency: s.displayCurrency,
        fxKind: s.fxKind,
        hidden: s.hidden,
      }),
    },
  ),
);
