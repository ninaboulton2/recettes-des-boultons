import { defineEventHandler } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { recipeIdQuerySchema } from '#shared/schemas'
import type { Database } from '#shared/types/database'
import { isV2Enabled } from '#shared/utils/v2'
import { RECIPE_PHOTO_BUCKET, removeRecipeFolder } from '../utils/photos'

/**
 * DELETE /api/delete-recipe?id= — supprime une recette (admin) via `delete_recipe`.
 * Recette inconnue (ou non autorisée par le RLS) → 404.
 * Photos (phase 8, v2 seulement) : après la suppression réussie, le dossier `<id>/` du bucket est vidé ici (clé service_role) ;
 * jamais avant (une suppression refusée ne doit pas faire perdre la photo). En v1 le navigateur s'en charge (inchangé).
 */
export default defineEventHandler(async (event) => {
  try {
    const { supabase } = await requireRecipeWriter(event)
    const { id } = validateQuery(event, recipeIdQuerySchema)

    const { error } = await supabase.rpc('delete_recipe', { p_id: id })
    if (error) {
      throwSupabaseError(error, 'delete-recipe delete_recipe')
    }

    if (isV2Enabled(useRuntimeConfig(event).public.v2)) {
      const storage = serverSupabaseServiceRole<Database>(event).storage.from(RECIPE_PHOTO_BUCKET)
      await removeRecipeFolder({
        list: (recipeId, offset, limit) => storage.list(recipeId, { limit, offset }),
        remove: paths => storage.remove(paths)
      }, id)
    }

    return {
      success: true,
      message: 'Recette supprimée',
      deletedRecipeId: id
    }
  } catch (error: unknown) {
    handleApiError(error, 'delete-recipe')
  }
})
