import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '#shared/types/database'
import {
  createReportInputSchema,
  reportSharedRecipeInputSchema,
  setReportStatusInputSchema,
  type CreateReportInput,
  type ReportSharedRecipeInput
} from '#shared/schemas/reports'
import { toSupportReport, type SupportReport } from '#shared/utils/reports'
import { parseClientInput } from './useCookbook'

/**
 * Signalements de contenu (phase 6E) — appels directs avec la session de la personne (supabase-js), comme les autres
 * composables v2 : les droits sont décidés en base (RLS de 0019, limite de 10 par jour de 0023, RPC de 0027).
 *  - `createReport` : insertion dans `reports` pour une recette que je peux lire (fiche) ;
 *  - `reportSharedRecipe` : RPC `report_shared_recipe` (page publique `/r/<jeton>`, connexion requise) ;
 *  - `listOpenReports`, `setReportStatus`, `deleteReportedRecipe` : écran du support (`/support/signalements`).
 */

type Client = SupabaseClient<Database>

/** Signale une recette lisible. Erreurs : 54000 limite du jour, 42501 refusé, 23503 recette supprimée entre-temps. */
export async function createReport(supabase: Client, reporterId: string, input: CreateReportInput): Promise<void> {
  const { recipeId, reason, details } = parseClientInput(createReportInputSchema, input)
  const { error } = await supabase.from('reports').insert({
    recipe_id: recipeId,
    reporter_id: reporterId,
    reason,
    ...(details ? { details } : {})
  })
  if (error) throw error
}

/** Signale la recette d'un lien public. Renvoie l'identifiant du signalement. Erreurs : 54000, P0002 (lien révoqué), 42501 (non connecté). */
export async function reportSharedRecipe(supabase: Client, input: ReportSharedRecipeInput): Promise<string> {
  const { token, reason, details } = parseClientInput(reportSharedRecipeInputSchema, input)
  const { data, error } = await supabase.rpc('report_shared_recipe', { p_token: token, p_reason: reason, p_details: details })
  if (error) throw error
  return data
}

/** Signalements à traiter (ouverts et examinés), avec le titre de la recette quand elle existe encore. Support seulement (RLS). */
export async function listOpenReports(supabase: Client): Promise<SupportReport[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('id, recipe_id, reason, details, status, created_at, handled_at, recipes(id, title)')
    .in('status', ['open', 'reviewed'])
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) throw error
  return (data ?? []).map(toSupportReport)
}

/** Passe un signalement à `reviewed`, `actioned` ou `dismissed` (colonnes `status` et `handled_at`, support seulement). */
export async function setReportStatus(supabase: Client, input: { reportId: string, status: 'reviewed' | 'actioned' | 'dismissed' }): Promise<void> {
  const { reportId, status } = parseClientInput(setReportStatusInputSchema, input)
  const { data, error } = await supabase
    .from('reports')
    .update({ status, handled_at: new Date().toISOString() })
    .eq('id', reportId)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw Object.assign(new Error('Signalement introuvable'), { code: 'P0002' })
}

/**
 * Supprime la recette signalée (politique `recipes_delete_author_or_support`, v2/0020). Les personnes qui l'avaient dans leur carnet
 * reçoivent `recipe_deleted` (déclencheur de 0023). La photo du bucket est retirée au mieux (un échec n'annule rien).
 */
export async function deleteReportedRecipe(supabase: Client, recipeId: string): Promise<void> {
  const { data: row } = await supabase.from('recipes').select('photo_path').eq('id', recipeId).maybeSingle()
  const { data, error } = await supabase.from('recipes').delete().eq('id', recipeId).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw Object.assign(new Error('Recette introuvable'), { code: 'P0002' })
  const photo = row?.photo_path
  if (photo) await supabase.storage.from('recipe-photos').remove([photo]).catch(() => undefined)
}

export function useReports() {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore()
  return {
    createReport: (input: CreateReportInput) => {
      const me = authStore.currentUser?.id
      if (!me) return Promise.reject(Object.assign(new Error('Connexion requise'), { code: '42501' }))
      return createReport(supabase, me, input)
    },
    reportSharedRecipe: (input: ReportSharedRecipeInput) => reportSharedRecipe(supabase, input),
    listOpenReports: () => listOpenReports(supabase),
    setReportStatus: (input: { reportId: string, status: 'reviewed' | 'actioned' | 'dismissed' }) => setReportStatus(supabase, input),
    deleteReportedRecipe: (recipeId: string) => deleteReportedRecipe(supabase, recipeId)
  }
}
