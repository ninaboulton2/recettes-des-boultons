import { createError, defineEventHandler } from 'h3'
import { addRecipeBodySchema, toSaveRecipePayload, type TranslationResult } from '#shared/schemas'
import { inputTexts, normalizeDraft, sourceHash, translationShapeProblem, recipeTexts, type TranslationDraft } from '#shared/utils/translation'
import { getAiConfig } from '../utils/ai/provider'
import { toRpcTranslation, translateRecipe } from '../utils/translations'

/**
 * POST /api/add-recipe — crée une recette (admin).
 * Body : `{ recipe: RecipeInput, lang?, translation? }` (camelCase, forme de
 * l'éditeur). Un seul appel SQL : `save_recipe(payload)` (recette, sections,
 * ingrédients, instructions et, si fournie, traduction : même transaction),
 * puis relecture de la recette.
 *
 * Recettes bilingues (0016) :
 *  - avec `translation` (traducteur IA : `lang` + traduction alignée), la
 *    recette est enregistrée avec ses deux langues ; aucun appel IA ici ;
 *  - sans `translation` (éditeur), la recette est enregistrée, puis traduite
 *    par l'IA (quota et `ai_usage`, `translate_recipe`). Si l'IA échoue, la
 *    création réussit quand même : la réponse porte `translation.status =
 *    'failed'` et la page « Traductions » reprendra la recette.
 */
export default defineEventHandler(async (event) => {
  try {
    const auth = await requireAdmin(event)
    const { supabase } = auth
    const { recipe, lang, translation } = await validateBody(event, addRecipeBodySchema)

    let extra: Parameters<typeof toSaveRecipePayload>[2] = lang ? { lang } : {}
    let provided: TranslationDraft | null = null
    let model: string | null = null
    if (translation) {
      const texts = inputTexts(recipe)
      provided = normalizeDraft(texts, translation)
      const problem = translationShapeProblem(texts, provided)
      if (problem) {
        throw createError({ statusCode: 400, statusMessage: `Traduction incohérente avec la recette : ${problem}` })
      }
      try {
        model = getAiConfig(event).model
      } catch {
        // Configuration IA absente : le modèle reste inconnu, la traduction est valide.
      }
      extra = { lang: lang ?? 'fr', translation: toRpcTranslation(provided, sourceHash(texts), model) }
    }

    const { data: recipeId, error } = await supabase.rpc('save_recipe', { payload: toSaveRecipePayload(recipe, undefined, extra) })
    if (error) {
      throwSupabaseError(error, 'add-recipe save_recipe')
    }
    if (typeof recipeId !== 'string') {
      throw new Error('save_recipe n\'a pas renvoyé d\'identifiant')
    }

    const saved = await fetchRecipeDetail(supabase, recipeId)

    let result: TranslationResult
    if (provided) {
      // L'empreinte a été calculée sur l'entrée ; la base peut normaliser un texte
      // (unité déduite…) : on la recalcule sur la recette relue, sans appel IA.
      const hash = sourceHash(recipeTexts(saved))
      if (hash !== sourceHash(inputTexts(recipe))) {
        const { error: rewriteError } = await supabase.rpc('save_recipe_translation', {
          p_recipe_id: recipeId,
          p_lang: lang ?? 'fr',
          p_translation: toRpcTranslation(provided, hash, model)
        })
        if (rewriteError) console.error('[api] add-recipe : empreinte de la traduction', rewriteError)
      }
      result = { status: 'provided', lang: lang ?? 'fr' }
    } else {
      const outcome = await translateRecipe(event, auth, saved)
      result = outcome.status === 'translated'
        ? { status: 'translated', lang: outcome.lang }
        : outcome.status === 'failed'
          ? { status: 'failed', reason: outcome.reason, message: outcome.message }
          : { status: 'unchanged' }
    }

    return {
      success: true,
      recipe: saved,
      translation: result,
      message: `Recette « ${saved.title} » ajoutée`
    }
  } catch (error: unknown) {
    handleApiError(error, 'add-recipe')
  }
})
