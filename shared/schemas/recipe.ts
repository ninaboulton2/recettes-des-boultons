import { z } from 'zod'
import { unitCodeSchema, type UnitCode } from './units'
import {
  amountSchema,
  amountToText,
  nullableNonNegativeInt,
  optionalText,
  orderIndexSchema,
  requiredText,
  textOrNull,
  uuidSchema
} from './common'

/**
 * Schémas d'écriture d'une recette.
 *
 * Forme = ce que `RecipeEditor.vue` envoie aujourd'hui (camelCase) :
 * `prepTime`/`cookTime`/`servings` nullables, `sections[]` avec
 * `ingredients[]` (`amount` nombre OU texte) et `instructions[]` (objets
 * `{ content, orderIndex }` ou simples chaînes). Les clés inconnues
 * (`id`, `createdAt`, `favorite`, …) sont ignorées.
 */

export const SECTION_TYPES = ['ingredients', 'instructions', 'mixed'] as const
export const sectionTypeSchema = z.enum(SECTION_TYPES, {
  errorMap: () => ({ message: 'doit être ingredients, instructions ou mixed' })
})

export const recipeIngredientInputSchema = z.object({
  name: requiredText(200),
  amount: amountSchema,
  unit: optionalText(50),
  unitCode: unitCodeSchema.nullish(),
  optional: z.boolean({ invalid_type_error: 'doit être vrai ou faux' }).nullish(),
  orderIndex: orderIndexSchema
})

export const recipeInstructionInputSchema = z.union([
  z.object({
    content: z.string({ required_error: 'requis', invalid_type_error: 'doit être du texte' })
      .max(5000, 'trop long (max 5000 caractères)'),
    orderIndex: orderIndexSchema
  }),
  z.string().max(5000, 'trop long (max 5000 caractères)')
], { errorMap: () => ({ message: 'doit être une étape ({ content }) ou du texte' }) })

export const recipeSectionInputSchema = z.object({
  name: optionalText(200),
  type: sectionTypeSchema.nullish(),
  orderIndex: orderIndexSchema,
  ingredients: z.array(recipeIngredientInputSchema).nullish(),
  instructions: z.array(recipeInstructionInputSchema).nullish()
})

export const recipeInputSchema = z.object({
  title: requiredText(200),
  category: requiredText(100),
  description: optionalText(2000),
  notes: optionalText(5000),
  prepTime: nullableNonNegativeInt.optional(),
  cookTime: nullableNonNegativeInt.optional(),
  servings: nullableNonNegativeInt.optional(),
  image: optionalText(500),
  /** Chemin dans le bucket storage `recipe-photos` (0010) ; `null` retire la photo. */
  photoPath: optionalText(500),
  tags: z.array(z.string().trim().min(1, 'tag vide').max(50, 'trop long (max 50 caractères)')).nullish(),
  sections: z.array(recipeSectionInputSchema).max(50, 'trop de sections (max 50)').nullish()
})

/** Corps attendu par `POST /api/add-recipe`. */
export const addRecipeBodySchema = z.object({ recipe: recipeInputSchema })
/** Corps attendu par `PUT /api/update-recipe?id=`. */
export const updateRecipeBodySchema = z.object({ updates: recipeInputSchema })
export const recipeIdQuerySchema = z.object({ id: uuidSchema })

export type RecipeInput = z.infer<typeof recipeInputSchema>
export type RecipeSectionInput = z.infer<typeof recipeSectionInputSchema>
export type RecipeIngredientInput = z.infer<typeof recipeIngredientInputSchema>
export type RecipeInstructionInput = z.infer<typeof recipeInstructionInputSchema>
export type SectionType = z.infer<typeof sectionTypeSchema>

/** Payload (snake_case) de la RPC `save_recipe(payload jsonb)` — voir 0006_save_recipe.sql et 0011 (`photo_path`). */
export interface SaveRecipePayload {
  id?: string
  title: string
  category: string
  description: string | null
  notes: string | null
  prep_time: number | null
  cook_time: number | null
  servings: number | null
  image: string | null
  photo_path: string | null
  tags: string[]
  sections: Array<{
    name: string
    type: SectionType
    order_index: number
    ingredients: Array<{
      name: string
      amount: string | null
      unit: string | null
      unit_code: UnitCode | null
      optional: boolean
      order_index: number
    }>
    instructions: Array<{ content: string, order_index: number }>
  }>
}

/**
 * Convertit l'entrée validée (camelCase, forme de l'éditeur) en payload
 * `save_recipe`. `amount` part en texte : `parse_amount` (SQL) calcule
 * `amount_num` ; `unit_code` n'est transmis que s'il est connu, sinon
 * `normalize_unit(unit)` s'en charge côté base.
 */
export function toSaveRecipePayload(input: RecipeInput, id?: string): SaveRecipePayload {
  const sections = (input.sections ?? []).map((section, sectionIndex) => ({
    name: section.name?.trim() ?? '',
    type: section.type ?? 'mixed',
    order_index: section.orderIndex ?? sectionIndex,
    ingredients: (section.ingredients ?? []).map((ingredient, ingredientIndex) => ({
      name: ingredient.name,
      amount: amountToText(ingredient.amount),
      unit: textOrNull(ingredient.unit),
      unit_code: ingredient.unitCode ?? null,
      optional: ingredient.optional ?? false,
      order_index: ingredient.orderIndex ?? ingredientIndex
    })),
    instructions: (section.instructions ?? [])
      .map((instruction, instructionIndex) => typeof instruction === 'string'
        ? { content: instruction.trim(), order_index: instructionIndex }
        : { content: instruction.content.trim(), order_index: instruction.orderIndex ?? instructionIndex })
      .filter(instruction => instruction.content !== '')
  }))

  return {
    ...(id ? { id } : {}),
    title: input.title,
    category: input.category,
    description: input.description ?? null,
    notes: input.notes ?? null,
    prep_time: input.prepTime ?? null,
    cook_time: input.cookTime ?? null,
    servings: input.servings ?? null,
    image: textOrNull(input.image),
    photo_path: textOrNull(input.photoPath),
    tags: input.tags ?? [],
    sections
  }
}
