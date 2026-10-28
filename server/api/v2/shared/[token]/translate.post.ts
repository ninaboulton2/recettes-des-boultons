import { createError, defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { uuidSchema } from '#shared/schemas/common'
import { recipeLangSchema } from '#shared/schemas/translation'
import { isV2Enabled } from '#shared/utils/v2'
import { ensureTranslationFor } from '../../../../utils/sharedTranslation'
import { serviceClient } from '../../../../utils/serviceClient'

/**
 * POST /api/v2/shared/<jeton>/translate — traduit à la demande la recette d'un lien public (page `/r/<jeton>`, SANS compte) vers la
 * langue de la page (`{ locale }`), quand elle n'a pas de traduction à jour. v2 seulement. Même réponse que
 * `/api/v2/recipes/<id>/translate`. Le jeton (UUID secret) est résolu par `shared_recipe_id` (service_role) ; un jeton mal formé, inconnu
 * ou révoqué donne le même 404. Coût compté sur l'auteur de la recette ; une traduction réussie est écrite une fois pour toutes, un échec
 * n'est pas rejoué avant 10 minutes (voir `sharedTranslationCore.ts`) : un visiteur anonyme ne peut pas faire consommer l'IA en boucle.
 */
const bodySchema = z.object({ locale: recipeLangSchema })

export default defineEventHandler(async (event) => {
  try {
    if (!isV2Enabled(useRuntimeConfig(event).public.v2)) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    const parsed = uuidSchema.safeParse(getRouterParam(event, 'token'))
    if (!parsed.success) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    const { locale } = await validateBody(event, bodySchema)

    const { data, error } = await serviceClient(event).rpc('shared_recipe_id', { p_token: parsed.data })
    if (error) throwSupabaseError(error, 'translate-shared-link lecture du jeton')
    if (typeof data !== 'string') throw createError({ statusCode: 404, statusMessage: 'Not Found' })

    return await ensureTranslationFor(event, data, locale)
  } catch (error: unknown) {
    handleApiError(error, 'translate-shared-link')
  }
})
