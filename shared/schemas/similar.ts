import { z } from 'zod'
import { requiredText, uuidSchema } from './common'
import type { SimilarRecipe } from '../utils/similarRecipes'

/**
 * Détection de recettes en double (`POST /api/recipes/similar`).
 * Le calcul lui-même est dans `shared/utils/similarRecipes.ts`.
 */

/** Corps de la requête : titre et noms d'ingrédients de la recette à comparer. */
export const similarRecipesBodySchema = z.object({
  title: requiredText(200),
  ingredientNames: z.array(z.string({ invalid_type_error: 'doit être du texte' }).trim().max(200, 'trop long (max 200 caractères)'))
    .max(200, 'trop d\'ingrédients (max 200)')
    .default([]),
  /** Recette à ignorer (ex. celle qu'on est en train de modifier). */
  excludeId: uuidSchema.optional()
})

export type SimilarRecipesBody = z.infer<typeof similarRecipesBodySchema>

/** Réponse : au plus 3 recettes, de la plus proche à la moins proche (tableau vide = rien de similaire). */
export interface SimilarRecipesResponse {
  similar: SimilarRecipe[]
}
