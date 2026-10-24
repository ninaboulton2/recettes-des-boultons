import { toRecipeSummary, type RecipeSummaryRow } from '#shared/utils/recipes'
import type { RecipeSummary } from '#shared/types'
import type { CookbookRelation, PromptKind, RecipePermission } from '#shared/schemas/cookbook'

/**
 * Lignes des RPC de la migration 0021 (snake_case) → objets d'application (camelCase).
 * Les cartes réutilisent `toRecipeSummary` : mêmes champs, même traduction que `search_recipes`.
 */

const PERMISSIONS: readonly string[] = ['author', 'edit_original', 'copy', 'read']

/** Droit renvoyé par la base ; toute valeur inattendue retombe sur `read` (le plus restrictif). */
export function toRecipePermission(value: string | null | undefined): RecipePermission {
  return PERMISSIONS.includes(value ?? '') ? (value as RecipePermission) : 'read'
}

/** Pour GRISER un bouton seulement : la base décide (`copy_recipe`, RLS). */
export const canCopy = (permission: RecipePermission) => permission !== 'read'
export const canEditOriginal = (permission: RecipePermission) => permission === 'author' || permission === 'edit_original'

export interface CookbookRow extends RecipeSummaryRow {
  category_id: string | null
  relation: string
  permission: string
  author_id: string | null
  author_name: string | null
  added_at: string | null
  total_count?: number | null
}

export interface CookbookRecipe extends RecipeSummary {
  /** Catégorie personnelle : la mienne (`owned`) ou mon rangement (`added`), `null` = sans catégorie. */
  categoryId: string | null
  relation: CookbookRelation
  permission: RecipePermission
  authorId: string | null
  authorName: string | null
  /** Date d'ajout au carnet (`added`) ou de création (`owned`). */
  addedAt: string | null
}

export function toCookbookRecipe(row: CookbookRow): CookbookRecipe {
  return {
    ...toRecipeSummary(row),
    categoryId: row.category_id ?? null,
    relation: row.relation === 'added' ? 'added' : 'owned',
    permission: toRecipePermission(row.permission),
    authorId: row.author_id ?? null,
    authorName: row.author_name ?? null,
    addedAt: row.added_at ?? null
  }
}

export interface AuthorRecipeRow extends RecipeSummaryRow {
  permission: string
  in_cookbook: boolean
  author_id: string | null
  author_name: string | null
}

/** Recette d'un auteur (page « Explorer les recettes de X »). */
export interface AuthorRecipe extends RecipeSummary {
  permission: RecipePermission
  inCookbook: boolean
  authorId: string | null
  authorName: string | null
}

export function toAuthorRecipe(row: AuthorRecipeRow): AuthorRecipe {
  return {
    ...toRecipeSummary(row),
    permission: toRecipePermission(row.permission),
    inCookbook: row.in_cookbook === true,
    authorId: row.author_id ?? null,
    authorName: row.author_name ?? null
  }
}

export interface SharedWithMeRow extends RecipeSummaryRow {
  permission: string
  via: string
  author_id: string | null
  author_name: string | null
}

/** Recette partagée avec moi et pas encore dans mon carnet. `via` : droit à mon nom (`user`) ou par un groupe. */
export interface SharedWithMeRecipe extends RecipeSummary {
  permission: RecipePermission
  via: 'user' | 'group'
  authorId: string | null
  authorName: string | null
}

export function toSharedWithMeRecipe(row: SharedWithMeRow): SharedWithMeRecipe {
  return {
    ...toRecipeSummary(row),
    permission: toRecipePermission(row.permission),
    via: row.via === 'user' ? 'user' : 'group',
    authorId: row.author_id ?? null,
    authorName: row.author_name ?? null
  }
}

export interface PendingPromptRow {
  kind: string
  target_id: string
  author_id: string
  author_name: string | null
  recipe_count: number
  recipe_id: string | null
  title: string | null
  created_at: string
}

/** Bannière à afficher ; `targetId` sert à la fermer (`dismiss_prompt`). */
export interface PendingPrompt {
  kind: PromptKind
  targetId: string
  authorId: string
  authorName: string | null
  /** `author_recipes` : nombre de recettes pas encore dans mon carnet ; `new_recipe` : 1. */
  recipeCount: number
  /** `new_recipe` seulement. */
  recipeId: string | null
  title: string | null
  createdAt: string
}

export function toPendingPrompt(row: PendingPromptRow): PendingPrompt {
  return {
    kind: row.kind === 'new_recipe' ? 'new_recipe' : 'author_recipes',
    targetId: row.target_id,
    authorId: row.author_id,
    authorName: row.author_name ?? null,
    recipeCount: row.recipe_count,
    recipeId: row.recipe_id ?? null,
    title: row.title ?? null,
    createdAt: row.created_at
  }
}

export interface RecipeGrantRow {
  grant_id: string
  grantee_user_id: string | null
  grantee_group_id: string | null
  grantee_name: string | null
  permission: string
  origin: string
  source_grant_id: string | null
  granted_by: string
  granted_by_name: string | null
  created_at: string
}

/** Un droit donné sur une recette (vue de l'auteur). Jamais d'e-mail : seulement des noms d'affichage. */
export interface RecipeGrant {
  id: string
  granteeUserId: string | null
  granteeGroupId: string | null
  granteeName: string | null
  permission: 'read' | 'copy' | 'edit_original'
  origin: 'direct' | 'reshare' | 'link'
  sourceGrantId: string | null
  grantedBy: string
  grantedByName: string | null
  createdAt: string
}

export function toRecipeGrant(row: RecipeGrantRow): RecipeGrant {
  return {
    id: row.grant_id,
    granteeUserId: row.grantee_user_id ?? null,
    granteeGroupId: row.grantee_group_id ?? null,
    granteeName: row.grantee_name ?? null,
    permission: row.permission === 'edit_original' ? 'edit_original' : row.permission === 'copy' ? 'copy' : 'read',
    origin: row.origin === 'reshare' ? 'reshare' : row.origin === 'link' ? 'link' : 'direct',
    sourceGrantId: row.source_grant_id ?? null,
    grantedBy: row.granted_by,
    grantedByName: row.granted_by_name ?? null,
    createdAt: row.created_at
  }
}

/** Adresse de la page publique d'une recette (`/r/<jeton>`, phase 6B). */
export function sharedRecipePath(token: string): string {
  return `/r/${token}`
}
