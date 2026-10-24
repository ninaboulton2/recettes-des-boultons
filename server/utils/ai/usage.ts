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
  `Quota quotidien atteint (${max} appel${max > 1 ? 's' : ''} IA par jour et par personne : traduction, photo ou dictée). Réessayez demain.`

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
  /**
   * Coût déjà calculé (transcription : facturée à la minute). Absent = estimé
   * d'après les tokens (`pricing.ts`).
   */
  estimatedCostUsd?: number | null
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

/**
 * Réservation d'un appel IA (v2, relecture de sécurité n° 3) : la place est prise AVANT l'appel au fournisseur, de façon atomique
 * (`reserve_ai_call`, migration 0028 : verrou par compte, ligne `ai_usage` « pending »). Sans cela, N requêtes en parallèle passent
 * toutes le contrôle du plafond avant que la première n'écrive sa ligne. `finish` passe la ligne à `ok` / `error`.
 */
export interface AiReservation {
  id: string
  finish: (entry: AiUsageEntry & { estimatedCostUsd: number | null }) => Promise<boolean>
}

/** Réservation terminée par la RPC `finish_ai_call` (client service_role). */
export function reservationOf(admin: SupabaseClient, id: string): AiReservation {
  return {
    id,
    async finish(entry) {
      const { data, error } = await admin.rpc('finish_ai_call', {
        p_id: id,
        p_provider: entry.provider,
        p_model: entry.model,
        p_input_tokens: entry.inputTokens ?? 0,
        p_output_tokens: entry.outputTokens ?? 0,
        p_estimated_cost_usd: entry.estimatedCostUsd,
        p_status: entry.status,
        p_duration_ms: entry.durationMs
      })
      if (error) {
        console.error('[api] ai usage : finish_ai_call échouée (la réservation reste « pending » et compte)', error)
        return false
      }
      return data === true
    }
  }
}

/**
 * Journalise un appel (coût estimé via `pricing.ts`) : termine la réservation si on en a une (v2), sinon insère une ligne `ai_usage`
 * (v1, comportement inchangé). N'échoue jamais l'appel appelant.
 */
export async function logAiUsage(supabase: SupabaseClient, entry: AiUsageEntry, reservation?: AiReservation | null): Promise<AiUsageLogged> {
  const inputTokens = entry.inputTokens ?? 0
  const outputTokens = entry.outputTokens ?? 0
  const estimatedCostUsd = entry.estimatedCostUsd !== undefined
    ? entry.estimatedCostUsd
    : estimateCostUsd(entry.model, entry.inputTokens, entry.outputTokens)

  if (reservation) {
    await reservation.finish({ ...entry, estimatedCostUsd })
    return { inputTokens, outputTokens, estimatedCostUsd }
  }

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

export interface TrackedAiCall {
  provider: string
  model: string
  /** `translate`, `extract` (photo / PDF) ou `transcribe` (dictée). */
  feature: string
  userId: string
}

export interface TrackedAiUsage {
  inputTokens?: number
  outputTokens?: number
  estimatedCostUsd?: number | null
}

/**
 * Exécute un appel IA et le journalise dans `ai_usage` : ligne `ok` avec les
 * consommations tirées du résultat (`usageOf`), ou ligne `error` si l'appel
 * échoue (l'erreur d'origine est alors relancée telle quelle). Avec une `reservation` (v2), c'est la ligne réservée qui est terminée
 * au lieu d'en insérer une.
 */
export async function trackAiCall<T>(
  supabase: SupabaseClient,
  call: TrackedAiCall,
  run: () => Promise<T>,
  usageOf: (result: T) => TrackedAiUsage,
  reservation?: AiReservation | null
): Promise<{ result: T, logged: AiUsageLogged, durationMs: number }> {
  const startedAt = Date.now()
  let result: T
  try {
    result = await run()
  } catch (error: unknown) {
    await logAiUsage(supabase, {
      ...call,
      inputTokens: undefined,
      outputTokens: undefined,
      status: 'error',
      durationMs: Date.now() - startedAt
    }, reservation)
    throw error
  }
  const durationMs = Date.now() - startedAt
  const usage = usageOf(result)
  const logged = await logAiUsage(supabase, {
    ...call,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
    status: 'ok',
    durationMs
  }, reservation)
  return { result, logged, durationMs }
}
