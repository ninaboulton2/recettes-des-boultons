import type { SupabaseClient } from '@supabase/supabase-js'
import type { ZodTypeAny, z } from 'zod'
import type { Database } from '#shared/types/database'
import {
  addAuthorRecipesInputSchema,
  addToCookbookInputSchema,
  authorRecipesQuerySchema,
  copyRecipeInputSchema,
  cookbookListQuerySchema,
  dismissPromptInputSchema,
  pageToRange,
  pendingPromptsQuerySchema,
  removeFromCookbookInputSchema,
  sharedWithMeQuerySchema
} from '#shared/schemas/cookbook'
import {
  toAuthorRecipe,
  toCookbookRecipe,
  toPendingPrompt,
  toSharedWithMeRecipe,
  type AuthorRecipe,
  type CookbookRecipe,
  type PendingPrompt,
  type SharedWithMeRecipe
} from '#shared/utils/cookbook'

/**
 * Carnet v2 (migration 0021) — appels directs aux RPC avec la session de la personne (supabase-js), comme
 * `useRecipeSearch` : pas de route serveur, les droits sont décidés en base (fonctions `security definer` qui
 * lisent `auth.uid()`). Aucune interface ici (phase 6B). Les entrées sont validées par Zod (`#shared/schemas/cookbook`) ;
 * une erreur de base (droit refusé : SQLSTATE 42501, introuvable : P0002) est relancée telle quelle.
 *
 * Fonctions pures `fn(supabase, …)` (testables sans Nuxt) + `useCookbook()` qui les lie au client courant.
 */

type Client = SupabaseClient<Database>

/** Valide une entrée ; message français lisible si invalide. */
export function parseClientInput<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const where = issue && issue.path.length > 0 ? `${issue.path.join('.')} : ` : ''
  throw new Error(`Données invalides : ${where}${issue?.message ?? 'valeur invalide'}`)
}

export interface Page<T> {
  items: T[]
  totalCount: number
}

/** Mes recettes + celles de mon carnet (`list_cookbook`), filtre catégorie et recherche facultatifs. */
export async function listCookbook(supabase: Client, input: z.input<typeof cookbookListQuerySchema> = {}): Promise<Page<CookbookRecipe>> {
  const { categoryId, query, page, pageSize } = parseClientInput(cookbookListQuerySchema, input)
  const { limit, offset } = pageToRange(page, pageSize)
  const { data, error } = await supabase.rpc('list_cookbook', {
    p_category: categoryId ?? undefined,
    p_query: query || undefined,
    p_limit: limit,
    p_offset: offset
  })
  if (error) throw error
  const rows = data ?? []
  return { items: rows.map(toCookbookRecipe), totalCount: rows[0]?.total_count ?? 0 }
}

/** « Explorer les recettes de X » : ses recettes que je peux lire, avec « déjà dans mon carnet ». */
export async function listAuthorRecipes(supabase: Client, input: z.input<typeof authorRecipesQuerySchema>): Promise<Page<AuthorRecipe>> {
  const { authorId, page, pageSize } = parseClientInput(authorRecipesQuerySchema, input)
  const { limit, offset } = pageToRange(page, pageSize)
  const { data, error } = await supabase.rpc('list_author_recipes', { p_author: authorId, p_limit: limit, p_offset: offset })
  if (error) throw error
  const rows = data ?? []
  return { items: rows.map(toAuthorRecipe), totalCount: rows[0]?.total_count ?? 0 }
}

/** Recettes partagées avec moi (droit direct ou de groupe) et pas encore dans mon carnet. */
export async function listSharedWithMe(supabase: Client, input: z.input<typeof sharedWithMeQuerySchema> = {}): Promise<Page<SharedWithMeRecipe>> {
  const { page, pageSize } = parseClientInput(sharedWithMeQuerySchema, input)
  const { limit, offset } = pageToRange(page, pageSize)
  const { data, error } = await supabase.rpc('list_shared_with_me', { p_limit: limit, p_offset: offset })
  if (error) throw error
  const rows = data ?? []
  return { items: rows.map(toSharedWithMeRecipe), totalCount: rows[0]?.total_count ?? 0 }
}

/** Ajoute une recette lisible à mon carnet « telle quelle ». Idempotent ; `true` seulement la première fois. */
export async function addToCookbook(supabase: Client, input: z.input<typeof addToCookbookInputSchema>): Promise<boolean> {
  const { recipeId, categoryId } = parseClientInput(addToCookbookInputSchema, input)
  const { data, error } = await supabase.rpc('add_to_cookbook', { p_recipe: recipeId, p_category: categoryId ?? undefined })
  if (error) throw error
  return data === true
}

/** Retire une recette de mon carnet. Idempotent ; `true` si une entrée a été retirée. */
export async function removeFromCookbook(supabase: Client, input: z.input<typeof removeFromCookbookInputSchema>): Promise<boolean> {
  const { recipeId } = parseClientInput(removeFromCookbookInputSchema, input)
  const { data, error } = await supabase.rpc('remove_from_cookbook', { p_recipe: recipeId })
  if (error) throw error
  return data === true
}

/** Copie modifiable (droit « copy » requis). Renvoie l'id de la copie. La photo n'est pas copiée (phase 8). */
export async function copyRecipe(supabase: Client, input: z.input<typeof copyRecipeInputSchema>): Promise<string> {
  const { recipeId } = parseClientInput(copyRecipeInputSchema, input)
  const { data, error } = await supabase.rpc('copy_recipe', { p_source: recipeId })
  if (error) throw error
  return data
}

/** « Tout ajouter » (0019) : ajoute toutes les recettes lisibles d'un auteur, ferme sa bannière. Renvoie le nombre d'ajouts. */
export async function addAuthorRecipesToCookbook(supabase: Client, input: z.input<typeof addAuthorRecipesInputSchema>): Promise<number> {
  const { authorId } = parseClientInput(addAuthorRecipesInputSchema, input)
  const { data, error } = await supabase.rpc('add_author_recipes_to_cookbook', { p_author: authorId })
  if (error) throw error
  return data
}

/** Bannières « Explorer les recettes de X » / « X a publié… » (calculées à la volée, rien n'est écrit). */
export async function pendingPrompts(supabase: Client, input: z.input<typeof pendingPromptsQuerySchema> = {}): Promise<PendingPrompt[]> {
  const { since, limit } = parseClientInput(pendingPromptsQuerySchema, input)
  const { data, error } = await supabase.rpc('pending_prompts', { p_since: since ?? undefined, p_limit: limit })
  if (error) throw error
  return (data ?? []).map(toPendingPrompt)
}

/** Ferme une bannière pour de bon (n'ajoute rien au carnet). */
export async function dismissPrompt(supabase: Client, input: z.input<typeof dismissPromptInputSchema>): Promise<void> {
  const { kind, targetId } = parseClientInput(dismissPromptInputSchema, input)
  const { error } = await supabase.rpc('dismiss_prompt', { p_kind: kind, p_target: targetId })
  if (error) throw error
}

/** Les fonctions ci-dessus liées au client Supabase de la session courante. */
export function useCookbook() {
  const supabase = useSupabaseClient<Database>()
  return {
    listCookbook: (input?: z.input<typeof cookbookListQuerySchema>) => listCookbook(supabase, input),
    listAuthorRecipes: (input: z.input<typeof authorRecipesQuerySchema>) => listAuthorRecipes(supabase, input),
    listSharedWithMe: (input?: z.input<typeof sharedWithMeQuerySchema>) => listSharedWithMe(supabase, input),
    addToCookbook: (input: z.input<typeof addToCookbookInputSchema>) => addToCookbook(supabase, input),
    removeFromCookbook: (input: z.input<typeof removeFromCookbookInputSchema>) => removeFromCookbook(supabase, input),
    copyRecipe: (input: z.input<typeof copyRecipeInputSchema>) => copyRecipe(supabase, input),
    addAuthorRecipesToCookbook: (input: z.input<typeof addAuthorRecipesInputSchema>) => addAuthorRecipesToCookbook(supabase, input),
    pendingPrompts: (input?: z.input<typeof pendingPromptsQuerySchema>) => pendingPrompts(supabase, input),
    dismissPrompt: (input: z.input<typeof dismissPromptInputSchema>) => dismissPrompt(supabase, input)
  }
}
