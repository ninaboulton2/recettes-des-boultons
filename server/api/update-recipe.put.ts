import { createError, defineEventHandler } from 'h3'
import { recipeIdQuerySchema, toSaveRecipePayload, updateRecipeBodySchema, type TranslationResult } from '#shared/schemas'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '#shared/types/database'
import { isV2Enabled } from '#shared/utils/v2'
import { RECIPE_PHOTO_BUCKET, removeReplacedPhoto } from '../utils/photos'
import { translateRecipe } from '../utils/translations'

/**
 * PUT /api/update-recipe?id= — remplace intégralement une recette (admin).
 * Body : `{ updates: RecipeInput }` (même forme que la création : l'éditeur
 * renvoie toujours la recette complète). `save_recipe` remplace toutes les
 * sections/ingrédients/instructions (pas de doublon).
 *
 * Recettes bilingues (0016) : l'éditeur modifie le texte dans la langue
 * d'origine. `save_recipe` marque la traduction « périmée » ; ici on la
 * revalide si les textes sources n'ont pas changé (même empreinte : photo,
 * temps, catégorie… modifiés seulement), sinon on la régénère par l'IA
 * (quota et `ai_usage`, `translate_recipe`). Si l'IA échoue, l'enregistrement
 * réussit quand même : la réponse porte `translation.status = 'failed'`, la
 * traduction reste périmée (ignorée à l'affichage) et le
 * prochain enregistrement la refait.
 *
 * Photos (phase 8, v2 seulement) : si la photo est remplacée ou retirée, l'ancien objet du bucket est supprimé ici APRÈS
 * l'enregistrement (clé service_role, seulement s'il est dans le dossier de la recette) : un éditeur `edit_original` n'a pas le
 * droit de supprimer un objet. En v1 le navigateur s'en charge (inchangé).
 */
export default defineEventHandler(async (event) => {
  try {
    const auth = await requireRecipeWriter(event)
    const { supabase } = auth
    const { id } = validateQuery(event, recipeIdQuerySchema)
    const { updates } = await validateBody(event, updateRecipeBodySchema)

    // save_recipe créerait la recette si l'id est inconnu : pour un PUT on exige qu'elle existe.
    const { data: existing, error: checkError } = await supabase
      .from('recipes')
      .select('id, photo_path')
      .eq('id', id)
      .maybeSingle()
    if (checkError) {
      throwSupabaseError(checkError, 'update-recipe check')
    }
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Recette introuvable' })
    }

    const { error } = await supabase.rpc('save_recipe', { payload: toSaveRecipePayload(updates, id) })
    if (error) {
      throwSupabaseError(error, 'update-recipe save_recipe')
    }

    const saved = await fetchRecipeDetail(supabase, id)

    if (isV2Enabled(useRuntimeConfig(event).public.v2)) {
      const storage = serverSupabaseServiceRole<Database>(event).storage.from(RECIPE_PHOTO_BUCKET)
      await removeReplacedPhoto({ remove: paths => storage.remove(paths) }, id, existing.photo_path, saved.photoPath)
    }

    const outcome = await translateRecipe(event, auth, saved)
    const translation: TranslationResult = outcome.status === 'translated'
      ? { status: 'translated', lang: outcome.lang }
      : outcome.status === 'failed'
        ? { status: 'failed', reason: outcome.reason, message: outcome.message }
        : { status: 'unchanged' }

    return {
      success: true,
      recipe: saved,
      translation,
      message: `Recette « ${saved.title} » mise à jour`
    }
  } catch (error: unknown) {
    handleApiError(error, 'update-recipe')
  }
})
