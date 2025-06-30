<template>
  <div>
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-4xl font-lobster text-gray-900 mb-4">
        Toutes nos recettes
      </h1>
      <p class="text-xl text-gray-600">
        Découvrez notre collection de recettes délicieuses
      </p>
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
            <option value="yaourts-fromages">Yaourts et fromages</option>
            <option value="desserts">Desserts</option>
            <option value="boissons">Boissons</option>
          </select>
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
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
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
const recipesStore = useRecipesStore()

// Reactive filters
const searchQuery = ref('')
const selectedCategory = ref('')
const selectedDifficulty = ref('')

// Computed filtered recipes
const filteredRecipes = computed(() => {
  let filtered = recipesStore.filteredRecipes

  // Apply category filter
  if (selectedCategory.value) {
    filtered = filtered.filter(recipe => recipe.category === selectedCategory.value)
  }

  // Apply difficulty filter
  if (selectedDifficulty.value) {
    filtered = filtered.filter(recipe => recipe.difficulty === selectedDifficulty.value)
  }

  return filtered
})

// Watch for search query changes
watch(searchQuery, (newQuery) => {
  recipesStore.setSearchQuery(newQuery)
})

// Watch for category changes
watch(selectedCategory, (newCategory) => {
  recipesStore.setCategory(newCategory || null)
})

// Clear all filters
const clearFilters = () => {
  searchQuery.value = ''
  selectedCategory.value = ''
  selectedDifficulty.value = ''
  recipesStore.clearFilters()
}

// SEO
useHead({
  title: 'Recettes - Recettes des Boultons',
  meta: [
    { name: 'description', content: 'Découvrez toutes nos recettes délicieuses. Filtrez par catégorie, difficulté et trouvez votre prochain plat favori !' }
  ]
})
</script> 