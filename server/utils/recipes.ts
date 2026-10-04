import type { SupabaseClient } from '@supabase/supabase-js'
import { createError } from 'h3'
import { throwSupabaseError } from './errors'

/**
 * Lecture d'une recette après écriture (`save_recipe`) : ligne `recipes`
 * + `sections[]` avec ingrédients (`unitCode`, `amountNum`) et
 * instructions, en camelCase.
 *
 * La forme `RecipeDetail` est celle attendue par le front (type `Recipe`
 * de la lecture : `recipes` + `sections`).
 */

export interface RecipeIngredientDetail {
  id: string
  sectionId: string | null
  name: string
  amount: string | null
  amountNum: number | null
  unit: string | null
  unitCode: string | null
  optional: boolean
  orderIndex: number
}

export interface RecipeInstructionDetail {
  id: string
  sectionId: string | null
  content: string
  orderIndex: number
}

export interface RecipeSectionDetail {
  id: string
  recipeId: string
  name: string
  type: 'ingredients' | 'instructions' | 'mixed'
  orderIndex: number
  ingredients: RecipeIngredientDetail[]
  instructions: RecipeInstructionDetail[]
  createdAt: string | null
  updatedAt: string | null
}

export interface RecipeDetail {
  id: string
  title: string
  description: string
  category: string
  prepTime: number | null
  cookTime: number | null
  servings: number | null
  image: string | null
  photoPath: string | null
  tags: string[]
  notes: string
  sections: RecipeSectionDetail[]
  createdAt: string | null
  updatedAt: string | null
}

interface IngredientRow {
  id: string
  section_id: string | null
  name: string
  amount: string | null
  amount_num: number | string | null
  unit: string | null
  unit_code: string | null
  optional: boolean | null
  order_index: number
}

interface InstructionRow {
  id: string
  section_id: string | null
  content: string
  order_index: number
}

interface SectionRow {
  id: string
  recipe_id: string
  name: string
  type: string
  order_index: number
  created_at: string | null
  updated_at: string | null
  recipe_ingredients: IngredientRow[] | null
  instructions: InstructionRow[] | null
}

interface RecipeRow {
  id: string
  title: string
  description: string | null
  category: string
  prep_time: number | null
  cook_time: number | null
  servings: number | null
  image: string | null
  photo_path: string | null
  tags: string[] | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  recipe_sections: SectionRow[] | null
}

export const RECIPE_DETAIL_SELECT
  = 'id, title, description, category, prep_time, cook_time, servings, image, photo_path, tags, notes, created_at, updated_at, '
    + 'recipe_sections(id, recipe_id, name, type, order_index, created_at, updated_at, '
    + 'recipe_ingredients(id, section_id, name, amount, amount_num, unit, unit_code, optional, order_index), '
    + 'instructions(id, section_id, content, order_index))'

const byOrder = <T extends { order_index: number }>(a: T, b: T) => a.order_index - b.order_index

function toNumberOrNull(value: number | string | null): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function toSectionType(value: string): RecipeSectionDetail['type'] {
  return value === 'ingredients' || value === 'instructions' ? value : 'mixed'
}

export function mapRecipeRow(row: RecipeRow): RecipeDetail {
  const sections = [...(row.recipe_sections ?? [])].sort(byOrder).map<RecipeSectionDetail>(section => ({
    id: section.id,
    recipeId: section.recipe_id,
    name: section.name,
    type: toSectionType(section.type),
    orderIndex: section.order_index,
    createdAt: section.created_at,
    updatedAt: section.updated_at,
    ingredients: [...(section.recipe_ingredients ?? [])].sort(byOrder).map<RecipeIngredientDetail>(ingredient => ({
      id: ingredient.id,
      sectionId: ingredient.section_id,
      name: ingredient.name,
      amount: ingredient.amount,
      amountNum: toNumberOrNull(ingredient.amount_num),
      unit: ingredient.unit,
      unitCode: ingredient.unit_code,
      optional: ingredient.optional ?? false,
      orderIndex: ingredient.order_index
    })),
    instructions: [...(section.instructions ?? [])].sort(byOrder).map<RecipeInstructionDetail>(instruction => ({
      id: instruction.id,
      sectionId: instruction.section_id,
      content: instruction.content,
      orderIndex: instruction.order_index
    }))
  }))

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    category: row.category,
    prepTime: row.prep_time,
    cookTime: row.cook_time,
    servings: row.servings,
    image: row.image,
    photoPath: row.photo_path,
    tags: row.tags ?? [],
    notes: row.notes ?? '',
    sections,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * Charge une recette complète par id (sous RLS du client fourni).
 * Lève 404 si elle n'existe pas, 500 générique (journalisé) en cas d'erreur.
 */
export async function fetchRecipeDetail(supabase: SupabaseClient, recipeId: string): Promise<RecipeDetail> {
  const { data, error } = await supabase
    .from('recipes')
    .select(RECIPE_DETAIL_SELECT)
    .eq('id', recipeId)
    .maybeSingle()

  if (error) {
    throwSupabaseError(error, `fetchRecipeDetail(${recipeId})`)
  }
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Recette introuvable' })
  }
  return mapRecipeRow(data as unknown as RecipeRow)
}
