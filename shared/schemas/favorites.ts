import { z } from 'zod'
import { uuidSchema } from './common'

/** Schémas d'écriture des favoris. */

/** `POST /api/favorites` */
export const favoriteInputSchema = z.object({
  recipeId: uuidSchema
})

/** `DELETE /api/favorites?recipeId=` (ou `?id=` du favori). */
export const favoriteDeleteQuerySchema = z.object({
  id: uuidSchema.optional(),
  recipeId: uuidSchema.optional()
}).refine(
  value => Boolean(value.id) || Boolean(value.recipeId),
  { message: 'identifiant du favori ou de la recette requis', path: ['recipeId'] }
)

export type FavoriteInput = z.infer<typeof favoriteInputSchema>
export type FavoriteDeleteQuery = z.infer<typeof favoriteDeleteQuerySchema>
