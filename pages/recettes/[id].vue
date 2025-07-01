<template>
  <!-- Bouton retour -->
  <button @click="$router.back()" class="mb-6 flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors">
    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
    </svg>
    Retour
  </button>
  <div v-if="recipe" class="max-w-3xl mx-auto">
    <!-- Header -->
    <div class="mb-8 flex flex-col md:flex-row md:items-center">
      <div class="flex-shrink-0 mb-6 md:mb-0">
      </div>
      <div class="flex-1">
        <h1 class="text-4xl font-lobster text-gray-900 mb-2">{{ recipe.title }}</h1>
        <p class="text-gray-600 mb-4">{{ recipe.description }}</p>
        <div class="flex flex-wrap gap-4 text-sm text-gray-500 mb-2">
          <span><strong>Catégorie :</strong> {{ categoryName }}</span>
          <span><strong>Difficulté :</strong> <span :class="difficultyClass">{{ recipe.difficulty }}</span></span>
          <span><strong>Temps :</strong> {{ recipe.prepTime + recipe.cookTime }} min</span>
          <span><strong>Portions :</strong> {{ recipe.servings }} pers.</span>
        </div>
        <div class="flex flex-wrap gap-2 mb-2">
          <span v-for="tag in recipe.tags" :key="tag" class="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">{{ tag }}</span>
        </div>
      </div>
    </div>

    <!-- Ingrédients -->
    <div class="mb-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-4">Ingrédients</h2>
      <ul class="list-disc list-inside space-y-1 text-gray-800">
        <li v-for="ingredient in recipe.ingredients" :key="ingredient.name">
          {{ ingredient.amount ? ingredient.amount + ' ' : '' }}{{ ingredient.unit ? ingredient.unit + ' ' : '' }}{{ ingredient.name }}
        </li>
      </ul>
    </div>

    <!-- Instructions -->
    <div class="mb-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-4">Instructions</h2>
      <ol class="list-decimal list-inside space-y-2 text-gray-800">
        <li v-for="(step, i) in recipe.instructions" :key="i">
          {{ step }}
        </li>
      </ol>
    </div>
  </div>
  <div v-else class="text-center py-16">
    <h2 class="text-2xl font-semibold text-gray-900 mb-4">Recette introuvable</h2>
    <NuxtLink to="/recettes" class="btn-primary">Retour aux recettes</NuxtLink>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { computed } from 'vue'
const recipesStore = useRecipesStore()
const route = useRoute()

const recipeId = computed(() => route.params.id)
const recipe = computed(() => recipesStore.recipes.find(r => r.id === recipeId.value))

const categoryName = computed(() => {
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
  return map[recipe.value?.category] || recipe.value?.category || ''
})

const difficultyClass = computed(() => {
  switch (recipe.value?.difficulty) {
    case 'facile':
      return 'text-green-600'
    case 'moyen':
      return 'text-yellow-600'
    case 'difficile':
      return 'text-red-600'
    default:
      return 'text-gray-500'
  }
})

// SEO
useHead({
  title: () => recipe.value ? `${recipe.value.title} - Recettes des Boultons` : 'Recette introuvable',
  meta: [
    { name: 'description', content: () => recipe.value ? recipe.value.description : 'Recette non trouvée.' }
  ]
})
</script> 