<template>
  <div>
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-4xl font-lobster text-gray-900 mb-4">
        Mes recettes favorites
      </h1>
      <p class="text-xl text-gray-600">
        Retrouvez ici toutes vos recettes préférées
      </p>
    </div>

    <!-- Favorites Grid -->
    <div v-if="favorites.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
      <NuxtLink
        v-for="recipe in favorites"
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
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
        </svg>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">
          Aucune recette favorite
        </h3>
        <p class="text-gray-600 mb-4">
          Vous n'avez pas encore ajouté de recettes à vos favoris. 
          Parcourez nos recettes et cliquez sur le cœur pour les ajouter !
        </p>
        <NuxtLink to="/recettes" class="btn-primary">
          Découvrir des recettes
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup>
const recipesStore = useRecipesStore()

const favorites = computed(() => recipesStore.favorites)

// SEO
useHead({
  title: 'Favoris - Recettes des Boultons',
  meta: [
    { name: 'description', content: 'Retrouvez toutes vos recettes favorites. Vos plats préférés en un seul endroit !' }
  ]
})
</script> 