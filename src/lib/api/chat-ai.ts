/**
 * Selector unificado del proveedor de IA para el chat.
 *
 * Estrategia: preferimos Gemini (gratis, free tier real) sobre Anthropic
 * (pago, mejor calidad). El caller (Chat.tsx) usa este módulo y no se
 * entera del proveedor concreto.
 *
 * Si ninguno está configurado → `hasAI = false` y el chat cae al regex stub.
 */

import { hasGemini, interpretMessage as interpretGemini } from './gemini';
import { hasAnthropic, interpretMessage as interpretAnthropic } from './anthropic';
import type { ChatIntent } from './anthropic';
import type { Account, Asset } from '@/lib/types';

export type AIProvider = 'gemini' | 'anthropic' | 'none';

/** Cuál proveedor está activo en este momento. */
export function activeProvider(): AIProvider {
  // Gemini gana sobre Anthropic — es gratis, suficiente para este caso de uso.
  if (hasGemini) return 'gemini';
  if (hasAnthropic) return 'anthropic';
  return 'none';
}

/** True si HAY algún proveedor de IA configurado (cualquiera). */
export const hasAI = hasGemini || hasAnthropic;

interface InterpretContext {
  assets: Asset[];
  accounts: Account[];
  todayISO: string;
}

/**
 * Llama al proveedor activo. Si Gemini falla (rate limit, red caída) y
 * tenemos Anthropic disponible, hacemos fallback automático.
 */
export async function interpretMessage(
  text: string,
  ctx: InterpretContext,
): Promise<ChatIntent> {
  const provider = activeProvider();
  if (provider === 'none') {
    throw new Error('Ningún proveedor de IA configurado.');
  }

  if (provider === 'gemini') {
    try {
      return await interpretGemini(text, ctx);
    } catch (err) {
      // Si tenemos Anthropic como backup, lo usamos. Sino, propagar.
      if (hasAnthropic) {
        console.warn('[chat-ai] Gemini falló, usando Anthropic:', err);
        return interpretAnthropic(text, ctx);
      }
      throw err;
    }
  }

  return interpretAnthropic(text, ctx);
}

export type { ChatIntent };
