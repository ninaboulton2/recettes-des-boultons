import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { Database } from '#shared/types/database'
import type { RecipeSearchPage } from '#shared/types'
import { toRecipeSummary } from '#shared/utils/recipes'

/** Taille de page de la liste des recettes (RPC `search_recipes`, max 100). */
export const RECIPES_PAGE_SIZE = 24

export interface RecipeSearchParams {
  query?: MaybeRefOrGetter<string>
  category?: MaybeRefOrGetter<string | null>
  tags?: MaybeRefOrGetter<readonly string[]>
  page?: MaybeRefOrGetter<number>
}

export interface RecipeSearchOptions {
  /** `false` : pas de rendu serveur (ex. sélecteur dans une modale). */
  server?: boolean
  /** `true` : ne bloque pas la navigation. */
  lazy?: boolean
  /** `false` : attendre un appel explicite à `execute()`. */
  immediate?: boolean
}

/**
 * Liste paginée des recettes via la RPC `search_recipes` (plein texte français
 * sans accents, filtres catégorie/tags, `total_count`), rendue côté serveur.
 *
 * `scope` distingue les clés `useAsyncData` des pages qui l'utilisent.
 * La requête est relancée quand un paramètre change ou après une écriture
 * (`useRecipesStore().refresh()`).
 */
export function useRecipeSearch(scope: string, params: RecipeSearchParams = {}, options: RecipeSearchOptions = {}) {
  const supabase = useSupabaseClient<Database>()
  const recipesStore = useRecipesStore()

  const query = () => (toValue(params.query) ?? '').trim()
  const category = () => toValue(params.category) || null
  const tags = () => [...(toValue(params.tags) ?? [])]
  const page = () => Math.max(1, Math.floor(toValue(params.page) ?? 1))

  const asyncData = useAsyncData<RecipeSearchPage>(
    `recipes-search:${scope}`,
    async () => {
      const selectedTags = tags()
      const { data, error } = await supabase.rpc('search_recipes', {
        p_query: query() || undefined,
        p_category: category() ?? undefined,
        p_tags: selectedTags.length > 0 ? selectedTags : undefined,
        p_limit: RECIPES_PAGE_SIZE,
        p_offset: (page() - 1) * RECIPES_PAGE_SIZE
      })
      if (error) throw error

      const rows = data ?? []
      return {
        recipes: rows.map(toRecipeSummary),
        totalCount: rows[0]?.total_count ?? 0
      }
    },
    {
      ...options,
      default: () => ({ recipes: [], totalCount: 0 }),
      watch: [query, category, () => tags().join('\u0000'), page, () => recipesStore.revision]
    }
  )

  const recipes = computed(() => asyncData.data.value.recipes)
  const totalCount = computed(() => asyncData.data.value.totalCount)
  const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / RECIPES_PAGE_SIZE)))

  return {
    ...asyncData,
    recipes,
    totalCount,
    totalPages,
    pageSize: RECIPES_PAGE_SIZE
  }
}
