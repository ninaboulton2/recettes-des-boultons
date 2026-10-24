import { generateText } from 'ai'
import { defineEventHandler, getHeader, setResponseHeader } from 'h3'
import { assertCronSecret } from '../../utils/cron'
import { serviceClient } from '../../utils/serviceClient'
import { getAiConfig, getModel } from '../../utils/ai/provider'
import { probeAiCredit, type ProbeOutcome } from '../../utils/ai/probe'

/**
 * GET /api/cron/ai-credit-probe — tâche planifiée Vercel (une fois par jour sur Hobby) : si l'alerte de crédit IA est active,
 * un appel d'essai minimal (« ping », 16 jetons au plus, ~0,000003 $) vérifie si le fournisseur répond de nouveau et lève
 * l'alerte si oui. Sans alerte active : aucun appel. Protégée par `CRON_SECRET`. Détail : DEVELOPER.md § 20.15.
 */
export default defineEventHandler(async (event): Promise<ProbeOutcome> => {
  // Hors du try : 401 (mauvais secret) et 503 (secret absent, route désactivée) restent tels quels. Dans le try, handleApiError
  // transformerait le 503 en 500 journalisé (et envoyé à Sentry) à chaque passage de la tâche planifiée tant que CRON_SECRET manque.
  const config = useRuntimeConfig(event)
  assertCronSecret(getHeader(event, 'authorization'), String(config.cronSecret ?? process.env.CRON_SECRET ?? ''))
  try {
    setResponseHeader(event, 'Cache-Control', 'no-store')

    const admin = serviceClient(event)
    return await probeAiCredit({
      isAlertActive: async () => {
        const { data, error } = await admin.rpc('ai_credit_alert_active')
        if (error) throw error
        return data === true
      },
      callProvider: async () => {
        const ai = getAiConfig(event)
        if (ai.provider === 'mock') return   // aucun appel réseau en local / en test
        await generateText({ model: getModel(ai), prompt: 'ping', maxOutputTokens: 16, maxRetries: 0 })
      },
      resetAlert: async () => {
        const { data, error } = await admin.rpc('reset_ai_credit_alert')
        if (error) throw error
        return data === true
      },
      recordBillingFailure: async () => { await admin.rpc('report_ai_billing_error') }
    })
  } catch (error: unknown) {
    handleApiError(error, 'cron.ai-credit-probe')
  }
})
