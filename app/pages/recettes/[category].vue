<template>
  <div class="space-y-6">
    <header>
      <UButton :to="localePath('/recettes')" variant="link" color="neutral" icon="i-lucide-arrow-left" size="sm" class="-ml-2 mb-2" :label="$t('recipes.detail.backToList')" />
      <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl">{{ categoryName }}</h1>
      <p class="mt-2 text-muted">{{ $t('ui.category.subtitle', { category: categoryName }) }}</p>
    </header>

    <RecipeFilters
      v-model:query="searchQuery"
      v-model:tags="selectedTags"
      :category="categoryParam"
      :locked-category="categoryName"
      :available-tags="availableTags"
      :total-count="totalCount"
      @clear="clearFilters"
    />

    <RecipeGridSkeleton v-if="status === 'pending'" />

    <ErrorState
      v-else-if="error"
      :message="error.message"
      :retry-action="() => refresh()"
      :title="$t('recipes.loadError.title')"
      :retry-text="$t('recipes.loadError.retry')"
    />

    <template v-else-if="recipes.length > 0">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
        <RecipeCard v-for="recipe in recipes" :key="recipe.id" :recipe="recipe" />
      </div>

      <nav v-if="totalPages > 1" class="flex justify-center" :aria-label="$t('ui.pagination.label')">
        <UPagination v-model:page="page" :total="totalCount" :items-per-page="pageSize" :sibling-count="1" show-edges />
      </nav>
    </template>

    <EmptyState v-else icon="i-lucide-search-x" :title="$t('recipes.empty.title')" :message="$t('recipes.empty.description')">
      <template #action>
        <UButton color="neutral" variant="outline" icon="i-lucide-filter-x" :label="$t('recipes.empty.clearFilters')" @click="clearFilters" />
      </template>
    </EmptyState>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { categoryName: nameOf } = useCategories()

const categoryParam = computed(() => {
  const value = route.params.category
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
})
const categoryName = computed(() => nameOf(categoryParam.value))

// Filtres locaux à la page (la catégorie est fixée par l'URL)
const searchQuery = ref('')
const selectedTags = ref<string[]>([])
const page = ref(1)

// Recherche : la RPC n'est appelée qu'après une courte pause de saisie
const debouncedQuery = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch(searchQuery, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { debouncedQuery.value = value }, 300)
})
onUnmounted(() => clearTimeout(debounceTimer))

watch([debouncedQuery, categoryParam, () => selectedTags.value.join('\u0000')], () => {
  page.value = 1
})

// Changement de page : revenir en haut de la liste
watch(page, () => {
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
})

// Liste paginée (RPC search_recipes, SSR)
const { recipes, totalCount, totalPages, pageSize, status, error, refresh } = useRecipeSearch('category', {
  query: debouncedQuery,
  category: categoryParam,
  tags: selectedTags,
  page
})

// Tags disponibles dans cette catégorie (facettes)
const facets = useRecipeFacets()
const availableTags = computed(() => facets.tagsForCategory(categoryParam.value))

const clearFilters = () => {
  searchQuery.value = ''
  debouncedQuery.value = ''
  selectedTags.value = []
}

useHead({
  title: () => categoryName.value,
  meta: [{ name: 'description', content: () => t('ui.category.subtitle', { category: categoryName.value }) }]
})
</script>
