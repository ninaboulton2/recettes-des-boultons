import type { SupabaseClient } from '@supabase/supabase-js'
import type { ZodTypeAny, z } from 'zod'
import type { Database } from '#shared/types/database'
import { apiFetch } from './useApi'
import { apiErrorFromResponse } from './useApiError'
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
  setEntryCategoryInputSchema,
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

/**
 * Copies modifiables parmi des recettes à moi : `copied_from` (lu sur `recipes`, le RLS limite aux recettes que je lis)
 * puis le titre de l'original s'il m'est lisible. Un échec n'empêche jamais d'afficher la liste : on renvoie les cartes telles quelles.
 */
export async function attachCopyOrigins(supabase: Client, items: CookbookRecipe[]): Promise<CookbookRecipe[]> {
  const ownedIds = items.filter(item => item.relation === 'owned').map(item => item.id)
  if (ownedIds.length === 0) return items
  try {
    const { data: copies, error } = await supabase.from('recipes').select('id, copied_from').in('id', ownedIds).not('copied_from', 'is', null)
    if (error || !copies || copies.length === 0) return items
    const originIds = [...new Set(copies.map(row => row.copied_from).filter((id): id is string => typeof id === 'string'))]
    const { data: origins } = await supabase.from('recipes').select('id, title').in('id', originIds)
    const titles = new Map((origins ?? []).map(row => [row.id, row.title]))
    const copiedFrom = new Map(copies.map(row => [row.id, { title: titles.get(row.copied_from as string) ?? null }]))
    return items.map(item => copiedFrom.has(item.id) ? { ...item, copiedFrom: copiedFrom.get(item.id) } : item)
  } catch {
    return items
  }
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

/**
 * Range une recette AJOUTÉE (dont je ne suis pas l'auteur) dans l'une de mes catégories, ou la sort de toute catégorie
 * (`categoryId: null`). Écriture directe sur `cookbook_entries.category_id` : la politique de mise à jour de 0019 limite
 * aux lignes de la personne et à ses propres catégories (une catégorie d'un autre est refusée : 42501). `add_to_cookbook`
 * ne convient pas : elle garde la catégorie existante quand on lui en passe `null`. Erreur P0002 si la recette n'est pas dans le carnet.
 */
export async function setEntryCategory(supabase: Client, input: z.input<typeof setEntryCategoryInputSchema>): Promise<void> {
  const { recipeId, categoryId } = parseClientInput(setEntryCategoryInputSchema, input)
  const { data, error } = await supabase.from('cookbook_entries').update({ category_id: categoryId }).eq('recipe_id', recipeId).select('recipe_id')
  if (error) throw error
  if (!data || data.length === 0) throw Object.assign(new Error('Recette absente de votre carnet'), { code: 'P0002' })
}

/** Ma catégorie pour une recette ajoutée (`null` : sans catégorie ; `undefined` : pas dans mon carnet). */
export async function getEntryCategory(supabase: Client, recipeId: string): Promise<string | null | undefined> {
  const { data, error } = await supabase.from('cookbook_entries').select('category_id').eq('recipe_id', recipeId).maybeSingle()
  if (error) throw error
  return data ? (data.category_id ?? null) : undefined
}

/** Copie modifiable (droit « copy » requis), SANS photo (RPC seule). L'interface utilise `copyRecipeWithPhoto`. Renvoie l'id de la copie. */
export async function copyRecipe(supabase: Client, input: z.input<typeof copyRecipeInputSchema>): Promise<string> {
  const { recipeId } = parseClientInput(copyRecipeInputSchema, input)
  const { data, error } = await supabase.rpc('copy_recipe', { p_source: recipeId })
  if (error) throw error
  return data
}

/** Code SQLSTATE équivalent d'un statut HTTP de la route de copie (les messages d'erreur de l'interface se basent sur ce code). */
const SQLSTATE_BY_STATUS: Record<number, string> = { 400: '22023', 403: '42501', 404: 'P0002', 409: '53400', 429: '54000' }

/**
 * Copie modifiable d'une recette AVEC sa photo (phase 8, v2) : `POST /api/v2/recipes/<id>/copy` (le serveur appelle `copy_recipe`
 * avec la session de la personne, puis copie l'objet Storage avec la clé service_role). Renvoie l'id de la copie et si la photo
 * a pu être copiée. Les erreurs portent le `code` SQLSTATE attendu par `sharingErrorKey`.
 */
export async function copyRecipeWithPhoto(input: z.input<typeof copyRecipeInputSchema>): Promise<{ id: string, photoCopied: boolean }> {
  const { recipeId } = parseClientInput(copyRecipeInputSchema, input)
  let response: Response
  try {
    response = await apiFetch(`/api/v2/recipes/${recipeId}/copy`, { method: 'POST' })
  } catch {
    throw new Error('Connexion impossible, vérifiez votre réseau puis réessayez.')
  }
  if (!response.ok) {
    const apiError = await apiErrorFromResponse(response)
    throw Object.assign(apiError, { code: SQLSTATE_BY_STATUS[response.status] ?? apiError.code })
  }
  const body = await response.json() as { id?: unknown, photoCopied?: unknown }
  if (typeof body.id !== 'string') throw new Error('Réponse inattendue du serveur')
  return { id: body.id, photoCopied: body.photoCopied === true }
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
    setEntryCategory: (input: z.input<typeof setEntryCategoryInputSchema>) => setEntryCategory(supabase, input),
    getEntryCategory: (recipeId: string) => getEntryCategory(supabase, recipeId),
    copyRecipe: (input: z.input<typeof copyRecipeInputSchema>) => copyRecipe(supabase, input),
    copyRecipeWithPhoto,
    addAuthorRecipesToCookbook: (input: z.input<typeof addAuthorRecipesInputSchema>) => addAuthorRecipesToCookbook(supabase, input),
    pendingPrompts: (input?: z.input<typeof pendingPromptsQuerySchema>) => pendingPrompts(supabase, input),
    dismissPrompt: (input: z.input<typeof dismissPromptInputSchema>) => dismissPrompt(supabase, input)
  }
}
