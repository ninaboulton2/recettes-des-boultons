import { defineEventHandler } from 'h3'
import { runTranslationsBodySchema, type RunTranslationsResponse } from '#shared/schemas'
import { loadTranslationStatus, nextPendingRecipes, SYSTEMIC_FAILURES, translateRecipeById } from '../../utils/translations'

/** Au-delà de ce temps écoulé, on ne démarre pas une recette de plus (Vercel : 30 s par requête). */
const BATCH_BUDGET_MS = 12_000

/**
 * POST /api/translations/run — traduit les recettes qui n'ont pas de
 * traduction (ou dont elle est périmée), au plus `limit` (1 à 3) par requête,
 * une recette par appel IA (admin).
 *
 * Reprenable et idempotent : la file est recalculée à chaque requête d'après
 * la base (« sans traduction » puis « périmée »), une recette déjà traduite
 * n'est jamais retraitée, relancer après une interruption continue où l'on
 * s'était arrêté. `ids` restreint le traitement à certaines recettes (outils, tests).
 * `exclude` : recettes à sauter (échec précédent de la même
 * exécution), pour qu'une recette récalcitrante ne bloque pas les suivantes.
 * Un échec « systémique » (quota journalier, clé IA, crédit du fournisseur)
 * arrête le lot et est renvoyé dans `stopped`.
 * Chaque appel est journalisé dans `ai_usage` (`translate_recipe`) et compte
 * dans le quota (`AI_DAILY_QUOTA`).
 */
export default defineEventHandler(async (event): Promise<RunTranslationsResponse> => {
  try {
    const auth = await requireAdmin(event)
    const { limit, exclude, ids } = await validateBody(event, runTranslationsBodySchema)

    const startedAt = Date.now()
    const queue = await nextPendingRecipes(auth.supabase, limit, exclude, ids)
    const results: RunTranslationsResponse['results'] = []
    let stopped: RunTranslationsResponse['stopped'] = null

    for (const pending of queue) {
      if (results.length > 0 && Date.now() - startedAt > BATCH_BUDGET_MS) break
      let outcome
      try {
        outcome = (await translateRecipeById(event, auth, pending.id)).outcome
      } catch (error: unknown) {
        // Recette supprimée entre-temps, lecture impossible… : on passe à la suivante.
        console.error('[api] translations.run : recette ignorée', pending.id, error)
        results.push({ id: pending.id, title: pending.title, status: 'failed', reason: 'ai', message: 'Recette illisible ou supprimée.' })
        continue
      }
      if (outcome.status === 'failed') {
        results.push({ id: pending.id, title: pending.title, status: 'failed', reason: outcome.reason, message: outcome.message })
        if (SYSTEMIC_FAILURES.includes(outcome.reason)) {
          stopped = { reason: outcome.reason, message: outcome.message }
          break
        }
      } else if (outcome.status === 'translated') {
        results.push({ id: pending.id, title: pending.title, status: 'translated', lang: outcome.lang })
      } else {
        results.push({ id: pending.id, title: pending.title, status: 'unchanged' })
      }
    }

    return { success: true, results, stopped, status: await loadTranslationStatus(event, auth.supabase) }
  } catch (error: unknown) {
    handleApiError(error, 'translations.run')
  }
})
