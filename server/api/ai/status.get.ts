import { defineEventHandler, setResponseHeader } from 'h3'
import type { AiStatus } from '#shared/utils/aiStatus'
import { getAiConfig } from '../../utils/ai/provider'
import { fetchAiStatus } from '../../utils/ai/availability'
import { aiLimitsOf, isV2 } from '../../utils/ai/guard'

/**
 * GET /api/ai/status — l'IA est-elle utilisable par CETTE personne ? (v2, phase 7)
 * Réponse : `{ available, reason: 'credit' | 'budget' | 'quota' | null, quota: { used, quota, remaining, resetsAt, isNew } | null, since }`.
 * L'interface s'en sert pour désactiver les boutons IA et expliquer pourquoi : `credit` et `budget` (service coupé pour tous, même
 * message) se distinguent de `quota` (plafond du jour de ce compte, avec l'heure de remise à zéro). Sans l'interrupteur v2 :
 * toujours disponible (la v1 garde son comportement). Aucun détail technique, aucune donnée d'une autre personne.
 */
export default defineEventHandler(async (event): Promise<AiStatus> => {
  try {
    const { supabase } = await requireUser(event)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    if (!isV2(event)) return { available: true, reason: null, quota: null, since: null }
    return await fetchAiStatus(supabase, aiLimitsOf(getAiConfig(event)))
  } catch (error: unknown) {
    handleApiError(error, 'ai.status')
  }
})
