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
        <!-- Difficulty Filter -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Difficulté
          </label>
          <select
            v-model="selectedDifficulty"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">Toutes les difficultés</option>
            <option value="facile">Facile</option>
            <option value="moyen">Moyen</option>
            <option value="difficile">Difficile</option>
          </select>
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
    <div v-if="filteredRecipes.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
    'yaourts-fromages': 'Yaourts et fromages',
    'desserts': 'Desserts',
    'boissons': 'Boissons'
  }
  return map[categoryParam.value] || categoryParam.value
})

const searchQuery = ref('')
const selectedDifficulty = ref('')

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
  if (selectedDifficulty.value) {
    filtered = filtered.filter(recipe => recipe.difficulty === selectedDifficulty.value)
  }
  return filtered
})

const clearFilters = () => {
  searchQuery.value = ''
  selectedDifficulty.value = ''
}

// SEO
useHead({
  title: () => `Recettes : ${categoryName.value} - Recettes des Boultons`,
  meta: [
    { name: 'description', content: () => `Découvrez toutes les recettes de la catégorie ${categoryName.value}.` }
  ]
})
</script> 