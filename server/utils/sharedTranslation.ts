import type { SupabaseClient } from '@supabase/supabase-js'
import { createError, type H3Event } from 'h3'
import type { RecipeLang } from '#shared/types'
import { getAiConfig, getModel } from './ai/provider'
import { translateRecipeTexts } from './ai/translate'
import { trackAiCall } from './ai/usage'
import { reserveAiAllowed, throwAiFailure } from './ai/guard'
import { serviceClient } from './serviceClient'
import { fetchRecipeDetail } from './recipes'
import { failureOf, toRpcTranslation, TRANSLATE_SHARED_FEATURE } from './translations'
import { ensureRecipeTranslation, TranslationGuard, type EnsureOutcome, type TranslationPorts } from './sharedTranslationCore'

/**
 * Branchement Nuxt de la traduction à la demande (`sharedTranslationCore.ts`) : lectures et écritures avec la clé service_role,
 * APRÈS que la route a vérifié le droit de lire la recette (RLS avec la session de la personne) ou un lien public actif.
 * Appel IA compté seulement sur le budget global du mois (feature `translate_shared`, hors plafond du jour de l'auteur comme du lecteur ; migration 0032) : la ligne `ai_usage` porte l'identifiant de l'auteur (clé étrangère) sans compter dans son plafond.
 */

/** Un garde par instance du serveur : suffit à éviter les doubles appels et les relances répétées (au mieux, serverless). */
const guard = new TranslationGuard()

export async function ensureTranslationFor(event: H3Event, recipeId: string, locale: RecipeLang): Promise<EnsureOutcome> {
  const admin = serviceClient(event)

  const ports: TranslationPorts = {
    async load() {
      const { data, error } = await admin.from('recipes').select('lang, owner_id').eq('id', recipeId).maybeSingle()
      if (error) throw error
      if (!data) throw createError({ statusCode: 404, statusMessage: 'Recette introuvable' })
      const recipe = await fetchRecipeDetail(admin, recipeId)
      return { lang: data.lang === 'en' ? 'en' : 'fr', ownerId: (data.owner_id as string | null) ?? null, recipe }
    },
    async loadExisting() {
      const { data, error } = await admin
        .from('recipe_translations')
        .select('locale, source_hash, stale')
        .eq('recipe_id', recipeId)
        .order('translated_at', { ascending: false })
        .limit(1)
      if (error) {
        console.error('[api] traduction à la demande : lecture recipe_translations', error)
        return null
      }
      const row = (data as Array<{ locale: RecipeLang, source_hash: string, stale: boolean }> | null)?.[0]
      return row ? { locale: row.locale, sourceHash: row.source_hash, stale: row.stale } : null
    },
    async revalidate(targetLocale) {
      const { error } = await admin.from('recipe_translations').update({ stale: false }).eq('recipe_id', recipeId).eq('locale', targetLocale)
      if (error) console.error('[api] traduction à la demande : revalidation', error)
      return !error
    },
    async translate(ownerId, texts) {
      try {
        const config = getAiConfig(event)
        const model = getModel(config)   // avant la réservation : rien d'autre ne doit pouvoir échouer entre la réservation et l'appel
        const reservation = await reserveAiAllowed(event, admin, config, { userId: ownerId, feature: TRANSLATE_SHARED_FEATURE })
        const { result } = await trackAiCall(
          admin,
          { userId: ownerId, provider: config.provider, model: config.model, feature: TRANSLATE_SHARED_FEATURE },
          () => translateRecipeTexts(model, texts),
          ({ usage }) => usage,
          reservation
        )
        return { sourceLanguage: result.sourceLanguage, translation: result.translation, model: config.model }
      } catch (error: unknown) {
        await throwAiFailure(event, error, 'translate-shared-recipe')   // relance l'erreur v2 adaptée (503 / 429) et prévient Nina si le crédit est épuisé
        throw error
      }
    },
    async save(lang, translation, hash, model) {
      const { error } = await (admin as SupabaseClient).rpc('save_recipe_translation_server', {
        p_recipe_id: recipeId,
        p_lang: lang,
        p_translation: toRpcTranslation(translation, hash, model)
      })
      if (error) console.error('[api] traduction à la demande : save_recipe_translation_server', error)
      return !error
    },
    classify: error => failureOf(error).reason
  }

  return await ensureRecipeTranslation(ports, guard, { recipeId, locale })
}
