import { z } from 'zod'
import { RECIPE_CATEGORIES, type RecipeCategory, type RecipeLang } from '../types'
import { SECTION_TYPES, type RecipeInput } from './recipe'
import { UNIT_CODES, type UnitCode } from './units'
import { aiTranslationSchema, recipeLangSchema, type AiTranslation } from './translation'
import { translationShapeProblem, type RecipeTexts, type TranslationDraft } from '../utils/translation'

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
 *  - `aiRecipeToBilingual` : conversion vers `RecipeInput` (forme de
 *    l'éditeur, validée ensuite par `recipeInputSchema`) ET vers la
 *    traduction alignée (`TranslationDraft`), avec la langue détectée.
 *
 * Recettes bilingues (0016) : le modèle détecte la langue du texte (`sourceLanguage`,
 * fr ou en), rédige la recette dans cette langue (fidèlement, sans traduire) et
 * fournit dans `translation` la même recette dans l'AUTRE langue, avec la même
 * structure (mêmes sections, ingrédients et étapes, dans le même ordre). Il n'y
 * a plus de langue cible à choisir.
 */

export const translateRecipeBodySchema = z.object({
  recipeText: z.string({ required_error: 'requis', invalid_type_error: 'doit être du texte' })
    .trim()
    .min(20, 'trop court (min 20 caractères)')
    .max(20000, 'trop long (max 20000 caractères)')
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
  sections: z.array(aiSectionSchema),
  sourceLanguage: recipeLangSchema.describe('Langue du texte d\'origine, dans laquelle les champs ci-dessus sont rédigés : fr ou en'),
  translation: aiTranslationSchema
    .describe('La même recette traduite dans l\'autre langue (en si sourceLanguage = fr, fr sinon), même structure')
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
  /** Prêt pour `POST /api/add-recipe` (déjà validé par `recipeInputSchema`), dans la langue d'origine. */
  recipe: RecipeInput
  /** Langue d'origine détectée (`recipe` est rédigée dans cette langue). */
  lang: RecipeLang
  /** La recette dans l'autre langue, alignée sur `recipe` ; à renvoyer à `POST /api/add-recipe`. */
  translation: TranslationDraft
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

/** La réponse du modèle n'a pas la structure demandée (sections, ingrédients, étapes à aligner). */
export class TranslationShapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranslationShapeError'
  }
}

/** Positions conservées d'une recette de l'IA : sections, ingrédients et étapes non vides. */
interface KeptSection { section: number, ingredients: number[], steps: number[] }

function keptPositions(recipe: AiRecipe): KeptSection[] {
  return recipe.sections
    .map((section, sectionIndex) => ({
      section: sectionIndex,
      ingredients: section.ingredients.flatMap((ingredient, i) => (ingredient.name.trim() !== '' ? [i] : [])),
      steps: section.instructions.flatMap((step, i) => (step.trim() !== '' ? [i] : []))
    }))
    .filter(kept => kept.ingredients.length > 0 || kept.steps.length > 0)
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
  const sections = keptPositions(recipe).map((kept, index) => {
    const section = recipe.sections[kept.section]!
    return {
      name: section.name.trim(),
      type: section.type,
      orderIndex: index,
      ingredients: kept.ingredients.map((position, ingredientIndex) => {
        const ingredient = section.ingredients[position]!
        return {
          name: ingredient.name.trim(),
          amount: ingredient.amount,
          unit: ingredient.unit ? unitLabel(ingredient.unit) : trimOrNull(ingredient.unitText),
          unitCode: ingredient.unit,
          optional: ingredient.optional,
          orderIndex: ingredientIndex
        }
      }),
      instructions: kept.steps.map((position, instructionIndex) => ({
        content: section.instructions[position]!.trim(),
        orderIndex: instructionIndex
      }))
    }
  })

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

/** Recette de l'IA convertie dans les deux langues. */
export interface BilingualRecipe {
  /** Dans la langue d'origine (`lang`). */
  recipe: RecipeInput
  lang: RecipeLang
  /** Vers l'autre langue, alignée position par position sur `recipe`. */
  translation: TranslationDraft
}

/**
 * Convertit la sortie du modèle (`AiRecipe`) en recette + traduction ALIGNÉES :
 * les mêmes sections, ingrédients et étapes sont écartés des deux côtés (vides),
 * donc la traduction correspond position par position à la recette enregistrée.
 * Lève `TranslationShapeError` si le modèle n'a pas respecté la structure
 * (nombre de sections, d'ingrédients ou d'étapes différent).
 */
export function aiRecipeToBilingual(recipe: AiRecipe, unitLabel: UnitLabelResolver = code => code): BilingualRecipe {
  const input = aiRecipeToRecipeInput(recipe, unitLabel)
  const translated: AiTranslation = recipe.translation

  if (translated.sections.length !== recipe.sections.length) {
    throw new TranslationShapeError(`${translated.sections.length} section(s) traduite(s) pour ${recipe.sections.length}`)
  }
  const sections = keptPositions(recipe).map((kept) => {
    const source = recipe.sections[kept.section]!
    const target = translated.sections[kept.section]!
    if (target.ingredients.length !== source.ingredients.length || target.instructions.length !== source.instructions.length) {
      throw new TranslationShapeError(`section ${kept.section + 1} : ingrédients ou étapes non alignés`)
    }
    return {
      name: target.name.trim(),
      ingredients: kept.ingredients.map((position) => {
        const item = target.ingredients[position]!
        const original = source.ingredients[position]!
        return {
          name: item.name.trim(),
          // Quantité numérique de l'IA : rien à traduire. Unité libre : traduite.
          amount: null,
          unit: original.unit ? null : trimOrNull(item.unit)
        }
      }),
      instructions: kept.steps.map(position => target.instructions[position]!.trim())
    }
  })

  const draft: TranslationDraft = {
    title: translated.title.trim(),
    description: input.description ? trimOrNull(translated.description) : null,
    notes: input.notes ? trimOrNull(translated.notes) : null,
    tags: translated.tags.map(tag => tag.trim().toLowerCase()).filter(tag => tag !== ''),
    content: { sections }
  }
  // Étiquettes : mêmes positions que `input.tags` (dédoublonnées, comme la recette).
  if (draft.tags.length !== input.tags?.length) draft.tags = []

  return { recipe: input, lang: recipe.sourceLanguage, translation: draft }
}

/** Vérifie qu'une traduction (IA ou client) correspond aux textes de la recette ; lève sinon. */
export function assertTranslationShape(texts: RecipeTexts, draft: TranslationDraft): void {
  const problem = translationShapeProblem(texts, draft)
  if (problem) throw new TranslationShapeError(problem)
}
