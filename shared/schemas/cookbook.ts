import { z } from 'zod'
import { uuidSchema } from './common'

/**
 * Carnet de recettes v2 (migration 0021) : entrées des RPC `list_cookbook`, `list_author_recipes`,
 * `list_shared_with_me`, `add_to_cookbook`, `remove_from_cookbook`, `copy_recipe`, `pending_prompts`,
 * `dismiss_prompt`. Valident ce que le client envoie ; les droits sont décidés en base (RLS + fonctions).
 */

/** Niveau de droit de la personne connectée sur une recette (`private.recipe_level`). */
export const RECIPE_PERMISSIONS = ['author', 'edit_original', 'copy', 'read'] as const
export const recipePermissionSchema = z.enum(RECIPE_PERMISSIONS)
export type RecipePermission = z.infer<typeof recipePermissionSchema>

/** `owned` : une recette que j'ai écrite (ou copiée) ; `added` : ajoutée « telle quelle » à mon carnet. */
export const COOKBOOK_RELATIONS = ['owned', 'added'] as const
export const cookbookRelationSchema = z.enum(COOKBOOK_RELATIONS)
export type CookbookRelation = z.infer<typeof cookbookRelationSchema>

/** Taille de page par défaut et maximale des listes (la base borne aussi à 100). */
export const COOKBOOK_PAGE_SIZE = 24
export const COOKBOOK_MAX_PAGE_SIZE = 100

const pageSchema = z.coerce.number({ invalid_type_error: 'doit être un nombre' })
  .int('doit être un entier').min(1, 'doit être au moins 1').default(1)
const pageSizeSchema = z.coerce.number({ invalid_type_error: 'doit être un nombre' })
  .int('doit être un entier').min(1, 'doit être au moins 1')
  .max(COOKBOOK_MAX_PAGE_SIZE, `trop grand (max ${COOKBOOK_MAX_PAGE_SIZE})`).default(COOKBOOK_PAGE_SIZE)

/** `list_cookbook(p_category, p_query, p_limit, p_offset)` */
export const cookbookListQuerySchema = z.object({
  categoryId: uuidSchema.nullish(),
  query: z.string().trim().max(200, 'trop long (max 200 caractères)').nullish(),
  page: pageSchema,
  pageSize: pageSizeSchema
})

/** `list_author_recipes(p_author, p_limit, p_offset)` : « Explorer les recettes de X ». */
export const authorRecipesQuerySchema = z.object({
  authorId: uuidSchema,
  page: pageSchema,
  pageSize: pageSizeSchema
})

/** `list_shared_with_me(p_limit, p_offset)` */
export const sharedWithMeQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema
})

/** `add_to_cookbook(p_recipe, p_category)` : la catégorie, si fournie, doit être à moi (vérifié en base). */
export const addToCookbookInputSchema = z.object({
  recipeId: uuidSchema,
  categoryId: uuidSchema.nullish()
})

/** `remove_from_cookbook(p_recipe)` */
export const removeFromCookbookInputSchema = z.object({ recipeId: uuidSchema })

/** `copy_recipe(p_source)` : copie modifiable (la photo n'est PAS copiée avant la phase 8). */
export const copyRecipeInputSchema = z.object({ recipeId: uuidSchema })

/** `add_author_recipes_to_cookbook(p_author)` (0019) : « tout ajouter ». */
export const addAuthorRecipesInputSchema = z.object({ authorId: uuidSchema })

/** Bannières : « Explorer les recettes de X » (`author_recipes`) et « X a publié… » (`new_recipe`). */
export const PROMPT_KINDS = ['author_recipes', 'new_recipe'] as const
export const promptKindSchema = z.enum(PROMPT_KINDS)
export type PromptKind = z.infer<typeof promptKindSchema>

/** `pending_prompts(p_since, p_limit)` */
export const pendingPromptsQuerySchema = z.object({
  since: z.string().datetime({ offset: true, message: 'doit être une date ISO 8601' }).nullish(),
  limit: z.coerce.number().int().min(1).max(COOKBOOK_MAX_PAGE_SIZE).default(20)
})

/** `dismiss_prompt(p_kind, p_target)` : `targetId` = l'auteur (`author_recipes`) ou la recette (`new_recipe`). */
export const dismissPromptInputSchema = z.object({
  kind: promptKindSchema,
  targetId: uuidSchema
})

export type CookbookListQuery = z.infer<typeof cookbookListQuerySchema>
export type AuthorRecipesQuery = z.infer<typeof authorRecipesQuerySchema>
export type SharedWithMeQuery = z.infer<typeof sharedWithMeQuerySchema>
export type AddToCookbookInput = z.infer<typeof addToCookbookInputSchema>
export type PendingPromptsQuery = z.infer<typeof pendingPromptsQuerySchema>
export type DismissPromptInput = z.infer<typeof dismissPromptInputSchema>

/** Page demandée → `p_limit` / `p_offset` des RPC. */
export function pageToRange(page: number, pageSize: number): { limit: number, offset: number } {
  return { limit: pageSize, offset: (page - 1) * pageSize }
}
