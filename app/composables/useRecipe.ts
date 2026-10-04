import { toValue, type MaybeRefOrGetter } from 'vue'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '#shared/types/database'
import type { Ingredient, Recipe } from '#shared/types'
import { formatScaledAmount, toRecipe } from '#shared/utils/recipes'

/**
 * Charge une recette complète (ligne `recipes` + sections imbriquées avec
 * ingrédients et instructions) en une seule requête PostgREST, triée par
 * `order_index`. `null` si la recette n'existe pas.
 */
export async function fetchRecipeById(supabase: SupabaseClient<Database>, id: string): Promise<Recipe | null> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, description, category, prep_time, cook_time, servings, photo_path, tags, notes, created_at, updated_at, recipe_sections(*, recipe_ingredients(*), instructions(*))')
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

/**
 * Libellé « quantité + unité » d'un ingrédient, mis à l'échelle (`factor`) et
 * avec l'unité canonique du référentiel (`useUnits().unitLabel`), repli sur
 * le texte saisi. Partagé par la fiche, le mode cuisine et l'ajout aux courses.
 */
export function useIngredientLabel() {
  const { unitLabel } = useUnits()
  const numberLocale = useNumberLocale()

  const amountLabel = (ingredient: Pick<Ingredient, 'amount' | 'amountNum' | 'unit' | 'unitCode'>, factor = 1): string => {
    const amount = formatScaledAmount(ingredient.amountNum, ingredient.amount, factor, numberLocale.value)
    const unit = unitLabel(ingredient.unitCode, ingredient.unit)
    return [amount, unit].filter(Boolean).join(' ')
  }

  /** « 1 ½ c. à s. farine (optionnel) » sans la mention optionnelle : nom inclus. */
  const ingredientLabel = (ingredient: Pick<Ingredient, 'name' | 'amount' | 'amountNum' | 'unit' | 'unitCode'>, factor = 1): string =>
    [amountLabel(ingredient, factor), ingredient.name.trim()].filter(Boolean).join(' ')

  return { amountLabel, ingredientLabel }
}
