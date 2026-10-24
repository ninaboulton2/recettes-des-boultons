import { createError, defineEventHandler, getRouterParam, sendRedirect, setHeader } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '#shared/types/database'
import { isV2Enabled } from '#shared/utils/v2'
import { RECIPE_PHOTO_BUCKET, SHARED_PHOTO_REDIRECT_CACHE_SECONDS, signSharedPhoto } from '../../../../utils/photos'

/**
 * GET /api/v2/shared/<jeton>/photo — photo de la recette d'un lien public (page `/r/<jeton>`, sans compte). v2 seulement.
 * Le jeton est vérifié par `shared_recipe_photo_path` (réservée à service_role : le chemin contient l'id de la recette), puis une
 * URL signée de 2 minutes est calculée avec la clé service_role et suivie par une redirection 302. Le chemin vient de la base,
 * JAMAIS de la requête. Jeton mal formé, inconnu, révoqué ou recette sans photo : le même 404, sans rien révéler.
 */
export default defineEventHandler(async (event) => {
  try {
    if (!isV2Enabled(useRuntimeConfig(event).public.v2)) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    const admin = serverSupabaseServiceRole<Database>(event)
    const url = await signSharedPhoto({
      photoPath: token => admin.rpc('shared_recipe_photo_path', { p_token: token }),
      sign: (path, seconds) => admin.storage.from(RECIPE_PHOTO_BUCKET).createSignedUrl(path, seconds)
    }, getRouterParam(event, 'token'))
    if (!url) throw createError({ statusCode: 404, statusMessage: 'Not Found' })

    setHeader(event, 'Cache-Control', `private, max-age=${SHARED_PHOTO_REDIRECT_CACHE_SECONDS}`)
    setHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
    return sendRedirect(event, url, 302)
  } catch (error: unknown) {
    handleApiError(error, 'shared-photo')
  }
})
