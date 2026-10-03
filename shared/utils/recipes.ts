import type {
  Ingredient,
  Instruction,
  InstructionRow,
  Recipe,
  RecipeIngredientRow,
  RecipeSection,
  RecipeSectionRow,
  RecipeSummary,
  SectionType
} from '#shared/types'

/**
 * Conversion snake_case (base) → camelCase (application), faite une seule
 * fois à la sortie de Supabase. Toutes les lectures (liste, fiche, favoris,
 * planning) passent par ici : pas de mapping dupliqué dans les composants.
 */

/** Colonnes de `recipes` utiles aux listes (sans les JSONB historiques ni `search`). */
export const RECIPE_SUMMARY_COLUMNS
  = 'id, title, description, category, prep_time, cook_time, servings, image, photo_path, tags, notes, created_at, updated_at'

/** Sous-ensemble d'une ligne `recipes` suffisant pour `toRecipeSummary` (RPC `search_recipes` incluse). */
export interface RecipeSummaryRow {
  id: string
  title: string
  description: string | null
  category: string
  prep_time: number | null
  cook_time: number | null
  servings: number | null
  image: string | null
  photo_path?: string | null
  tags: string[] | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export type RecipeSectionWithChildrenRow = RecipeSectionRow & {
  recipe_ingredients: RecipeIngredientRow[] | null
  instructions: InstructionRow[] | null
}

export type RecipeWithSectionsRow = RecipeSummaryRow & {
  recipe_sections: RecipeSectionWithChildrenRow[] | null
}

const CATEGORY_IMAGES: Record<string, string> = {
  'soupes': '/images/soupes.png',
  'entrees': '/images/entrees,salades,pains,accompagnements.png',
  'plats': '/images/plats.png',
  'poissons': '/images/poissons.png',
  'viandes': '/images/viandes.png',
  'yaourts et fromages': '/images/yaourts&fromages.png',
  'desserts et gâteaux': '/images/desserts.png',
  'boissons': '/images/boissons.png',
  'confitures': '/images/confitures.png'
}

/** Image d'illustration par catégorie (repli : plats). */
export function categoryImage(category: string | null | undefined): string {
  return (category && CATEGORY_IMAGES[category]) || '/images/plats.png'
}

const byOrderIndex = <T extends { orderIndex: number }>(a: T, b: T) => a.orderIndex - b.orderIndex

function toSectionType(value: string): SectionType {
  return value === 'ingredients' || value === 'instructions' ? value : 'mixed'
}

export function toIngredient(row: RecipeIngredientRow): Ingredient {
  return {
    id: row.id,
    sectionId: row.section_id ?? '',
    name: row.name,
    amount: row.amount,
    amountNum: row.amount_num,
    unit: row.unit,
    unitCode: row.unit_code,
    optional: row.optional ?? false,
    orderIndex: row.order_index ?? 0
  }
}

export function toInstruction(row: InstructionRow): Instruction {
  return {
    id: row.id,
    sectionId: row.section_id ?? '',
    content: row.content,
    orderIndex: row.order_index ?? 0
  }
}

export function toRecipeSection(row: RecipeSectionWithChildrenRow): RecipeSection {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    name: row.name,
    type: toSectionType(row.type),
    orderIndex: row.order_index ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ingredients: (row.recipe_ingredients ?? []).map(toIngredient).sort(byOrderIndex),
    instructions: (row.instructions ?? []).map(toInstruction).sort(byOrderIndex)
  }
}

export function toRecipeSummary(row: RecipeSummaryRow): RecipeSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    category: row.category,
    prepTime: row.prep_time,
    cookTime: row.cook_time,
    servings: row.servings,
    image: row.image || categoryImage(row.category),
    photoPath: row.photo_path ?? null,
    tags: row.tags ?? [],
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function toRecipe(row: RecipeWithSectionsRow): Recipe {
  return {
    ...toRecipeSummary(row),
    sections: (row.recipe_sections ?? []).map(toRecipeSection).sort(byOrderIndex)
  }
}

/** Fractions usuelles en cuisine, affichées telles quelles plutôt qu'en décimal. */
const FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾']
]

/**
 * Formate une quantité pour l'affichage : `amountNum` (fraction simple si
 * possible, sinon nombre court) avec repli sur le texte saisi `amount`.
 */
export function formatAmount(amountNum: number | null | undefined, amount: string | null | undefined): string {
  if (amountNum === null || amountNum === undefined || !Number.isFinite(amountNum)) {
    return amount?.trim() ?? ''
  }
  const whole = Math.floor(amountNum)
  const rest = amountNum - whole
  if (rest === 0) return String(whole)
  const fraction = FRACTIONS.find(([value]) => Math.abs(value - rest) < 0.01)
  if (fraction) {
    return whole > 0 ? `${whole} ${fraction[1]}` : fraction[1]
  }
  return amountNum.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

/** « 1 ½ cuillère à soupe farine », « sel » … (unité en texte libre pour l'instant). */
export function formatIngredient(ingredient: Pick<Ingredient, 'name' | 'amount' | 'amountNum' | 'unit'>): string {
  return [formatAmount(ingredient.amountNum, ingredient.amount), ingredient.unit?.trim(), ingredient.name.trim()]
    .filter((part): part is string => Boolean(part))
    .join(' ')
}

/** Sections ayant au moins un ingrédient (déjà triées par `orderIndex`). */
export function sectionsWithIngredients(sections: readonly RecipeSection[]): RecipeSection[] {
  return sections.filter(section => section.ingredients.length > 0)
}

/** Sections ayant au moins une instruction (déjà triées par `orderIndex`). */
export function sectionsWithInstructions(sections: readonly RecipeSection[]): RecipeSection[] {
  return sections.filter(section => section.instructions.length > 0)
}

/** Durée totale (préparation + cuisson) ou `null` si rien n'est renseigné. */
export function totalTime(recipe: Pick<RecipeSummary, 'prepTime' | 'cookTime'>): number | null {
  const total = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0)
  return total > 0 ? total : null
}

// ---------------------------------------------------------------------------
// Mise à l'échelle des quantités (ajustement des portions)
// ---------------------------------------------------------------------------

/** Pas d'arrondi « lisibles » pour les petites quantités : quarts et tiers. */
const READABLE_STEPS: readonly number[] = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1]

/**
 * Facteur d'échelle entre les portions de la recette et les portions voulues.
 * `1` si l'une des deux valeurs est absente ou nulle (pas de mise à l'échelle).
 */
export function servingsFactor(baseServings: number | null | undefined, targetServings: number | null | undefined): number {
  if (!baseServings || !targetServings || baseServings <= 0 || targetServings <= 0) return 1
  return targetServings / baseServings
}

/**
 * Arrondi lisible en cuisine :
 * - < 10 : au quart ou au tiers le plus proche (½, ¼, ¾, ⅓, ⅔) ; une valeur
 *   qui tomberait à 0 garde une décimale (0,1) pour ne pas disparaître ;
 * - 10 à 100 : une décimale ;
 * - ≥ 100 : entier.
 */
export function roundReadable(value: number): number {
  if (!Number.isFinite(value)) return value
  if (value < 0) return -roundReadable(-value)
  if (value >= 100) return Math.round(value)
  if (value >= 10) return Math.round(value * 10) / 10
  const whole = Math.floor(value)
  const rest = value - whole
  let best = READABLE_STEPS[0] ?? 0
  for (const step of READABLE_STEPS) {
    if (Math.abs(step - rest) < Math.abs(best - rest)) best = step
  }
  const rounded = whole + best
  if (rounded === 0 && value > 0) return Math.max(0.1, Math.round(value * 10) / 10)
  return rounded
}

/** Quantité numérique mise à l'échelle et arrondie, `null` si non interprétable. */
export function scaleAmount(amountNum: number | null | undefined, factor: number): number | null {
  if (amountNum === null || amountNum === undefined || !Number.isFinite(amountNum)) return null
  if (factor === 1) return amountNum
  return roundReadable(amountNum * factor)
}

/**
 * Quantité affichée après mise à l'échelle : fractions pour les petites
 * quantités (« 1 ½ »), une décimale au-delà (« 12,5 »), entier au-delà de 100.
 * Sans valeur numérique, le texte saisi est rendu tel quel (il ne peut pas
 * être mis à l'échelle : « une pincée », « 2 à 3 »).
 */
export function formatScaledAmount(
  amountNum: number | null | undefined,
  amount: string | null | undefined,
  factor: number
): string {
  const scaled = scaleAmount(amountNum, factor)
  if (scaled === null) return amount?.trim() ?? ''
  if (scaled >= 10) {
    return scaled.toLocaleString('fr-FR', { maximumFractionDigits: scaled >= 100 ? 0 : 1 })
  }
  return formatAmount(scaled, null)
}

/** Une étape « à plat » pour le mode cuisine : section d'origine + numéro global. */
export interface FlatStep {
  id: string
  sectionId: string
  sectionName: string
  content: string
  /** Position dans la section (1-based). */
  stepNumber: number
  /** Nombre d'étapes de la section. */
  stepCount: number
}

/** Aplatit les instructions de toutes les sections, dans l'ordre d'affichage. */
export function flattenSteps(sections: readonly RecipeSection[]): FlatStep[] {
  return sectionsWithInstructions(sections).flatMap(section =>
    section.instructions.map((instruction, index) => ({
      id: instruction.id,
      sectionId: section.id,
      sectionName: section.name,
      content: instruction.content,
      stepNumber: index + 1,
      stepCount: section.instructions.length
    }))
  )
}

/** Clé i18n du nom d'une catégorie (`categories.<clé>.name`) : accents retirés, espaces → `_`. */
export function categoryI18nKey(category: string | null | undefined): string {
  const slug = (category ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
  return `categories.${slug}.name`
}
