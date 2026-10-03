import { computed } from 'vue'
import type { Database } from '#shared/types/database'

interface FacetRow {
  category: string
  tags: string[] | null
}

const sortTags = (tags: Iterable<string>) => Array.from(tags).sort((a, b) => a.localeCompare(b, 'fr'))

/**
 * Facettes des recettes (compteurs par catégorie, tags disponibles) à partir
 * d'une requête légère `select category, tags from recipes`.
 *
 * Rechargée après une écriture (`useRecipesStore().refresh()`).
 */
export function useRecipeFacets() {
  const supabase = useSupabaseClient<Database>()
  const recipesStore = useRecipesStore()

  const asyncData = useAsyncData<FacetRow[]>(
    'recipe-facets',
    async () => {
      const { data, error } = await supabase.from('recipes').select('category, tags')
      if (error) throw error
      return data ?? []
    },
    {
      default: () => [],
      watch: [() => recipesStore.revision]
    }
  )

  const totalCount = computed(() => asyncData.data.value.length)

  const countsByCategory = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    for (const row of asyncData.data.value) {
      counts[row.category] = (counts[row.category] ?? 0) + 1
    }
    return counts
  })

  const allTags = computed(() => {
    const tags = new Set<string>()
    for (const row of asyncData.data.value) {
      row.tags?.forEach(tag => tags.add(tag))
    }
    return sortTags(tags)
  })

  /** Tags présents dans une catégorie (toutes si `null`). */
  const tagsForCategory = (category: string | null | undefined): string[] => {
    if (!category) return allTags.value
    const tags = new Set<string>()
    for (const row of asyncData.data.value) {
      if (row.category === category) row.tags?.forEach(tag => tags.add(tag))
    }
    return sortTags(tags)
  }

  return {
    ...asyncData,
    totalCount,
    countsByCategory,
    allTags,
    tagsForCategory
  }
}
