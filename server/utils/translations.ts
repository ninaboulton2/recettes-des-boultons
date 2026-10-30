import type { SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import type { RecipeLang } from '#shared/types'
import { recipeTexts, sourceHash, type TranslationDraft } from '#shared/utils/translation'
import type { TranslationFailureReason } from '#shared/schemas/translation'
import { getAiConfig, getModel } from './ai/provider'
import { translateRecipeTexts } from './ai/translate'
import { trackAiCall } from './ai/usage'
import { reserveAiAllowed, throwAiFailure } from './ai/guard'
import type { AuthContext } from './auth'
import type { RecipeDetail } from './recipes'
import { GENERIC_ERROR_MESSAGE } from './errors'

/**
 * Traductions des recettes (migration 0016) côté serveur : traduction d'une
 * recette enregistrée (création, édition).
 *
 * Règles :
 *  - une recette = un appel IA (`feature = 'translate_recipe'` dans `ai_usage`,
 *    compté dans le quota journalier comme les autres appels) ;
 *  - la traduction est écrite par la RPC `save_recipe_translation` (langue
 *    source, traduction vers l'autre langue, `stale = false`) ;
 *  - le coût est compté sur le quota de l'AUTEUR de l'enregistrement (v2 : `ai_quota_status`, comme l'import ; crédit coupé
 *    ou budget du mois atteint : pas d'appel, la traduction reste en attente) ;
 *  - un échec n'est jamais une erreur HTTP pour l'appelant : il devient un
 *    `TranslationOutcome` `failed` (l'enregistrement de la recette, lui, a
 *    réussi) ; la traduction reste « périmée » jusqu'au prochain
 *    enregistrement de la recette.
 */

export const TRANSLATE_FEATURE = 'translate_recipe'

/**
 * Traduction À LA DEMANDE d'une recette partagée (migration 0032) : la ligne `ai_usage` compte dans le budget GLOBAL du mois et le coût,
 * mais jamais dans le plafond du jour de quelqu'un (ni l'auteur ni la personne qui lit) : `reserve_ai_call` et `ai_quota_status`
 * ignorent cette feature.
 */
export const TRANSLATE_SHARED_FEATURE = 'translate_shared'

export type FailureReason = TranslationFailureReason

export type TranslationOutcome
  = | { status: 'translated', lang: RecipeLang, costUsd: number | null }
    | { status: 'unchanged' }
    | { status: 'failed', reason: FailureReason, message: string }

interface TranslationMeta {
  locale: RecipeLang
  sourceHash: string
  stale: boolean
}

async function loadMeta(supabase: SupabaseClient, recipeId: string): Promise<TranslationMeta | null> {
  const { data, error } = await supabase
    .from('recipe_translations')
    .select('locale, source_hash, stale')
    .eq('recipe_id', recipeId)
    .order('translated_at', { ascending: false })
    .limit(1)
  if (error) {
    console.error('[api] translations : lecture recipe_translations', error)
    return null
  }
  const row = (data as Array<{ locale: RecipeLang, source_hash: string, stale: boolean }> | null)?.[0]
  return row ? { locale: row.locale, sourceHash: row.source_hash, stale: row.stale } : null
}

export function failureOf(error: unknown): { reason: FailureReason, message: string } {
  const status = typeof error === 'object' && error !== null && 'statusCode' in error
    ? (error as { statusCode: unknown }).statusCode
    : undefined
  const message = typeof error === 'object' && error !== null && 'statusMessage' in error
    && typeof (error as { statusMessage: unknown }).statusMessage === 'string'
    ? (error as { statusMessage: string }).statusMessage
    : GENERIC_ERROR_MESSAGE
  if (status === 429) return { reason: 'quota', message }
  if (status === 401) return { reason: 'config', message }
  if (status === 402 || status === 503) return { reason: 'provider', message }   // 503 : crédit / budget coupé (v2) ou fournisseur très sollicité
  return { reason: 'ai', message }
}

/**
 * Traduit une recette lue en base. Sans `force`, ne fait rien si la traduction
 * existante correspond déjà aux textes (même hash) : elle est seulement
 * « dépérimée » (cas d'un enregistrement qui n'a pas touché au texte).
 */
export async function translateRecipe(
  event: H3Event,
  auth: AuthContext,
  recipe: RecipeDetail,
  options: { force?: boolean } = {}
): Promise<TranslationOutcome> {
  const { supabase, user } = auth
  const texts = recipeTexts(recipe)
  const hash = sourceHash(texts)

  const meta = await loadMeta(supabase, recipe.id)
  if (!options.force && meta && meta.sourceHash === hash) {
    if (meta.stale) {
      const { error } = await supabase
        .from('recipe_translations')
        .update({ stale: false })
        .eq('recipe_id', recipe.id)
        .eq('locale', meta.locale)
      if (error) {
        console.error('[api] translations : revalidation de la traduction', error)
        return { status: 'failed', reason: 'save', message: GENERIC_ERROR_MESSAGE }
      }
    }
    return { status: 'unchanged' }
  }

  try {
    const config = getAiConfig(event)
    const model = getModel(config)   // avant la réservation : rien d'autre ne doit pouvoir échouer entre la réservation et l'appel
    const reservation = await reserveAiAllowed(event, supabase, config, { userId: user.id, feature: TRANSLATE_FEATURE })

    let result
    try {
      result = await trackAiCall(
        supabase,
        { userId: user.id, provider: config.provider, model: config.model, feature: TRANSLATE_FEATURE },
        () => translateRecipeTexts(model, texts),
        ({ usage }) => usage,
        reservation
      )
    } catch (error: unknown) {
      await throwAiFailure(event, error, 'translate-recipe (traduction enregistrée)')
      throw error
    }

    const { sourceLanguage, translation } = result.result
    const { error } = await supabase.rpc('save_recipe_translation', {
      p_recipe_id: recipe.id,
      p_lang: sourceLanguage,
      p_translation: toRpcTranslation(translation, hash, config.model)
    })
    if (error) {
      console.error('[api] translations : save_recipe_translation', error)
      return { status: 'failed', reason: 'save', message: GENERIC_ERROR_MESSAGE }
    }
    return { status: 'translated', lang: sourceLanguage, costUsd: result.logged.estimatedCostUsd }
  } catch (error: unknown) {
    const failure = failureOf(error)
    if (failure.reason === 'ai' && !(typeof error === 'object' && error !== null && 'statusCode' in error)) {
      console.error('[api] translations : échec de la traduction', error)
    }
    return { status: 'failed', ...failure }
  }
}

/** Traduction au format de la RPC `save_recipe_translation` (clés snake_case). */
export function toRpcTranslation(draft: TranslationDraft, hash: string, model: string | null) {
  return { ...draft, source_hash: hash, model }
}
