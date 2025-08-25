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
          {{ filteredRecipes.length }} recette{{ filteredRecipes.length > 1 ? 's' : '' }}
        </span>
      </div>
    </div>

    <!-- Recipes Grid -->
    <div v-if="filteredRecipes.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
      <NuxtLink
        v-for="recipe in filteredRecipes"
        :key="recipe.id"
        :to="`/recettes/${recipe.id}`"
        class="block"
      >
        <RecipeCard :recipe="recipe" />
      </NuxtLink>
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
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { onMounted, onUnmounted } from 'vue'
import RecipeCard from '@/components/RecipeCard.vue'
const recipesStore = useRecipesStore()
const route = useRoute()

const categoryParam = computed(() => route.params.category)
const categoryName = computed(() => {
  // Adapter si besoin pour afficher un nom plus lisible
  const map = {
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
  return map[categoryParam.value] || categoryParam.value
})

const searchQuery = ref('')
const selectedTags = ref([])
const showTagsDropdown = ref(false)

// Computed properties
const availableTags = computed(() => recipesStore.categoryTags)

// Fermer le dropdown lors d'un clic à l'extérieur
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const filteredRecipes = computed(() => {
  let filtered = recipesStore.filteredRecipes.filter(r => r.category === categoryParam.value)
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(recipe => 
      recipe.title.toLowerCase().includes(query) ||
      recipe.description.toLowerCase().includes(query) ||
      recipe.tags.some(tag => tag.toLowerCase().includes(query))
    )
  }
  if (selectedTags.value.length > 0) {
    filtered = filtered.filter(recipe => 
      selectedTags.value.some(selectedTag => 
        recipe.tags.some(tag => tag.toLowerCase() === selectedTag.toLowerCase())
      )
    )
  }
  return filtered
})

const clearFilters = () => {
  searchQuery.value = ''
  selectedTags.value = []
  showTagsDropdown.value = false
}

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

// SEO
useHead({
  title: () => `Recettes : ${categoryName.value} - Recettes des Boultons`,
  meta: [
    { name: 'description', content: () => `Découvrez toutes les recettes de la catégorie ${categoryName.value}.` }
  ]
})
</script> 