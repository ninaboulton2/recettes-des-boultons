import { createError, defineEventHandler } from 'h3'
import { z } from 'zod'
import { recipeLangSchema } from '#shared/schemas/translation'
import { isV2Enabled } from '#shared/utils/v2'
import { otherTitleLocale, parseTitleI18n, type CookbookTitleI18n } from '#shared/utils/cookbookTitle'
import { getAiConfig, getModel } from '../../../utils/ai/provider'
import { translateCookbookTitle } from '../../../utils/ai/translate'
import { trackAiCall } from '../../../utils/ai/usage'
import { reserveAiAllowed, throwAiFailure } from '../../../utils/ai/guard'
import { serviceClient } from '../../../utils/serviceClient'
import { failureOf, TRANSLATE_SHARED_FEATURE } from '../../../utils/translations'

/**
 * POST /api/v2/profile/cookbook-title — enregistre le « Titre du carnet » dans les DEUX langues (migration 0034,
 * `profiles.cookbook_title_i18n`). v2 seulement (404 sinon), 401 sans compte.
 *
 * Corps : `{ locale, title, other?, refresh? }`. `title` est le titre écrit dans la langue de l'interface (`locale`), déjà enregistré
 * dans `cookbook_title` par `update_my_profile` ; `other` est, si la personne l'a saisi, le titre dans l'AUTRE langue : il l'emporte
 * toujours. Sinon le serveur le traduit avec l'IA, sauf si une traduction du même titre existe déjà (et que `refresh` n'est pas demandé).
 *
 * L'appel IA est compté seulement sur le budget global du mois (feature `translate_shared`, 0032), pas sur le plafond du jour.
 * IA indisponible (crédit, budget, panne) : réponse 200 `status: 'unavailable'`, le titre d'origine reste affiché dans l'autre langue.
 * Colonne absente (0034 non appliquée) : `status: 'unavailable'`, `reason: 'migration'`, rien n'est cassé.
 * Réponse : `{ status: 'translated' | 'manual' | 'unchanged' | 'cleared' | 'unavailable', reason?, i18n }`.
 */
const bodySchema = z.object({
  locale: recipeLangSchema,
  title: z.string().max(80),
  other: z.string().max(80).optional(),
  refresh: z.boolean().optional()
})

type Status = 'translated' | 'manual' | 'unchanged' | 'cleared' | 'unavailable'

export default defineEventHandler(async (event) => {
  try {
    if (!isV2Enabled(useRuntimeConfig(event).public.v2)) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    const { supabase, user } = await requireUser(event)
    const body = await validateBody(event, bodySchema)
    const title = body.title.trim()
    const target = otherTitleLocale(body.locale)

    const { data: row, error: readError } = await supabase.from('profiles').select('cookbook_title_i18n').eq('id', user.id).maybeSingle()
    if (readError) {
      console.error('[api] cookbook-title : colonne cookbook_title_i18n illisible (0034 non appliquée ?)', readError.message)
      return { status: 'unavailable' as Status, reason: 'migration', i18n: {} as CookbookTitleI18n }
    }
    const current = parseTitleI18n(row?.cookbook_title_i18n)

    let status: Status
    let reason: string | undefined
    let next: CookbookTitleI18n | null = null

    if (!title) {
      status = 'cleared'
    } else {
      next = { [body.locale]: title }
      const manual = body.other?.trim()
      if (manual) {
        next[target] = manual
        status = 'manual'
      } else if (!body.refresh && current[body.locale] === title && current[target]) {
        next[target] = current[target]
        status = 'unchanged'
      } else {
        status = 'unavailable'
        try {
          const config = getAiConfig(event)
          const model = getModel(config)
          const admin = serviceClient(event)
          const reservation = await reserveAiAllowed(event, admin, config, { userId: user.id, feature: TRANSLATE_SHARED_FEATURE })
          const { result } = await trackAiCall(
            admin,
            { userId: user.id, provider: config.provider, model: config.model, feature: TRANSLATE_SHARED_FEATURE },
            () => translateCookbookTitle(model, title, body.locale, target),
            ({ usage }) => usage,
            reservation
          )
          next[target] = result.translation
          status = 'translated'
        } catch (error: unknown) {
          let failure: unknown = error
          try {
            await throwAiFailure(event, error, 'cookbook-title')   // prévient Nina si le crédit est épuisé ; relance l'erreur v2 adaptée
          } catch (mapped: unknown) {
            failure = mapped
          }
          reason = failureOf(failure).reason
          console.error(`[api] cookbook-title : traduction indisponible (${reason})`)
        }
      }
    }

    const { error: writeError } = await supabase.from('profiles').update({ cookbook_title_i18n: next }).eq('id', user.id)
    if (writeError) throwSupabaseError(writeError, 'cookbook-title écriture')
    return { status, ...(reason ? { reason } : {}), i18n: next ?? ({} as CookbookTitleI18n) }
  } catch (error: unknown) {
    handleApiError(error, 'cookbook-title')
  }
})
