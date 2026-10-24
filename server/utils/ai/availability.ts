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
import { reservationOf, type AiReservation } from './usage'

/**
 * Garde des appels IA en v2 (phase 7) : le service est-il disponible, et CE compte a-t-il encore des appels aujourd'hui ?
 *
 *  - `fetchAiStatus` (affichage seulement : `/api/ai/status`) : deux RPC avec le client de la personne (`ai_service_status` SANS argument,
 *    `ai_quota_status`, migration 0028). Les seuils du budget ne viennent jamais de l'appelant. Une RPC absente ou en erreur ne bloque
 *    personne (journalisé).
 *  - `reserveAiCall` (l'application du plafond) : RPC `reserve_ai_call` avec le client service_role, qui contrôle crédit, budget du mois
 *    et plafond du jour ET insère la réservation de façon atomique ; lève 503 `AI_UNAVAILABLE` (crédit ou budget : même message pour
 *    tous) ou 429 `AI_QUOTA_REACHED` (plafond du jour de ce compte, avec l'heure de remise à zéro). Si la RPC est absente ou en erreur,
 *    on laisse passer en journalisant (retour `null` : l'appel est alors journalisé comme avant, après coup).
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
    supabase.rpc('ai_service_status'),
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

export interface ReserveInput {
  /** La personne qui lance l'appel (déjà authentifiée par la route) : c'est SON plafond qui est consommé. */
  userId: string
  /** `translate`, `extract` ou `transcribe`. */
  feature: string
}

/** Réponse brute de `reserve_ai_call`. */
export type ReserveOutcome
  = | { ok: true, id: string }
    | { ok: false, status: AiStatus }

export function parseReserveOutcome(raw: unknown): ReserveOutcome | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (row.ok === true) return typeof row.id === 'string' ? { ok: true, id: row.id } : null
  if (row.ok !== false) return null
  const quota = parseQuotaInfo(row)
  switch (row.reason) {
    case 'credit': return { ok: false, status: { available: false, reason: 'credit', quota: null, since: typeof row.since === 'string' ? row.since : null } }
    case 'budget': return { ok: false, status: { available: false, reason: 'budget', quota: null, since: null } }
    case 'quota': return { ok: false, status: { available: false, reason: 'quota', quota, since: null } }
    default: return null
  }
}

/**
 * Réserve un appel IA pour cette personne, atomiquement (voir `AiReservation`). `admin` = client service_role : les seuils et
 * l'identité sont donnés par le serveur, jamais par le navigateur. Renvoie `null` si la base ne répond pas (migration absente…) : on
 * laisse passer, comme avant, et l'appel sera journalisé après coup.
 */
export async function reserveAiCall(
  admin: SupabaseClient,
  input: ReserveInput,
  limits: AiLimits,
  hooks: AvailabilityHooks = {}
): Promise<AiReservation | null> {
  const { data, error } = await admin.rpc('reserve_ai_call', {
    p_user: input.userId,
    p_feature: input.feature,
    p_default_quota: limits.dailyQuota,
    p_new_quota: limits.newAccountQuota,
    p_new_days: limits.newAccountDays,
    p_budget_calls: limits.monthlyBudgetCalls,
    p_budget_usd: limits.monthlyBudgetUsd
  })
  const outcome = error ? null : parseReserveOutcome(data)
  if (!outcome) {
    console.error('[api] ai : reserve_ai_call indisponible', error ?? 'réponse inattendue')
    return null
  }
  if (outcome.ok) return reservationOf(admin, outcome.id)
  if (outcome.status.reason === 'budget' && hooks.onBudgetExceeded) {
    await hooks.onBudgetExceeded().catch(err => console.error('[api] ai : alerte de budget non envoyée', err))
  }
  throw unavailableError(outcome.status)
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
