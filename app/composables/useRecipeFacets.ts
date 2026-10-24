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
  const v2 = useV2()
  const authStore = useAuthStore()

  const asyncData = useAsyncData<FacetRow[]>(
    'recipe-facets',
    async () => {
      if (v2) {
        // v2 : compteurs de MON CARNET par catégorie personnelle, comme `list_cookbook` : mes recettes (`category_id`) + celles
        // que j'ai ajoutées et que je peux encore lire (mon rangement `cookbook_entries.category_id`). `recipes!inner` applique
        // le RLS : une recette devenue illisible n'est pas comptée. Les tags ne sont pas filtrables en v2 (`list_cookbook`).
        const ownerId = authStore.currentUser?.id
        if (!ownerId) return []
        const [owned, added] = await Promise.all([
          supabase.from('recipes').select('category_id').eq('owner_id', ownerId),
          supabase.from('cookbook_entries').select('category_id, recipes!inner(owner_id)').eq('user_id', ownerId)
        ])
        if (owned.error) throw owned.error
        if (added.error) throw added.error
        const own = (owned.data ?? []).map(row => ({ category: row.category_id ?? '', tags: null }))
        const others = (added.data ?? [])
          .filter(row => (row.recipes as { owner_id: string | null } | null)?.owner_id !== ownerId)
          .map(row => ({ category: row.category_id ?? '', tags: null }))
        return [...own, ...others]
      }
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

  /** Tags présents dans une catégorie (toutes si `null`). Aucun en v2 : le carnet ne se filtre pas par tag. */
  const tagsForCategory = (category: string | null | undefined): string[] => {
    if (v2) return []
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
