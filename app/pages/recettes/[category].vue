<template>
  <div>
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-4xl font-lobster text-gray-900 mb-4">
        Recettes : {{ categoryName }}
      </h1>
      <p class="text-xl text-gray-600">
        Découvrez toutes les recettes de la catégorie « {{ categoryName }} »
      </p>
    </div>

    <!-- Filters (désactivé pour la catégorie) -->
    <div class="bg-white rounded-xl shadow-xs p-6 mb-8">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Search -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Rechercher
          </label>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Nom de la recette, ingrédient..."
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
        </div>
        <!-- Category Filter (readonly) -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Catégorie
          </label>
          <input
            :value="categoryName"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
            readonly
          >
        </div>
        <!-- Tags Filter -->
        <div class="relative" data-tags-dropdown>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Tags
          </label>
          <button
            @click="availableTags.length > 0 ? toggleTagsDropdown($event) : null"
            type="button"
            :disabled="availableTags.length === 0"
            :class="[
              'w-full px-4 py-2 border rounded-lg text-left flex justify-between items-center',
              availableTags.length === 0
                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'border-gray-300 bg-white text-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent'
            ]"
          >
            <span>
              {{ availableTags.length === 0 ? 'Aucun tag disponible' : (selectedTags.length > 0 ? `${selectedTags.length} tag(s) sélectionné(s)` : 'Tous les tags') }}
            </span>
            <svg class="w-4 h-4" :class="availableTags.length === 0 ? 'text-gray-300' : 'text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </button>

          <!-- Dropdown -->
          <div v-if="showTagsDropdown" class="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
            <div class="p-2 max-h-48 overflow-y-auto">
              <label
                v-for="tag in availableTags"
                :key="tag"
                class="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  :value="tag"
                  :checked="selectedTags.includes(tag)"
                  @change="toggleTag(tag)"
                  class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                >
                <span class="text-sm text-gray-700">{{ tag }}</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Clear Filters -->
      <div class="mt-4 flex justify-between items-center">
        <button
          @click="clearFilters"
          class="text-primary-600 hover:text-primary-700 font-medium"
        >
          Effacer les filtres
        </button>
        <span class="text-sm text-gray-500">
          {{ $t('recipes.filters.count', totalCount) }}
        </span>
      </div>
    </div>

    <!-- Loading State (squelette) -->
    <div v-if="status === 'pending'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6" aria-busy="true">
      <div v-for="n in 8" :key="n" class="animate-pulse">
        <div class="bg-gray-200 rounded-lg h-52 mb-4"></div>
        <div class="h-5 bg-gray-200 rounded w-3/4 mb-3"></div>
        <div class="h-4 bg-gray-200 rounded w-full mb-2"></div>
        <div class="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    </div>

    <!-- Error State -->
    <ErrorState
      v-else-if="error"
      :message="error.message"
      :retry-action="() => refresh()"
      :title="$t('recipes.loadError.title')"
      :retry-text="$t('recipes.loadError.retry')"
    />

    <!-- Recipes Grid -->
    <template v-else-if="recipes.length > 0">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        <div
          v-for="recipe in recipes"
          :key="recipe.id"
          class="block h-full"
        >
          <RecipeCard :recipe="recipe" />
        </div>
      </div>

      <!-- Pagination -->
      <nav v-if="totalPages > 1" class="mt-8 flex items-center justify-center gap-4" aria-label="Pagination">
        <button
          type="button"
          @click="page--"
          :disabled="page <= 1"
          class="px-4 py-2 text-sm font-medium text-primary-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ $t('recipes.pagination.previous') }}
        </button>
        <span class="text-sm text-gray-600">
          {{ $t('recipes.pagination.page', { page, total: totalPages }) }}
        </span>
        <button
          type="button"
          @click="page++"
          :disabled="page >= totalPages"
          class="px-4 py-2 text-sm font-medium text-primary-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ $t('recipes.pagination.next') }}
        </button>
      </nav>
    </template>

    <!-- Empty State -->
    <EmptyState
      v-else
      :title="$t('recipes.empty.title')"
      :message="$t('recipes.empty.description')"
    >
      <template #action>
        <button
          @click="clearFilters"
          class="btn-primary"
        >
          {{ $t('recipes.empty.clearFilters') }}
        </button>
      </template>
    </EmptyState>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const route = useRoute()

const CATEGORY_NAMES: Record<string, string> = {
  'soupes': 'Soupes',
  'entrees': 'Entrées, Salades, Pains et accompagnements',
  'plats': 'Plats',
  'poissons': 'Poissons',
  'viandes': 'Viandes',
  'yaourts et fromages': 'Yaourts et fromages',
  'desserts et gâteaux': 'Desserts et gâteaux',
  'boissons': 'Boissons',
  'confitures': 'Confitures'
}

const categoryParam = computed(() => {
  const value = route.params.category
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
})
const categoryName = computed(() => CATEGORY_NAMES[categoryParam.value] ?? categoryParam.value)

// Filtres locaux à la page (la catégorie est fixée par l'URL)
const searchQuery = ref('')
const selectedTags = ref<string[]>([])
const showTagsDropdown = ref(false)
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

// Liste paginée (RPC search_recipes, SSR)
const { recipes, totalCount, totalPages, status, error, refresh } = useRecipeSearch('category', {
  query: debouncedQuery,
  category: categoryParam,
  tags: selectedTags,
  page
})

// Tags disponibles dans cette catégorie (facettes)
const facets = useRecipeFacets()
const availableTags = computed(() => facets.tagsForCategory(categoryParam.value))

// Fermer le dropdown lors d'un clic à l'extérieur
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const clearFilters = () => {
  searchQuery.value = ''
  debouncedQuery.value = ''
  selectedTags.value = []
  showTagsDropdown.value = false
}

const toggleTag = (tag: string) => {
  const index = selectedTags.value.findIndex(t => t.toLowerCase() === tag.toLowerCase())
  if (index !== -1) {
    selectedTags.value.splice(index, 1)
  } else {
    selectedTags.value.push(tag)
  }
}

const toggleTagsDropdown = (event: Event) => {
  event.stopPropagation()
  showTagsDropdown.value = !showTagsDropdown.value
}

const handleClickOutside = (event: MouseEvent) => {
  const dropdown = document.querySelector('[data-tags-dropdown]')
  if (dropdown && event.target instanceof Node && !dropdown.contains(event.target)) {
    showTagsDropdown.value = false
  }
}

// SEO
useHead({
  title: () => `Recettes : ${categoryName.value} - Recettes des Boultons`,
  meta: [
    { name: 'description', content: () => `Découvrez toutes les recettes de la catégorie ${categoryName.value}.` }
  ]
})
</script>
