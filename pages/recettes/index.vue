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
    <div class="bg-white rounded-xl shadow-sm p-6 mb-8">
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
          {{ filteredRecipes.length }} recette{{ filteredRecipes.length > 1 ? 's' : '' }}
        </span>
      </div>
    </div>

    <!-- Recipes Grid -->
    <div v-if="filteredRecipes.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
      <div
        v-for="recipe in filteredRecipes"
        :key="recipe.id"
        class="block"
      >
        <RecipeCard 
          :recipe="recipe" 
          :show-admin-actions="authStore.isAdmin"
          @edit="editRecipe"
          @delete="confirmDeleteRecipe"
        />
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12">
      <div class="max-w-md mx-auto">
        <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
        </svg>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">
          Aucune recette trouvée
        </h3>
        <p class="text-gray-600 mb-4">
          Essayez de modifier vos critères de recherche ou de supprimer les filtres.
        </p>
        <button
          @click="clearFilters"
          class="btn-primary"
        >
          Effacer les filtres
        </button>
      </div>
    </div>

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

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const recipesStore = useRecipesStore()
const authStore = useAuthStore()
const route = useRoute()

// Reactive filters synchronisés avec le store
const searchQuery = ref(recipesStore.searchQuery)
const selectedCategory = ref(recipesStore.currentCategory || '')
const selectedTags = ref(recipesStore.selectedTags || [])
const showTagsDropdown = ref(false)

// Recipe editing and deletion
const showRecipeEditor = ref(false)
const editingRecipe = ref(null)
const showDeleteModal = ref(false)
const recipeToDelete = ref(null)

// Computed properties
const allTags = computed(() => recipesStore.allTags)
const availableTags = computed(() => recipesStore.categoryTags)

// Computed delete confirmation message
const deleteConfirmMessage = computed(() => {
  if (!recipeToDelete.value) return ''
  return `Êtes-vous sûr de vouloir supprimer la recette "${recipeToDelete.value.title}" ? Cette action est irréversible.`
})

// Lire le paramètre category de l'URL au chargement de la page
onMounted(() => {
  const categoryFromUrl = route.query.category
  if (categoryFromUrl && typeof categoryFromUrl === 'string') {
    selectedCategory.value = categoryFromUrl
    recipesStore.setCategory(categoryFromUrl)
  }
  
  // Fermer le dropdown lors d'un clic à l'extérieur
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// Synchronisation UI <-> store
watchEffect(() => {
  searchQuery.value = recipesStore.searchQuery
  selectedCategory.value = recipesStore.currentCategory || ''
  selectedTags.value = recipesStore.selectedTags || []
})

// Computed filtered recipes
const filteredRecipes = computed(() => {
  let filtered = recipesStore.filteredRecipes

  // Apply category filter
  if (selectedCategory.value) {
    filtered = filtered.filter(recipe => recipe.category === selectedCategory.value)
  }

  // Apply tag filter
  if (selectedTags.value.length > 0) {
    filtered = filtered.filter(recipe => 
      selectedTags.value.some(selectedTag => 
        recipe.tags.some(tag => tag.toLowerCase() === selectedTag.toLowerCase())
      )
    )
  }

  // Sort recipes alphabetically by title with safety check
  return filtered.sort((a, b) => {
    const titleA = a.title || ''
    const titleB = b.title || ''
    return titleA.localeCompare(titleB, 'fr', { sensitivity: 'base' })
  })
})

// Watch for search query changes
watch(searchQuery, (newQuery) => {
  recipesStore.setSearchQuery(newQuery)
})

// Watch for category changes
watch(selectedCategory, (newCategory) => {
  recipesStore.setCategory(newCategory || null)
})

// Tag functions
const toggleTag = (tag) => {
  recipesStore.toggleTag(tag)
}

const toggleTagsDropdown = (event) => {
  event.stopPropagation()
  showTagsDropdown.value = !showTagsDropdown.value
}

const handleClickOutside = (event) => {
  const dropdown = document.querySelector('[data-tags-dropdown]')
  if (dropdown && !dropdown.contains(event.target)) {
    showTagsDropdown.value = false
  }
}

// Clear all filters
const clearFilters = () => {
  searchQuery.value = ''
  selectedCategory.value = ''
  selectedTags.value = []
  showTagsDropdown.value = false
  recipesStore.clearFilters()
}

// Recipe editing methods
const editRecipe = (recipe) => {
  editingRecipe.value = recipe
  showRecipeEditor.value = true
}

const closeRecipeEditor = () => {
  showRecipeEditor.value = false
  editingRecipe.value = null
}

const onRecipeSaved = (recipe) => {
  closeRecipeEditor()
  // The recipe is already saved in the store
}

// Recipe deletion methods
const confirmDeleteRecipe = (recipe) => {
  recipeToDelete.value = recipe
  showDeleteModal.value = true
}

const deleteRecipe = async () => {
  if (recipeToDelete.value) {
    try {
      await recipesStore.deleteRecipe(recipeToDelete.value.id)
      closeDeleteModal()
      $toast.success('Succès', 'Recette supprimée avec succès !', 3000)
    } catch (error) {
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