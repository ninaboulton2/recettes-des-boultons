import { z } from 'zod'
import { RECIPE_CATEGORIES, type RecipeCategory } from '../types'
import { SECTION_TYPES, type RecipeInput } from './recipe'
import { UNIT_CODES, type UnitCode } from './units'

/**
 * Schémas du traducteur IA (`POST /api/translate-recipe`).
 *
 *  - `translateRecipeBodySchema` : corps de la requête.
 *  - `aiRecipeSchema` : forme **imposée au modèle** (`generateObject`, AI SDK).
 *    Dérivée de `recipeInputSchema` mais volontairement plus stricte sur les
 *    types (quantité numérique, unité ∈ `UNIT_CODES`, catégorie ∈ 9 catégories)
 *    et sans contraintes de longueur : les fournisseurs à « sortie structurée »
 *    stricte (OpenAI) refusent les mots-clés `minLength`/`maxLength`/`optional`.
 *    Règle : aucun champ optionnel, tout ce qui peut manquer est `nullable`.
 *  - `aiRecipeToRecipeInput` : conversion vers `RecipeInput` (forme de
 *    l'éditeur, validée ensuite par `recipeInputSchema`).
 */

export const AI_TARGET_LANGUAGES = ['fr', 'en'] as const
export type AiTargetLanguage = (typeof AI_TARGET_LANGUAGES)[number]

export const translateRecipeBodySchema = z.object({
  recipeText: z.string({ required_error: 'requis', invalid_type_error: 'doit être du texte' })
    .trim()
    .min(20, 'trop court (min 20 caractères)')
    .max(20000, 'trop long (max 20000 caractères)'),
  targetLanguage: z.enum(AI_TARGET_LANGUAGES, { errorMap: () => ({ message: 'doit être fr ou en' }) }).default('fr')
})

export type TranslateRecipeBody = z.infer<typeof translateRecipeBodySchema>

// `RECIPE_CATEGORIES` est typé `readonly RecipeCategory[]` : z.enum exige un tuple.
export const aiCategorySchema = z.enum(RECIPE_CATEGORIES as readonly RecipeCategory[] as [RecipeCategory, ...RecipeCategory[]])
  .describe('Catégorie de la recette, parmi les 9 catégories de l\'application')

export const aiIngredientSchema = z.object({
  name: z.string().describe('Nom de l\'ingrédient, sans quantité ni unité'),
  amount: z.number().nullable()
    .describe('Quantité numérique (1/2 → 0.5), null si absente ou non chiffrable'),
  unit: z.enum(UNIT_CODES).nullable()
    .describe('Code d\'unité canonique, null si aucun code ne convient ou si l\'ingrédient n\'a pas d\'unité'),
  unitText: z.string().nullable()
    .describe('Unité telle qu\'écrite dans le texte quand aucun code ne convient (ex. « stick », « botte de 200 g »), sinon null'),
  optional: z.boolean().describe('true si l\'ingrédient est facultatif')
})

export const aiSectionSchema = z.object({
  name: z.string().describe('Titre de la sous-section (« Pour la pâte »…), chaîne vide s\'il n\'y en a pas'),
  type: z.enum(SECTION_TYPES).describe('ingredients, instructions ou mixed'),
  ingredients: z.array(aiIngredientSchema),
  instructions: z.array(z.string()).describe('Étapes, une chaîne par étape, dans l\'ordre')
})

export const aiRecipeSchema = z.object({
  title: z.string(),
  description: z.string().nullable().describe('Description courte si le texte en contient une, sinon null'),
  category: aiCategorySchema,
  prepTime: z.number().int().nullable().describe('Préparation en minutes, null si inconnue'),
  cookTime: z.number().int().nullable().describe('Cuisson en minutes, null si inconnue'),
  servings: z.number().int().nullable().describe('Nombre de portions, null si inconnu'),
  tags: z.array(z.string()).describe('Tags parmi : végétarien, vegan, sans gluten, rapide ; vide sinon'),
  notes: z.string().nullable().describe('Astuces, variantes, infos qui ne rentrent nulle part ailleurs ; null sinon'),
  sections: z.array(aiSectionSchema)
})

export type AiRecipe = z.infer<typeof aiRecipeSchema>
export type AiIngredient = z.infer<typeof aiIngredientSchema>

/** Consommation d'un appel, renvoyée au client (et journalisée dans `ai_usage`). */
export interface TranslateUsageInfo {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  /** USD, `null` si le modèle n'est pas dans la grille de prix. */
  estimatedCostUsd: number | null
  durationMs: number
}

/** Réponse de `POST /api/translate-recipe`. */
export interface TranslateRecipeResponse {
  success: true
  /** Prêt pour `POST /api/add-recipe` (déjà validé par `recipeInputSchema`). */
  recipe: RecipeInput
  aiRecipe: AiRecipe
  usage: TranslateUsageInfo
}

/** Résout un code d'unité vers son libellé canonique (`units.abbr`). */
export type UnitLabelResolver = (code: UnitCode) => string

const trimOrNull = (value: string | null): string | null => {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Convertit la recette produite par le modèle en `RecipeInput` (forme de
 * `RecipeEditor.vue`, acceptée par `POST /api/add-recipe`).
 *
 *  - `amount` reste un nombre (`amountSchema` l'accepte ; `save_recipe` le
 *    passe en texte puis `parse_amount` recalcule `amount_num`).
 *  - `unit` = libellé canonique du code (`abbr`) quand le code est connu,
 *    sinon la graphie d'origine (`unitText`) ; `unitCode` = le code.
 *  - Les sections vides et les étapes vides sont retirées ; les index d'ordre
 *    suivent la position.
 */
export function aiRecipeToRecipeInput(recipe: AiRecipe, unitLabel: UnitLabelResolver = code => code): RecipeInput {
  const sections = recipe.sections
    .map((section, sectionIndex) => {
      const ingredients = section.ingredients
        .filter(ingredient => ingredient.name.trim() !== '')
        .map((ingredient, ingredientIndex) => ({
          name: ingredient.name.trim(),
          amount: ingredient.amount,
          unit: ingredient.unit ? unitLabel(ingredient.unit) : trimOrNull(ingredient.unitText),
          unitCode: ingredient.unit,
          optional: ingredient.optional,
          orderIndex: ingredientIndex
        }))
      const instructions = section.instructions
        .map(step => step.trim())
        .filter(step => step !== '')
        .map((content, instructionIndex) => ({ content, orderIndex: instructionIndex }))
      return {
        name: section.name.trim(),
        type: section.type,
        orderIndex: sectionIndex,
        ingredients,
        instructions
      }
    })
    .filter(section => section.ingredients.length > 0 || section.instructions.length > 0)
    .map((section, index) => ({ ...section, orderIndex: index }))

  const tags = [...new Set(recipe.tags.map(tag => tag.trim().toLowerCase()).filter(tag => tag !== ''))]

  return {
    title: recipe.title.trim(),
    category: recipe.category,
    description: trimOrNull(recipe.description),
    notes: trimOrNull(recipe.notes),
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    servings: recipe.servings,
    tags,
    sections
  }
}
