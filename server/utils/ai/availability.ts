import type { SupabaseClient } from '@supabase/supabase-js'
import { createError } from 'h3'
import {
  AI_BUSY_MESSAGE,
  AI_CODES,
  AI_UNAVAILABLE_MESSAGE,
  decideAiStatus,
  isServiceWide,
  parseQuotaInfo,
  parseServiceInfo,
  type AiLimits,
  type AiStatus
} from '#shared/utils/aiStatus'
import { classifyAiError } from './billing'

/**
 * Garde des appels IA en v2 (phase 7) : le service est-il disponible, et CE compte a-t-il encore des appels aujourd'hui ?
 *
 *  - `fetchAiStatus` : deux RPC avec le client de la personne (`ai_service_status`, `ai_quota_status`, migration 0028).
 *    Une RPC absente ou en erreur ne bloque personne (journalisé) : le quota est un garde-fou, pas une barrière de sécurité.
 *  - `assertAiAvailable` : lève 503 `AI_UNAVAILABLE` (crédit ou budget : même message pour tous) ou 429 `AI_QUOTA_REACHED`
 *    (plafond du jour de ce compte, avec l'heure de remise à zéro).
 *  - `aiHttpError` : traduit une erreur du fournisseur en erreur HTTP v2 (la v1 garde `throwAiProviderError` tel quel).
 *
 * Sans l'interrupteur v2 rien de ceci n'est appelé : les routes gardent `assertAiQuota` (v1).
 */

export interface AvailabilityHooks {
  /** Appelé quand le budget du mois est atteint (pour prévenir Nina, au plus une fois par 24 h). N'échoue jamais l'appel. */
  onBudgetExceeded?: () => Promise<void>
}

export async function fetchAiStatus(supabase: SupabaseClient, limits: AiLimits): Promise<AiStatus> {
  const [service, quota] = await Promise.all([
    supabase.rpc('ai_service_status', { p_budget_calls: limits.monthlyBudgetCalls, p_budget_usd: limits.monthlyBudgetUsd }),
    supabase.rpc('ai_quota_status', { p_default_quota: limits.dailyQuota, p_new_quota: limits.newAccountQuota, p_new_days: limits.newAccountDays })
  ])
  if (service.error) console.error('[api] ai : ai_service_status indisponible', service.error)
  if (quota.error) console.error('[api] ai : ai_quota_status indisponible', quota.error)
  return decideAiStatus(service.error ? null : parseServiceInfo(service.data), quota.error ? null : parseQuotaInfo(quota.data))
}

export function unavailableError(status: AiStatus) {
  if (isServiceWide(status.reason)) {
    return createError({ statusCode: 503, statusMessage: AI_UNAVAILABLE_MESSAGE, data: { code: AI_CODES.unavailable, reason: status.reason } })
  }
  const quota = status.quota
  return createError({
    statusCode: 429,
    statusMessage: `Quota du jour atteint (${quota?.quota ?? 0} appel${(quota?.quota ?? 0) > 1 ? 's' : ''} IA par jour et par personne). Il sera remis à zéro à minuit, heure de Paris.`,
    data: { code: AI_CODES.quotaReached, quota: quota?.quota ?? 0, resetsAt: quota?.resetsAt ?? null }
  })
}

export async function assertAiAvailable(supabase: SupabaseClient, limits: AiLimits, hooks: AvailabilityHooks = {}): Promise<AiStatus> {
  const status = await fetchAiStatus(supabase, limits)
  if (!status.available) {
    if (status.reason === 'budget' && hooks.onBudgetExceeded) {
      await hooks.onBudgetExceeded().catch(error => console.error('[api] ai : alerte de budget non envoyée', error))
    }
    throw unavailableError(status)
  }
  return status
}

/**
 * Erreur HTTP v2 pour une erreur du fournisseur : crédit ou facturation épuisés → 503 `AI_UNAVAILABLE` (même message que le
 * crédit coupé pour tous) ; simple limite de débit → 503 `AI_BUSY` (réessayer). `undefined` pour tout le reste (le traitement
 * habituel de `throwAiProviderError` continue).
 */
export function aiHttpError(error: unknown) {
  const kind = classifyAiError(error)
  if (kind === 'billing') {
    return createError({ statusCode: 503, statusMessage: AI_UNAVAILABLE_MESSAGE, data: { code: AI_CODES.unavailable, reason: 'credit' } })
  }
  if (kind === 'rate_limit') {
    return createError({ statusCode: 503, statusMessage: AI_BUSY_MESSAGE, data: { code: AI_CODES.busy } })
  }
  return undefined
}
