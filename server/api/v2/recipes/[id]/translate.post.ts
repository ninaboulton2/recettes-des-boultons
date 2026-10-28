import { createError, defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { uuidSchema } from '#shared/schemas/common'
import { recipeLangSchema } from '#shared/schemas/translation'
import { isV2Enabled } from '#shared/utils/v2'
import { ensureTranslationFor } from '../../../../utils/sharedTranslation'

/**
 * POST /api/v2/recipes/<id>/translate — traduit à la demande une recette que la personne peut LIRE (v2 seulement, 404 sinon) vers la
 * langue de son interface (`{ locale: 'fr' | 'en' }`), quand elle n'a pas encore de traduction à jour (recette d'une amie, d'un groupe,
 * copie…). Le résultat est écrit en base : les lectures suivantes, par tout le monde dans cette langue, n'appellent plus l'IA.
 *
 * Le droit de lire est vérifié avec la SESSION de la personne (RLS) ; l'écriture se fait avec la clé service_role. Le coût de l'appel IA
 * est compté sur l'AUTEUR de la recette (pas sur la personne qui lit). Réponse toujours 200 : `{ status, reason? }` avec `status` =
 * `same-language` | `ready` | `translated` | `busy` | `unavailable` ; un échec (plafond de l'auteur, crédit coupé) n'est pas une
 * erreur : la page garde le texte d'origine. 401 sans compte, 404 si la recette est illisible ou inconnue.
 */
const bodySchema = z.object({ locale: recipeLangSchema })

export default defineEventHandler(async (event) => {
  try {
    if (!isV2Enabled(useRuntimeConfig(event).public.v2)) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    const { supabase } = await requireUser(event)
    const parsed = uuidSchema.safeParse(getRouterParam(event, 'id'))
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Identifiant de recette invalide' })
    const { locale } = await validateBody(event, bodySchema)

    // Droit de lecture : sous RLS, une recette illisible ou inconnue est introuvable (même réponse).
    const { data, error } = await supabase.from('recipes').select('id').eq('id', parsed.data).maybeSingle()
    if (error) throwSupabaseError(error, 'translate-shared-recipe lecture')
    if (!data) throw createError({ statusCode: 404, statusMessage: 'Recette introuvable' })

    return await ensureTranslationFor(event, parsed.data, locale)
  } catch (error: unknown) {
    handleApiError(error, 'translate-shared-recipe')
  }
})
