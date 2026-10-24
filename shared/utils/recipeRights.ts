import type { RecipePermission } from '#shared/schemas/cookbook'
import type { RecipeVisibility, ResharePermission } from '#shared/schemas/sharing'
import { toRecipePermission } from '#shared/utils/cookbook'

/**
 * Droits AFFICHÉS sur une recette (v2, phase 6B) et provenance des cartes du carnet.
 *
 * Tout ce fichier sert à choisir quels boutons montrer : la base décide (RLS, RPC, 42501). Un bouton affiché à tort échoue
 * proprement avec un message ; un bouton masqué à tort est le vrai risque, d'où des règles écrites ici une fois, testées.
 */

/** Une ligne de la RPC `recipe_access` (migration 0026), snake_case. */
export interface RecipeAccessRow {
  permission: string
  explicit_permission: string | null
  in_cookbook: boolean
  owner_id: string | null
  owner_name: string | null
  visibility: string
  category_id: string | null
  copied_from: string | null
  copied_from_title: string | null
  has_share_link: boolean
}

/** Mon accès à UNE recette lisible. */
export interface RecipeAccess {
  permission: RecipePermission
  /** Le droit explicite le plus haut que je détiens (`null` : mon accès ne vient que du partage implicite « mes groupes » ou de l'écriture). */
  explicitPermission: 'read' | 'copy' | 'edit_original' | null
  inCookbook: boolean
  ownerId: string | null
  ownerName: string | null
  visibility: RecipeVisibility
  /** Catégorie de l'auteur (`null` pour les autres personnes). */
  categoryId: string | null
  /** L'original d'une copie, seulement s'il m'est lisible. */
  copiedFrom: string | null
  copiedFromTitle: string | null
  hasShareLink: boolean
}

export function toRecipeAccess(row: RecipeAccessRow): RecipeAccess {
  const explicit = row.explicit_permission
  return {
    permission: toRecipePermission(row.permission),
    explicitPermission: explicit === 'edit_original' || explicit === 'copy' || explicit === 'read' ? explicit : null,
    inCookbook: row.in_cookbook === true,
    ownerId: row.owner_id ?? null,
    ownerName: row.owner_name ?? null,
    visibility: row.visibility === 'private' ? 'private' : 'groups',
    categoryId: row.category_id ?? null,
    copiedFrom: row.copied_from ?? null,
    copiedFromTitle: row.copied_from_title ?? null,
    hasShareLink: row.has_share_link === true
  }
}

export interface RecipeRights {
  isOwner: boolean
  /** « Ajouter à mon carnet » (telle quelle). */
  canAddToCookbook: boolean
  /** « Retirer de mon carnet » (jamais pour l'auteur : ses recettes sont toujours dans son carnet). */
  canRemoveFromCookbook: boolean
  /** « Faire une copie modifiable » (droit copy ou plus, pas pour l'auteur). */
  canCopy: boolean
  /** « Modifier » : l'auteur ou un détenteur d'edit_original. */
  canEdit: boolean
  /** « Supprimer » : l'auteur seulement. */
  canDelete: boolean
  /** Droits, visibilité et lien public : l'auteur seulement. */
  canManageSharing: boolean
  /** Repartage : un droit EXPLICITE détenu, pas l'auteur. */
  canReshare: boolean
  /** Niveau maximal d'un repartage (`null` si on ne repartage pas) : jamais edit_original, jamais au-dessus du sien. */
  maxReshare: ResharePermission | null
  /** Le bouton « Partager » s'affiche (auteur ou repartage possible). */
  canShare: boolean
}

const RESHARE_ORDER: readonly ResharePermission[] = ['read', 'copy']

export function recipeRights(access: RecipeAccess): RecipeRights {
  const isOwner = access.permission === 'author'
  const explicit = access.explicitPermission
  const maxReshare: ResharePermission | null = isOwner || explicit === null
    ? null
    : explicit === 'read' ? 'read' : 'copy'
  const canCopy = !isOwner && (access.permission === 'copy' || access.permission === 'edit_original')
  return {
    isOwner,
    canAddToCookbook: !isOwner && !access.inCookbook,
    canRemoveFromCookbook: !isOwner && access.inCookbook,
    canCopy,
    canEdit: isOwner || access.permission === 'edit_original',
    canDelete: isOwner,
    canManageSharing: isOwner,
    canReshare: maxReshare !== null,
    maxReshare,
    canShare: isOwner || maxReshare !== null
  }
}

/** Niveaux qu'on peut offrir à un repartage : `read`, et `copy` si on détient au moins `copy`. */
export function reshareLevels(max: ResharePermission | null): ResharePermission[] {
  if (!max) return []
  return RESHARE_ORDER.slice(0, RESHARE_ORDER.indexOf(max) + 1)
}

export type Provenance
  = | { kind: 'mine' }
    | { kind: 'added', authorName: string | null }
    | { kind: 'copy', originalTitle: string | null }

/**
 * Provenance d'une carte du carnet : « à moi », « ajoutée — de X » ou « copie de… ».
 * `copiedFrom` : l'original de la copie quand `owned` est une copie ; `title` est `null` si l'original n'est plus lisible
 * (le badge dit alors seulement « copie »).
 */
export function provenanceOf(
  recipe: { relation: 'owned' | 'added', authorName: string | null },
  copiedFrom?: { title: string | null } | null
): Provenance {
  if (recipe.relation === 'added') return { kind: 'added', authorName: recipe.authorName }
  if (copiedFrom) return { kind: 'copy', originalTitle: copiedFrom.title }
  return { kind: 'mine' }
}

/** Avertissement avant suppression : seulement si quelqu'un d'autre l'a dans son carnet ou en a fait une copie. */
export function hasUsage(usage: { cookbookCount: number, copyCount: number }): boolean {
  return usage.cookbookCount > 0 || usage.copyCount > 0
}

/** Clé i18n d'un message d'erreur de partage / de carnet selon le SQLSTATE de la base (§ 20.9). */
export function sharingErrorKey(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  switch (code) {
    case '53400': return 'errors.sharing.quota'
    case '54000': return 'errors.sharing.rate'
    case '42501': return 'errors.sharing.forbidden'
    case 'P0002': return 'errors.sharing.notFound'
    case '22023': return 'errors.sharing.invalid'
    case '23505': return 'errors.sharing.duplicate'
    default: return 'errors.generic'
  }
}
