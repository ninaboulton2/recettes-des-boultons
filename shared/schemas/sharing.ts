import { z } from 'zod'
import { uuidSchema } from './common'
import { recipeLangSchema } from './translation'

/**
 * Partage v2 (migration 0021) : droits recette par recette (`grant_recipe`, `reshare_recipe`,
 * `revoke_recipe_grant`, `list_recipe_grants`), lien public (`create_share_link`, `revoke_share_link`,
 * `claim_shared_recipe`, `get_shared_recipe`) et `recipe_usage`. Les règles (ami ou groupe commun, plafonnement,
 * jamais d'`edit_original` hérité) sont appliquées en base ; ces schémas évitent seulement les appels mal formés.
 */

/** Droits qu'un AUTEUR peut donner. */
export const GRANT_PERMISSIONS = ['read', 'copy', 'edit_original'] as const
export const grantPermissionSchema = z.enum(GRANT_PERMISSIONS, {
  errorMap: () => ({ message: 'doit être read, copy ou edit_original' })
})
export type GrantPermission = z.infer<typeof grantPermissionSchema>

/** Droits d'un REPARTAGE : jamais `edit_original` (dossier §2.5). */
export const RESHARE_PERMISSIONS = ['read', 'copy'] as const
export const resharePermissionSchema = z.enum(RESHARE_PERMISSIONS, {
  errorMap: () => ({ message: 'un repartage donne read ou copy, jamais edit_original' })
})
export type ResharePermission = z.infer<typeof resharePermissionSchema>

/** `recipes.visibility` : « partager par défaut avec mes groupes » ou non. */
export const RECIPE_VISIBILITIES = ['private', 'groups'] as const
export const recipeVisibilitySchema = z.enum(RECIPE_VISIBILITIES, {
  errorMap: () => ({ message: 'doit être private ou groups' })
})
export type RecipeVisibility = z.infer<typeof recipeVisibilitySchema>

/** Une personne OU un groupe, pas les deux, pas aucun. */
const exactlyOneGrantee = (value: { granteeUserId?: string | null, granteeGroupId?: string | null }) =>
  Boolean(value.granteeUserId) !== Boolean(value.granteeGroupId)
const oneGranteeMessage = { message: 'indiquez une personne OU un groupe', path: ['granteeUserId'] }

/** `grant_recipe(p_recipe, p_grantee_user, p_grantee_group, p_permission)` — auteur seulement. */
export const grantRecipeInputSchema = z.object({
  recipeId: uuidSchema,
  granteeUserId: uuidSchema.nullish(),
  granteeGroupId: uuidSchema.nullish(),
  permission: grantPermissionSchema.default('copy')
}).refine(exactlyOneGrantee, oneGranteeMessage)

/** `reshare_recipe(p_recipe, p_grantee_user, p_grantee_group, p_permission)` — détenteur d'un droit explicite. */
export const reshareRecipeInputSchema = z.object({
  recipeId: uuidSchema,
  granteeUserId: uuidSchema.nullish(),
  granteeGroupId: uuidSchema.nullish(),
  permission: resharePermissionSchema.default('read')
}).refine(exactlyOneGrantee, oneGranteeMessage)

/** `revoke_recipe_grant(p_grant_id)` */
export const revokeRecipeGrantInputSchema = z.object({ grantId: uuidSchema })

/** `list_recipe_grants`, `create_share_link`, `revoke_share_link`, `recipe_usage` : une recette (auteur seulement). */
export const recipeShareInputSchema = z.object({ recipeId: uuidSchema })

/** Changer la visibilité d'une recette dont on est l'auteur (mise à jour directe de `recipes.visibility`). */
export const setVisibilityInputSchema = z.object({
  recipeId: uuidSchema,
  visibility: recipeVisibilitySchema
})

/** `get_shared_recipe(p_token, p_locale)` — exécutable sans compte. */
export const getSharedRecipeInputSchema = z.object({
  token: uuidSchema,
  locale: recipeLangSchema.nullish()
})

/** `claim_shared_recipe(p_token)` — « Ajouter à mon carnet » depuis la page publique, après connexion. */
export const claimSharedRecipeInputSchema = z.object({ token: uuidSchema })

/**
 * Réponse de `get_shared_recipe` : SANS identifiant de recette ni d'auteur, SANS e-mail, SANS `photo_path`.
 * `.strict()` : si la base se mettait à renvoyer une clé de plus (donc potentiellement identifiante), la validation
 * côté client échouerait au lieu de l'afficher en silence.
 */
export const sharedRecipeSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  prep_time: z.number().nullable(),
  cook_time: z.number().nullable(),
  servings: z.number().nullable(),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  lang: recipeLangSchema,
  has_photo: z.boolean(),
  author_name: z.string().nullable(),
  sections: z.array(z.object({
    name: z.string(),
    type: z.enum(['ingredients', 'instructions', 'mixed']),
    order_index: z.number(),
    ingredients: z.array(z.object({
      name: z.string(),
      amount: z.string().nullable(),
      amount_num: z.number().nullable(),
      unit: z.string().nullable(),
      unit_code: z.string().nullable(),
      optional: z.boolean()
    }).strict()),
    instructions: z.array(z.string())
  }).strict()),
  translation: z.object({
    locale: recipeLangSchema,
    title: z.string(),
    description: z.string().nullable(),
    notes: z.string().nullable(),
    tags: z.array(z.string()),
    content: z.object({ sections: z.array(z.unknown()) }).passthrough()
  }).strict().nullable()
}).strict()

export type GrantRecipeInput = z.infer<typeof grantRecipeInputSchema>
export type ReshareRecipeInput = z.infer<typeof reshareRecipeInputSchema>
export type SharedRecipe = z.infer<typeof sharedRecipeSchema>
