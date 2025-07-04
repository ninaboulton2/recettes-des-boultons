<template>
  <div class="recipe-card group">
    <div class="relative mb-4">
      <div class="bg-white rounded-lg shadow p-2">
        <img 
          :src="recipe.image" 
          :alt="recipe.title"
          class="w-full h-48 object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
        >
      </div>
      <div class="absolute top-3 right-3" @click="preventNavigation">
        <button 
          @click.stop.prevent="toggleFavorite"
          @mousedown.stop.prevent
          @mouseup.stop.prevent
          class="bg-white bg-opacity-80 hover:bg-opacity-100 p-2 rounded-full transition-all duration-200"
        >
          <svg 
            v-if="recipe.favorite" 
            class="w-5 h-5 text-red-500" 
            fill="currentColor" 
            viewBox="0 0 20 20"
          >
            <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"></path>
          </svg>
          <svg 
            v-else 
            class="w-5 h-5 text-gray-400 hover:text-red-500" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
          </svg>
        </button>
      </div>
    </div>

    <div class="space-y-3">
      <h3 class="text-xl font-semibold text-gray-900 group-hover:text-primary-600 transition-colors duration-200">
        {{ recipe.title }}
      </h3>
      
      <p class="text-gray-600 text-sm line-clamp-2">
        {{ recipe.description }}
      </p>

      <div class="flex items-center justify-between text-sm text-gray-500">
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>{{ recipe.prepTime + recipe.cookTime }} min</span>
          </div>
          <div class="flex items-center space-x-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
            </svg>
            <span>{{ recipe.servings }} pers.</span>
          </div>
        </div>
        
        <div class="flex items-center space-x-2" @click="preventNavigation">
          <button 
            @click.stop.prevent="addToShoppingList"
            @mousedown.stop.prevent
            @mouseup.stop.prevent
            class="text-primary-600 hover:text-primary-700 transition-colors duration-200"
            title="Ajouter à la liste de courses"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- Tags -->
      <div class="flex flex-wrap gap-1">
        <span 
            v-for="tag in recipe.tags" 
            :key="tag" 
            class="px-2 py-1 text-xs text-gray-600 rounded-full"
            :class="{
              'bg-green-500 text-white': tag === 'végétarien',
              'bg-emerald-600 text-white': tag === 'vegan',
              'bg-gray-100': tag !== 'végétarien' && tag !== 'vegan'
            }"
          >
            {{ tag }}
        </span>
        <span 
          v-if="recipe.tags.length > 3" 
          class="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full"
        >
          +{{ recipe.tags.length - 3 }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  recipe: {
    type: Object,
    required: true
  }
})

const recipesStore = useRecipesStore()
const shoppingStore = useShoppingStore()

const toggleFavorite = () => {
  recipesStore.toggleFavorite(props.recipe)
}

const { $toast } = useNuxtApp()

const addToShoppingList = () => {
  // Préparer les ingrédients avec les informations nécessaires
  const ingredients = props.recipe.ingredients.map(ingredient => ({
    name: ingredient.name,
    amount: ingredient.amount,
    unit: ingredient.unit,
    recipeId: props.recipe.id
  }))
  
  // Utiliser la nouvelle méthode qui vérifie toutes les listes
  shoppingStore.addIngredientsToLists(ingredients)
  
  // Afficher un toast de confirmation
  $toast.success(
    'Recette ajoutée !',
    `${props.recipe.title} a été ajoutée à votre liste de courses`,
    3000
  )
}

const preventNavigation = (event) => {
  event.stopPropagation()
  event.preventDefault()
}
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style> 