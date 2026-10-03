import { toValue, type MaybeRefOrGetter } from 'vue'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '#shared/types/database'
import type { Recipe } from '#shared/types'
import { toRecipe } from '#shared/utils/recipes'

/**
 * Charge une recette complète (ligne `recipes` + sections imbriquées avec
 * ingrédients et instructions) en une seule requête PostgREST, triée par
 * `order_index`. `null` si la recette n'existe pas.
 */
export async function fetchRecipeById(supabase: SupabaseClient<Database>, id: string): Promise<Recipe | null> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, description, category, prep_time, cook_time, servings, image, photo_path, tags, notes, created_at, updated_at, recipe_sections(*, recipe_ingredients(*), instructions(*))')
    .eq('id', id)
    .order('order_index', { referencedTable: 'recipe_sections' })
    .maybeSingle()

  if (error) throw error
  return data ? toRecipe(data) : null
}

/**
 * Fiche recette avec `useAsyncData` (SSR). Rechargée si l'identifiant change
 * ou après une écriture (`useRecipesStore().refresh()`).
 */
export function useRecipe(id: MaybeRefOrGetter<string>) {
  const supabase = useSupabaseClient<Database>()
  const recipesStore = useRecipesStore()

  return useAsyncData<Recipe | null>(
    () => `recipe:${toValue(id)}`,
    () => fetchRecipeById(supabase, toValue(id)),
    {
      default: () => null,
      watch: [() => toValue(id), () => recipesStore.revision]
    }
  )
}
