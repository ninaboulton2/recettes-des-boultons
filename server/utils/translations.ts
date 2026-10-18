import type { SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import type { RecipeLang } from '#shared/types'
import { recipeTexts, sourceHash, type TranslationDraft } from '#shared/utils/translation'
import type { TranslationFailureReason, TranslationStatus } from '#shared/schemas/translation'
import { getAiConfig, getModel } from './ai/provider'
import { translateRecipeTexts } from './ai/translate'
import { throwAiProviderError } from './ai/errors'
import { assertAiQuota, trackAiCall } from './ai/usage'
import type { AuthContext } from './auth'
import { fetchRecipeDetail, type RecipeDetail } from './recipes'
import { GENERIC_ERROR_MESSAGE } from './errors'

/**
 * Traductions des recettes (migration 0016) côté serveur : traduction d'une
 * recette enregistrée (édition, page « Traductions »), état global et liste
 * des recettes à traduire.
 *
 * Règles :
 *  - une recette = un appel IA (`feature = 'translate_recipe'` dans `ai_usage`,
 *    compté dans le quota journalier comme les autres appels) ;
 *  - la traduction est écrite par la RPC `save_recipe_translation` (langue
 *    source, traduction vers l'autre langue, `stale = false`) ;
 *  - un échec n'est jamais une erreur HTTP pour l'appelant : il devient un
 *    `TranslationOutcome` `failed` (l'enregistrement de la recette, lui, a
 *    réussi) ; la traduction reste « périmée » et sera reprise par la page
 *    « Traductions ».
 */

export const TRANSLATE_FEATURE = 'translate_recipe'

/**
 * Coût estimé d'une traduction (USD) avec gpt-4.1-mini, quand moins de 3 appels
 * ont été journalisés (voir docs/IA_MODELES.md, « Traduction des recettes ») :
 * ≈ 0,001 $ attendu pour une recette moyenne (950 caractères), arrondi au double
 * par prudence.
 */
export const DEFAULT_COST_PER_RECIPE_USD = 0.002

export type FailureReason = TranslationFailureReason

/** Raisons qui arrêtent un traitement en série : insister serait inutile. */
export const SYSTEMIC_FAILURES: readonly FailureReason[] = ['quota', 'config', 'provider']

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

function failureOf(error: unknown): { reason: FailureReason, message: string } {
  const status = typeof error === 'object' && error !== null && 'statusCode' in error
    ? (error as { statusCode: unknown }).statusCode
    : undefined
  const message = typeof error === 'object' && error !== null && 'statusMessage' in error
    && typeof (error as { statusMessage: unknown }).statusMessage === 'string'
    ? (error as { statusMessage: string }).statusMessage
    : GENERIC_ERROR_MESSAGE
  if (status === 429) return { reason: 'quota', message }
  if (status === 401) return { reason: 'config', message }
  if (status === 402) return { reason: 'provider', message }
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
    await assertAiQuota(supabase, config.dailyQuota)
    const model = getModel(config)

    let result
    try {
      result = await trackAiCall(
        supabase,
        { userId: user.id, provider: config.provider, model: config.model, feature: TRANSLATE_FEATURE },
        () => translateRecipeTexts(model, texts),
        ({ usage }) => usage
      )
    } catch (error: unknown) {
      throwAiProviderError(error, 'translate-recipe (traduction enregistrée)')
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

/** Recharge la recette puis la traduit (page « Traductions »). */
export async function translateRecipeById(event: H3Event, auth: AuthContext, recipeId: string, options: { force?: boolean } = {}) {
  const recipe = await fetchRecipeDetail(auth.supabase, recipeId)
  return { recipe, outcome: await translateRecipe(event, auth, recipe, options) }
}

// ---------------------------------------------------------------------------
// État global et file d'attente
// ---------------------------------------------------------------------------

const PAGE = 1000

/** Lit toutes les lignes d'une requête paginée (PostgREST plafonne à 1000 lignes). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null, error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

interface PendingRecipe { id: string, title: string, kind: 'missing' | 'stale' }

/** Recettes à traduire : d'abord celles sans traduction (plus anciennes en premier), puis les périmées. */
async function loadPending(supabase: SupabaseClient): Promise<{ total: number, translated: number, pending: PendingRecipe[] }> {
  const recipes = await fetchAll<{ id: string, title: string }>((from, to) =>
    supabase.from('recipes').select('id, title').order('created_at', { ascending: true }).order('id').range(from, to))
  const translations = await fetchAll<{ recipe_id: string, stale: boolean }>((from, to) =>
    supabase.from('recipe_translations').select('recipe_id, stale').order('recipe_id').range(from, to))
  const byRecipe = new Map(translations.map(row => [row.recipe_id, row.stale]))

  const missing: PendingRecipe[] = []
  const stale: PendingRecipe[] = []
  let translated = 0
  for (const recipe of recipes) {
    const state = byRecipe.get(recipe.id)
    if (state === undefined) missing.push({ ...recipe, kind: 'missing' })
    else if (state) stale.push({ ...recipe, kind: 'stale' })
    else translated++
  }
  return { total: recipes.length, translated, pending: [...missing, ...stale] }
}

/** Prochaines recettes à traduire (hors `exclude`), au plus `limit`. */
export async function nextPendingRecipes(
  supabase: SupabaseClient,
  limit: number,
  exclude: readonly string[] = [],
  only?: readonly string[]
): Promise<PendingRecipe[]> {
  const { pending } = await loadPending(supabase)
  const skipped = new Set(exclude)
  const wanted = only ? new Set(only) : null
  return pending.filter(recipe => !skipped.has(recipe.id) && (!wanted || wanted.has(recipe.id))).slice(0, limit)
}

export async function loadTranslationStatus(event: H3Event, supabase: SupabaseClient): Promise<TranslationStatus> {
  const { total, translated, pending } = await loadPending(supabase)
  const usage = await fetchAll<{ estimated_cost_usd: number | string | null, status: string }>((from, to) =>
    supabase.from('ai_usage').select('estimated_cost_usd, status').eq('feature', TRANSLATE_FEATURE).order('created_at').range(from, to))

  const ok = usage.filter(row => row.status === 'ok')
  const costs = ok.map(row => Number(row.estimated_cost_usd ?? 0))
  const costUsd = costs.reduce((sum, cost) => sum + cost, 0)
  const averageCostUsd = ok.length >= 3 ? costUsd / ok.length : DEFAULT_COST_PER_RECIPE_USD
  const config = getAiConfig(event)
  const stale = pending.filter(recipe => recipe.kind === 'stale').length

  return {
    total,
    translated,
    stale,
    missing: pending.length - stale,
    calls: usage.length,
    failedCalls: usage.length - ok.length,
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    averageCostUsd: Math.round(averageCostUsd * 1_000_000) / 1_000_000,
    // Le fournisseur simulé ne coûte rien : pas d'estimation de reste à payer.
    estimatedRemainingUsd: config.provider === 'mock' ? 0 : Math.round(pending.length * averageCostUsd * 10_000) / 10_000,
    dailyQuota: config.dailyQuota,
    provider: config.provider,
    model: config.model
  }
}
