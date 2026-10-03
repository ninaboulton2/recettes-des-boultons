import type { SupabaseClient } from '@supabase/supabase-js'
import { createError } from 'h3'
import { estimateCostUsd } from './pricing'

/**
 * Quota et journalisation des appels IA (table `ai_usage`, migration 0012).
 *
 * Tout passe par le client Supabase de l'utilisateur (RLS) : `check_ai_quota`
 * compte ses propres lignes du jour (Europe/Paris), l'insertion n'est
 * autorisée que pour `user_id = auth.uid()`. Aucune clé service_role.
 *
 * Les types générés (`shared/types/database.ts`) ne connaissent pas encore
 * `ai_usage` (à régénérer après application de 0012 en prod) : le client
 * `AuthContext.supabase` n'est pas typé, les formes sont décrites ici.
 */

export const AI_QUOTA_MESSAGE = (max: number) =>
  `Quota quotidien atteint (${max} traduction${max > 1 ? 's' : ''} par jour et par personne). Réessayez demain.`

export type AiUsageStatus = 'ok' | 'error'

export interface AiUsageEntry {
  userId: string
  provider: string
  model: string
  feature: string
  inputTokens: number | undefined
  outputTokens: number | undefined
  status: AiUsageStatus
  durationMs: number
}

export interface AiUsageLogged {
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number | null
}

/**
 * Lève 429 si l'utilisateur a déjà atteint `maxPerDay` appels aujourd'hui.
 * `maxPerDay = 0` désactive le traducteur (toujours 429). En cas d'erreur
 * SQL (fonction absente…), on laisse passer en journalisant : le quota est
 * un garde-fou, pas une barrière de sécurité (celle-ci reste `requireAdmin`).
 */
export async function assertAiQuota(supabase: SupabaseClient, maxPerDay: number): Promise<void> {
  const { data, error } = await supabase.rpc('check_ai_quota', { p_max_per_day: maxPerDay })
  if (error) {
    console.error('[api] ai quota : check_ai_quota indisponible', error)
    return
  }
  if (data !== true) {
    throw createError({ statusCode: 429, statusMessage: AI_QUOTA_MESSAGE(maxPerDay) })
  }
}

/** Insère une ligne `ai_usage` (coût estimé via `pricing.ts`). N'échoue jamais l'appel appelant. */
export async function logAiUsage(supabase: SupabaseClient, entry: AiUsageEntry): Promise<AiUsageLogged> {
  const inputTokens = entry.inputTokens ?? 0
  const outputTokens = entry.outputTokens ?? 0
  const estimatedCostUsd = estimateCostUsd(entry.model, entry.inputTokens, entry.outputTokens)

  const { error } = await supabase.from('ai_usage').insert({
    user_id: entry.userId,
    provider: entry.provider,
    model: entry.model,
    feature: entry.feature,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: estimatedCostUsd,
    status: entry.status,
    duration_ms: entry.durationMs
  })
  if (error) {
    console.error('[api] ai usage : insertion ai_usage échouée', error)
  }

  return { inputTokens, outputTokens, estimatedCostUsd }
}
