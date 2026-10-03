import type { Tables } from './database'

/**
 * Modèle de lecture de l'application (camelCase).
 *
 * Les lignes brutes de la base (snake_case) viennent de `./database.ts`
 * (généré) et sont converties une seule fois par `#shared/utils/recipes`.
 * Les champs JSONB historiques (`recipes.ingredients` / `recipes.instructions`)
 * ne font plus partie du modèle : depuis la migration 0005, toutes les
 * recettes sont décrites par leurs sections.
 */

export type RecipeRow = Tables<'recipes'>
export type RecipeSectionRow = Tables<'recipe_sections'>
export type RecipeIngredientRow = Tables<'recipe_ingredients'>
export type InstructionRow = Tables<'instructions'>

export type RecipeCategory =
  | 'soupes'
  | 'entrees'
  | 'plats'
  | 'poissons'
  | 'viandes'
  | 'yaourts et fromages'
  | 'desserts et gâteaux'
  | 'boissons'
  | 'confitures'

export const RECIPE_CATEGORIES: readonly RecipeCategory[] = [
  'soupes',
  'entrees',
  'plats',
  'poissons',
  'viandes',
  'yaourts et fromages',
  'desserts et gâteaux',
  'boissons',
  'confitures'
] as const

export type SectionType = 'ingredients' | 'instructions' | 'mixed'

export interface Ingredient {
  id: string
  sectionId: string
  name: string
  /** Quantité saisie (texte libre : « 1/2 », « 2 à 3 », « une pincée »…). */
  amount: string | null
  /** Quantité numérique dérivée en base (`parse_amount`), `null` si non interprétable. */
  amountNum: number | null
  /** Unité saisie (texte libre). */
  unit: string | null
  /** Code canonique dérivé en base (`normalize_unit`), `null` si inconnu. */
  unitCode: string | null
  optional: boolean
  orderIndex: number
}

export interface Instruction {
  id: string
  sectionId: string
  content: string
  orderIndex: number
}

export interface Section {
  id: string
  recipeId: string
  name: string
  type: SectionType
  orderIndex: number
  createdAt: string | null
  updatedAt: string | null
}

export type RecipeSection = Section & {
  ingredients: Ingredient[]
  instructions: Instruction[]
}

/** Ligne `recipes` sans ses sections (listes, favoris, planning). */
export interface RecipeSummary {
  id: string
  title: string
  description: string
  category: RecipeCategory | string
  prepTime: number | null
  cookTime: number | null
  servings: number | null
  /** Chemin dans le bucket storage `recipe-photos`, `null` si aucune photo. */
  photoPath: string | null
  tags: string[]
  notes: string
  createdAt: string | null
  updatedAt: string | null
}

/** Recette complète : ligne `recipes` + sections (ingrédients, instructions). */
export interface Recipe extends RecipeSummary {
  sections: RecipeSection[]
}

/**
 * Charge utile d'écriture (création / mise à jour d'une recette) : un seul
 * type, déduit du schéma Zod `recipeInputSchema` (`#shared/schemas/recipe`),
 * partagé par l'éditeur, le traducteur, le store et les endpoints.
 */
export type {
  RecipeInput,
  RecipeSectionInput,
  RecipeIngredientInput,
  RecipeInstructionInput
} from '../schemas/recipe'

/** Résultat paginé de la RPC `search_recipes`. */
export interface RecipeSearchPage {
  recipes: RecipeSummary[]
  totalCount: number
}

export interface Favorite {
  id: string
  recipeId: string
  userId: string
  createdAt: string | null
  updatedAt: string | null
  recipe: RecipeSummary | null
}

export type MealType = 'lunch' | 'dinner'

export interface PlanningMeal {
  id: string
  dateString: string
  mealType: MealType
  recipeId: string | null
  customTitle: string | null
  userId: string
  createdAt: string | null
  updatedAt: string | null
  /** Recette liée, ou recette « factice » pour un repas personnalisé. */
  recipe: RecipeSummary | null
}

export interface DayMeals {
  lunch: PlanningMeal[]
  dinner: PlanningMeal[]
  notes?: string | null
  lunchGroupNote?: string | null
  dinnerGroupNote?: string | null
}

export type WeekPlanning = Record<string, DayMeals>

export interface ShoppingItem {
  id: string
  listId: string
  name: string
  /** Texte libre en base (`shopping_items.amount`) ; nombre côté interface. */
  amount: string | number | null
  amountNum: number | null
  unit: string | null
  unitCode: string | null
  note?: string
  checked: boolean
  recipeId: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface ShoppingList {
  id: string
  name: string
  userId: string
  items: ShoppingItem[]
  createdAt: string | null
  updatedAt: string | null
}

export type UserRole = 'admin' | 'user'

export interface Profile {
  id: string
  email: string
  name?: string
  role: UserRole
  language?: 'fr' | 'en'
  theme?: 'light' | 'dark'
  notifications?: boolean
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string
  name?: string
  role: UserRole
  language?: 'fr' | 'en'
  theme?: 'light' | 'dark'
  notifications?: boolean
  createdAt: string
  updatedAt?: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface SignUpCredentials {
  email: string
  name: string
  password: string
}
