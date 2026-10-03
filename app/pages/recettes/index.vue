<template>
  <div>
    <!-- Header -->
    <div class="mb-8 flex flex-col md:flex-row md:items-center justify-between">
      <div>
        <h1 class="text-4xl font-lobster text-gray-900 mb-4">
          Toutes nos recettes
        </h1>
        <p class="text-xl text-gray-600">
          Découvrez notre collection de recettes délicieuses
        </p>
      </div>
      <div class="flex gap-2 mt-4 md:mt-0">
        <!-- Bouton Nouvelle recette - visible uniquement pour les admins -->
        <NuxtLink
          v-if="authStore.isAdmin"
          to="/traducteur"
          class="btn-primary"
        >
          + Nouvelle recette
        </NuxtLink>

        <!-- Indicateur de chargement -->
        <div v-if="recipesStore.isLoading" class="flex items-center text-primary-600">
          <svg class="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span class="text-sm">Mise à jour...</span>
        </div>
      </div>
    </div>

    <!-- Filters -->
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

        <!-- Category Filter -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Catégorie
          </label>
          <select
            v-model="selectedCategory"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">Toutes les catégories</option>
            <option value="soupes">Soupes</option>
            <option value="entrees">Entrées, Salades, Pains et accompagnements</option>
            <option value="plats">Plats</option>
            <option value="poissons">Poissons</option>
            <option value="viandes">Viandes</option>
            <option value="yaourts et fromages">Yaourts et fromages</option>
            <option value="desserts et gâteaux">Desserts et gâteaux</option>
            <option value="boissons">Boissons</option>
            <option value="confitures">Confitures</option>
          </select>
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
          <RecipeCard
            :recipe="recipe"
            :show-admin-actions="authStore.isAdmin"
            @edit="editRecipe"
            @delete="confirmDeleteRecipe"
          />
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

    <!-- Recipe Editor Modal -->
    <RecipeEditor
      :show="showRecipeEditor"
      :recipe="editingRecipe"
      @close="closeRecipeEditor"
      @save="onRecipeSaved"
    />

    <!-- Delete Confirmation Modal -->
    <ConfirmModal
      :show="showDeleteModal"
      title="Supprimer la recette"
      :message="deleteConfirmMessage"
      confirm-text="Supprimer"
      cancel-text="Annuler"
      @confirm="deleteRecipe"
      @close="closeDeleteModal"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Recipe, RecipeSummary } from '#shared/types'
import type { Database } from '#shared/types/database'

const recipesStore = useRecipesStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const supabase = useSupabaseClient<Database>()
const { $toast } = useNuxtApp()

// Paramètres d'URL (SSR) : ?category= (liens de l'accueil) et ?page=
const categoryFromUrl = route.query.category
if (typeof categoryFromUrl === 'string' && categoryFromUrl !== recipesStore.currentCategory) {
  recipesStore.setCategory(categoryFromUrl || null)
}
const pageFromUrl = Number.parseInt(typeof route.query.page === 'string' ? route.query.page : '', 10)
const page = ref(Number.isFinite(pageFromUrl) && pageFromUrl > 0 ? pageFromUrl : 1)

// Filtres : l'état d'interface vit dans le store (conservé entre les pages)
const searchQuery = computed({
  get: () => recipesStore.searchQuery,
  set: value => recipesStore.setSearchQuery(value)
})
const selectedCategory = computed({
  get: () => recipesStore.currentCategory ?? '',
  set: value => recipesStore.setCategory(value || null)
})
const selectedTags = computed(() => recipesStore.selectedTags)
const showTagsDropdown = ref(false)

// Recherche : la RPC n'est appelée qu'après une courte pause de saisie
const debouncedQuery = ref(recipesStore.searchQuery)
let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch(searchQuery, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { debouncedQuery.value = value }, 300)
})
onUnmounted(() => clearTimeout(debounceTimer))

// Retour à la première page quand les filtres changent
watch([debouncedQuery, selectedCategory, () => selectedTags.value.join('\u0000')], () => {
  page.value = 1
})

// Garde la catégorie et la page dans l'URL (rechargement, partage)
watch([page, selectedCategory], ([newPage, newCategory]) => {
  const query = { ...route.query }
  if (newPage > 1) query.page = String(newPage)
  else delete query.page
  if (newCategory) query.category = newCategory
  else delete query.category
  router.replace({ query })
})

// Liste paginée (RPC search_recipes, SSR)
const { recipes, totalCount, totalPages, status, error, refresh } = useRecipeSearch('index', {
  query: debouncedQuery,
  category: selectedCategory,
  tags: selectedTags,
  page
})

// Tags disponibles pour la catégorie courante (facettes)
const facets = useRecipeFacets()
const availableTags = computed(() => facets.tagsForCategory(recipesStore.currentCategory))

// Recipe editing and deletion
const showRecipeEditor = ref(false)
const editingRecipe = ref<Recipe | null>(null)
const showDeleteModal = ref(false)
const recipeToDelete = ref<RecipeSummary | null>(null)

// Computed delete confirmation message
const deleteConfirmMessage = computed(() => {
  if (!recipeToDelete.value) return ''
  return `Êtes-vous sûr de vouloir supprimer la recette "${recipeToDelete.value.title}" ? Cette action est irréversible.`
})

// Fermer le dropdown lors d'un clic à l'extérieur
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// Tag functions
const toggleTag = (tag: string) => {
  recipesStore.toggleTag(tag)
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

// Clear all filters
const clearFilters = () => {
  showTagsDropdown.value = false
  recipesStore.clearFilters()
}

// Recipe editing methods : l'éditeur a besoin des sections → requête ciblée
const editRecipe = async (recipe: RecipeSummary) => {
  try {
    editingRecipe.value = await fetchRecipeById(supabase, recipe.id)
    showRecipeEditor.value = editingRecipe.value !== null
  } catch (error) {
    console.error('Erreur lors du chargement de la recette:', error)
    $toast.error('Erreur', 'Impossible de charger la recette à modifier.', 3000)
  }
}

const closeRecipeEditor = () => {
  showRecipeEditor.value = false
  editingRecipe.value = null
}

const onRecipeSaved = () => {
  closeRecipeEditor()
  // La liste observe recipesStore.revision : elle se recharge seule
}

// Recipe deletion methods
const confirmDeleteRecipe = (recipe: RecipeSummary) => {
  recipeToDelete.value = recipe
  showDeleteModal.value = true
}

const deleteRecipe = async () => {
  if (recipeToDelete.value) {
    try {
      await recipesStore.deleteRecipe(recipeToDelete.value.id)
      closeDeleteModal()
      $toast.success('Succès', 'Recette supprimée avec succès !', 3000)
    } catch {
      $toast.error('Erreur', 'Impossible de supprimer la recette. Veuillez réessayer.', 3000)
    }
  }
}

const closeDeleteModal = () => {
  showDeleteModal.value = false
  recipeToDelete.value = null
}

// SEO
useHead({
  title: 'Recettes - Recettes des Boultons',
  meta: [
    { name: 'description', content: 'Découvrez toutes nos recettes délicieuses. Filtrez par catégorie et tags et trouvez votre prochain plat favori !' }
  ]
})
</script>
