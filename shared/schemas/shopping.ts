import { z } from 'zod'
import { amountSchema, optionalText, requiredText, uuidSchema } from './common'

/** Schémas d'écriture des listes de courses. */

/** `POST /api/shopping-items` — ajout (avec fusion) d'un article. */
export const shoppingItemInputSchema = z.object({
  listId: uuidSchema,
  name: requiredText(200),
  amount: amountSchema,
  unit: optionalText(50),
  recipeId: uuidSchema.nullish()
})

/** `PUT /api/shopping-items/:id` — au moins un champ à modifier. */
export const shoppingItemUpdateSchema = z.object({
  name: requiredText(200).optional(),
  amount: amountSchema,
  unit: optionalText(50),
  isChecked: z.boolean({ invalid_type_error: 'doit être vrai ou faux' }).optional()
}).refine(
  value => value.name !== undefined || value.amount !== undefined || value.unit !== undefined || value.isChecked !== undefined,
  { message: 'aucune modification fournie' }
)

/** `POST /api/shopping-lists/:id/recipes` — ajout des ingrédients d'une recette. */
export const addRecipeToListSchema = z.object({
  recipeId: uuidSchema,
  sectionIds: z.array(uuidSchema).min(1, 'au moins une section').nullish(),
  servingsFactor: z.number({ invalid_type_error: 'doit être un nombre' })
    .positive('doit être strictement positif')
    .max(100, 'trop grand (max 100)')
    .optional()
})

/** `POST /api/shopping-lists` et `PUT /api/shopping-lists/:id`. */
export const shoppingListInputSchema = z.object({
  name: requiredText(200)
})

export const idParamsSchema = z.object({ id: uuidSchema })

export type ShoppingItemInput = z.infer<typeof shoppingItemInputSchema>
export type ShoppingItemUpdate = z.infer<typeof shoppingItemUpdateSchema>
export type AddRecipeToListInput = z.infer<typeof addRecipeToListSchema>
export type ShoppingListInput = z.infer<typeof shoppingListInputSchema>
