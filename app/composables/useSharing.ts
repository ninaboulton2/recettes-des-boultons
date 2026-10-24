import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import type { Database } from '#shared/types/database'
import {
  claimSharedRecipeInputSchema,
  getSharedRecipeInputSchema,
  grantRecipeInputSchema,
  recipeShareInputSchema,
  reshareRecipeInputSchema,
  revokeRecipeGrantInputSchema,
  setVisibilityInputSchema,
  sharedRecipeSchema,
  type SharedRecipe
} from '#shared/schemas/sharing'
import { sharedRecipePath, toRecipeGrant, type RecipeGrant } from '#shared/utils/cookbook'
import { parseClientInput } from './useCookbook'

/**
 * Partage v2 (migration 0021) — droits, repartage, lien public, usage avant suppression. Appels directs aux RPC
 * avec la session de la personne (voir `useCookbook`). Les règles (auteur seulement, ami ou groupe commun,
 * plafonnement, jamais d'`edit_original` hérité) sont appliquées en base : une erreur 42501 = refusé.
 * `getSharedRecipe` s'utilise aussi SANS compte (client anonyme).
 */

type Client = SupabaseClient<Database>

/** L'AUTEUR donne (ou remplace) un droit à une personne OU un groupe. Renvoie l'id du droit. */
export async function grantRecipe(supabase: Client, input: z.input<typeof grantRecipeInputSchema>): Promise<string> {
  const { recipeId, granteeUserId, granteeGroupId, permission } = parseClientInput(grantRecipeInputSchema, input)
  const { data, error } = await supabase.rpc('grant_recipe', {
    p_recipe: recipeId,
    p_grantee_user: granteeUserId ?? undefined,
    p_grantee_group: granteeGroupId ?? undefined,
    p_permission: permission
  })
  if (error) throw error
  return data
}

/** Repartage d'un droit reçu à UNE PERSONNE (read ou copy, jamais edit_original, jamais un groupe). `null` : la personne avait déjà un droit qui n'est pas le mien. */
export async function reshareRecipe(supabase: Client, input: z.input<typeof reshareRecipeInputSchema>): Promise<string | null> {
  const { recipeId, granteeUserId, permission } = parseClientInput(reshareRecipeInputSchema, input)
  const { data, error } = await supabase.rpc('reshare_recipe', {
    p_recipe: recipeId,
    p_grantee_user: granteeUserId,
    p_permission: permission
  })
  if (error) throw error
  return data ?? null
}

/** Retire un droit (auteur, auteur d'un repartage, ou bénéficiaire qui renonce). `false` : rien retiré. */
export async function revokeRecipeGrant(supabase: Client, input: z.input<typeof revokeRecipeGrantInputSchema>): Promise<boolean> {
  const { grantId } = parseClientInput(revokeRecipeGrantInputSchema, input)
  const { data, error } = await supabase.rpc('revoke_recipe_grant', { p_grant_id: grantId })
  if (error) throw error
  return data === true
}

/** Les droits donnés sur une recette (auteur seulement). */
export async function listRecipeGrants(supabase: Client, input: z.input<typeof recipeShareInputSchema>): Promise<RecipeGrant[]> {
  const { recipeId } = parseClientInput(recipeShareInputSchema, input)
  const { data, error } = await supabase.rpc('list_recipe_grants', { p_recipe: recipeId })
  if (error) throw error
  return (data ?? []).map(toRecipeGrant)
}

/** Active le lien public (auteur seulement) : renvoie le jeton et l'adresse relative `/r/<jeton>`. */
export async function createShareLink(supabase: Client, input: z.input<typeof recipeShareInputSchema>): Promise<{ token: string, path: string }> {
  const { recipeId } = parseClientInput(recipeShareInputSchema, input)
  const { data, error } = await supabase.rpc('create_share_link', { p_recipe: recipeId })
  if (error) throw error
  return { token: data, path: sharedRecipePath(data) }
}

/** Désactive le lien public (auteur seulement). Ceux qui ont déjà ajouté la recette la gardent. */
export async function revokeShareLink(supabase: Client, input: z.input<typeof recipeShareInputSchema>): Promise<boolean> {
  const { recipeId } = parseClientInput(recipeShareInputSchema, input)
  const { data, error } = await supabase.rpc('revoke_share_link', { p_recipe: recipeId })
  if (error) throw error
  return data === true
}

/**
 * Page publique : la recette complète pour un jeton (sans compte), `null` si le lien est inconnu ou révoqué.
 * La réponse est validée en `.strict()` : une clé en trop (donc potentiellement identifiante) fait échouer l'appel.
 */
export async function getSharedRecipe(supabase: Client, input: z.input<typeof getSharedRecipeInputSchema>): Promise<SharedRecipe | null> {
  const { token, locale } = parseClientInput(getSharedRecipeInputSchema, input)
  const { data, error } = await supabase.rpc('get_shared_recipe', { p_token: token, p_locale: locale ?? undefined })
  if (error) throw error
  if (data === null || data === undefined) return null
  return parseClientInput(sharedRecipeSchema, data)
}

/** Après connexion, depuis la page publique : crée le droit « copy » (origine lien) et ajoute au carnet. Renvoie l'id de la recette. */
export async function claimSharedRecipe(supabase: Client, input: z.input<typeof claimSharedRecipeInputSchema>): Promise<string> {
  const { token } = parseClientInput(claimSharedRecipeInputSchema, input)
  const { data, error } = await supabase.rpc('claim_shared_recipe', { p_token: token })
  if (error) throw error
  return data
}

/** Avant de supprimer une recette : combien de carnets et de copies d'AUTRES personnes (auteur seulement). */
export async function recipeUsage(supabase: Client, input: z.input<typeof recipeShareInputSchema>): Promise<{ cookbookCount: number, copyCount: number }> {
  const { recipeId } = parseClientInput(recipeShareInputSchema, input)
  const { data, error } = await supabase.rpc('recipe_usage', { p_recipe: recipeId })
  if (error) throw error
  const row = data?.[0]
  return { cookbookCount: row?.cookbook_count ?? 0, copyCount: row?.copy_count ?? 0 }
}

/** Règle la visibilité d'une recette dont on est l'auteur (la base refuse tout autre : trigger de garde, RLS). */
export async function setRecipeVisibility(supabase: Client, input: z.input<typeof setVisibilityInputSchema>): Promise<void> {
  const { recipeId, visibility } = parseClientInput(setVisibilityInputSchema, input)
  const { data, error } = await supabase.from('recipes').update({ visibility }).eq('id', recipeId).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Recette introuvable ou modification non autorisée')
}

/** Les fonctions ci-dessus liées au client Supabase de la session courante. */
export function useSharing() {
  const supabase = useSupabaseClient<Database>()
  return {
    grantRecipe: (input: z.input<typeof grantRecipeInputSchema>) => grantRecipe(supabase, input),
    reshareRecipe: (input: z.input<typeof reshareRecipeInputSchema>) => reshareRecipe(supabase, input),
    revokeRecipeGrant: (input: z.input<typeof revokeRecipeGrantInputSchema>) => revokeRecipeGrant(supabase, input),
    listRecipeGrants: (input: z.input<typeof recipeShareInputSchema>) => listRecipeGrants(supabase, input),
    createShareLink: (input: z.input<typeof recipeShareInputSchema>) => createShareLink(supabase, input),
    revokeShareLink: (input: z.input<typeof recipeShareInputSchema>) => revokeShareLink(supabase, input),
    getSharedRecipe: (input: z.input<typeof getSharedRecipeInputSchema>) => getSharedRecipe(supabase, input),
    claimSharedRecipe: (input: z.input<typeof claimSharedRecipeInputSchema>) => claimSharedRecipe(supabase, input),
    recipeUsage: (input: z.input<typeof recipeShareInputSchema>) => recipeUsage(supabase, input),
    setRecipeVisibility: (input: z.input<typeof setVisibilityInputSchema>) => setRecipeVisibility(supabase, input)
  }
}
