import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecipeFingerprint } from '#shared/utils/similarRecipes'
import { throwSupabaseError } from './errors'

/**
 * Charge l'« empreinte » de toutes les recettes (id, titre, noms d'ingrédients)
 * pour la détection de doublons (`shared/utils/similarRecipes.ts`).
 *
 * Deux lectures paginées (PostgREST plafonne à 1 000 lignes, voir DEVELOPER.md §
 * 18) plutôt que `search_recipes` : sa recherche plein texte exige TOUS les mots
 * de la requête et ne tolère ni faute de frappe ni mot en plus ; or c'est
 * justement ce qu'on cherche. À l'échelle d'un livre de recettes familial
 * (quelques centaines de recettes, quelques milliers d'ingrédients) la lecture
 * complète pèse quelques dizaines de Ko ; à surveiller si la base grossit.
 */

const PAGE_SIZE = 1000
/** Garde-fou contre une boucle infinie (50 000 lignes). */
const MAX_PAGES = 50

async function readAll<Row>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  orderBy: string,
  context: string
): Promise<Row[]> {
  const rows: Row[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy)
      .order('id')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error) throwSupabaseError(error, context)
    const batch = (data ?? []) as unknown as Row[]
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return rows
}

export async function loadRecipeFingerprints(supabase: SupabaseClient): Promise<RecipeFingerprint[]> {
  const [recipes, ingredients] = await Promise.all([
    readAll<{ id: string, title: string }>(supabase, 'recipes', 'id, title', 'id', 'recipes.similar read recipes'),
    readAll<{ id: string, recipe_id: string, name: string }>(
      supabase, 'recipe_ingredients', 'id, recipe_id, name', 'recipe_id', 'recipes.similar read ingredients'
    )
  ])

  const namesByRecipe = new Map<string, string[]>()
  for (const row of ingredients) {
    const names = namesByRecipe.get(row.recipe_id)
    if (names) names.push(row.name)
    else namesByRecipe.set(row.recipe_id, [row.name])
  }
  return recipes.map(recipe => ({ id: recipe.id, title: recipe.title, ingredientNames: namesByRecipe.get(recipe.id) ?? [] }))
}
