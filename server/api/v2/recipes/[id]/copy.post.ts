import { createError, defineEventHandler, getRouterParam } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { uuidSchema } from '#shared/schemas/common'
import type { Database } from '#shared/types/database'
import { isV2Enabled } from '#shared/utils/v2'
import { copyRecipeWithPhoto, RECIPE_PHOTO_BUCKET } from '../../../../utils/photos'

/**
 * POST /api/v2/recipes/<id>/copy — copie modifiable d'une recette (v2 seulement, 404 sinon), PHOTO COMPRISE.
 * `copy_recipe` (session de la personne) vérifie le droit de copier (SQLSTATE 42501 → 403) et copie tout sauf la photo, car
 * Storage ne se copie pas en SQL ; ici l'objet est copié sous `<id de la copie>/…` avec la clé service_role (le chemin est lu
 * en base, jamais fourni par le client) et `recipes.photo_path` de la copie est renseigné. Réponse : `{ id, photoCopied }`.
 * Une photo qui ne se copie pas n'empêche pas la copie de la recette (`photoCopied: false`).
 */
export default defineEventHandler(async (event) => {
  try {
    if (!isV2Enabled(useRuntimeConfig(event).public.v2)) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    const { supabase, user } = await requireUser(event)
    const parsed = uuidSchema.safeParse(getRouterParam(event, 'id'))
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Identifiant de recette invalide' })
    const sourceId = parsed.data

    const admin = serverSupabaseServiceRole<Database>(event)
    const storage = admin.storage.from(RECIPE_PHOTO_BUCKET)
    const result = await copyRecipeWithPhoto({
      copyRecipe: id => supabase.rpc('copy_recipe', { p_source: id }),
      sourcePhotoPath: async (id) => {
        const { data, error } = await supabase.from('recipes').select('photo_path').eq('id', id).maybeSingle()
        return { data: data?.photo_path ?? null, error }
      },
      copyObject: (from, to) => storage.copy(from, to),
      setPhotoPath: async (copyId, path) => {
        // la copie est à la personne (copy_recipe : owner_id = elle) ; la condition le garantit encore
        const { error } = await admin.from('recipes').update({ photo_path: path }).eq('id', copyId).eq('owner_id', user.id)
        return { error }
      },
      removeObject: path => storage.remove([path])
    }, sourceId).catch((error: unknown) => {
      // erreur renvoyée par copy_recipe (objet PostgREST sans statusCode) : traduite en erreur HTTP
      if (typeof error === 'object' && error !== null && 'code' in error && !('statusCode' in error)) {
        throwSupabaseError(error as { code?: string, message?: string }, 'copy-recipe copy_recipe')
      }
      throw error
    })

    return { success: true, ...result }
  } catch (error: unknown) {
    handleApiError(error, 'copy-recipe')
  }
})
