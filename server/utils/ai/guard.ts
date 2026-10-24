import type { SupabaseClient } from '@supabase/supabase-js'
import { getRequestURL, type H3Event } from 'h3'
import { AI_CODES, type AiLimits } from '#shared/utils/aiStatus'
import { isV2Enabled } from '#shared/utils/v2'
import type { AiConfig } from './provider'
import { assertAiAvailable, aiHttpError } from './availability'
import { reportBillingFailure } from './creditAlert'
import { throwAiProviderError } from './errors'
import { assertAiQuota } from './usage'
import { readEmailConfig, sendAiCreditAlert } from '../email'
import { serviceClient } from '../serviceClient'

/**
 * Branchement Nuxt de la garde IA (phase 7) : lit l'interrupteur v2 et la configuration, appelle les fonctions pures de
 * `availability.ts` / `creditAlert.ts`.
 *
 *  - `assertAiAllowed` : v1 → `assertAiQuota` (inchangé) ; v2 → crédit, budget, plafond de CE compte.
 *  - `throwAiFailure` : à appeler dans le `catch` des routes IA avant `handleApiError`. En v2, enregistre une panne de crédit
 *    (alerte, e-mail à Nina au plus une fois par 24 h) puis traduit l'erreur (503 `AI_UNAVAILABLE` / `AI_BUSY`) ; en v1,
 *    `throwAiProviderError` seul, comme avant.
 */

export const isV2 = (event: H3Event): boolean => isV2Enabled(useRuntimeConfig(event).public.v2)

export const aiLimitsOf = (config: AiConfig): AiLimits => ({
  dailyQuota: config.dailyQuota,
  newAccountQuota: config.newAccountDailyQuota,
  newAccountDays: config.newAccountDays,
  monthlyBudgetCalls: config.monthlyBudgetCalls,
  monthlyBudgetUsd: config.monthlyBudgetUsd
})

const emailConfigOf = (event: H3Event) => readEmailConfig(useRuntimeConfig(event) as Record<string, unknown>, process.env, getRequestURL(event).origin)

export async function assertAiAllowed(event: H3Event, supabase: SupabaseClient, config: AiConfig): Promise<void> {
  if (!isV2(event)) {
    await assertAiQuota(supabase, config.dailyQuota)
    return
  }
  await assertAiAvailable(supabase, aiLimitsOf(config), {
    onBudgetExceeded: async () => {
      const admin = serviceClient(event)
      const { data } = await admin.rpc('claim_ai_alert_email', { p_key: 'ai_budget' })
      if (data === true) await sendAiCreditAlert(emailConfigOf(event), { reason: 'budget', count: config.monthlyBudgetCalls || undefined })
    }
  })
}

function isAiAppError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { data?: { code?: unknown } }).data?.code
  return code === AI_CODES.unavailable || code === AI_CODES.quotaReached || code === AI_CODES.busy
}

/** Voir l'en-tête. Relance l'erreur adaptée, ou rend la main si elle n'est pas une erreur IA reconnue. */
export async function throwAiFailure(event: H3Event, error: unknown, context: string): Promise<void> {
  if (!isV2(event)) {
    throwAiProviderError(error, context)
    return
  }
  if (isAiAppError(error)) throw error   // déjà une erreur v2 (garde) : 503 / 429 portent un code, handleApiError les aurait écrasées
  await reportBillingFailure({
    report: async () => {
      const { data, error: rpcError } = await serviceClient(event).rpc('report_ai_billing_error')
      if (rpcError) throw rpcError
      return data === true
    },
    sendAlert: () => sendAiCreditAlert(emailConfigOf(event), { reason: 'credit' })
  }, error)
  const mapped = aiHttpError(error)
  if (mapped) {
    console.error(`[api] ${context} : ${mapped.data?.code ?? 'ai'}`)
    throw mapped
  }
  throwAiProviderError(error, context)
}
