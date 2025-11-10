<template>
  <!-- Boutons d'action -->
  <div class="mb-4 sm:mb-6 flex flex-col gap-3 sm:gap-4">
          <!-- Première ligne : bouton retour et boutons principaux -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
      <button @click="$router.back()" class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors w-fit text-sm sm:text-base">
        <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        <span class="hidden sm:inline">Retour</span>
      </button>
      
      <!-- Boutons d'action - disposition mobile optimisée -->
      <div class="flex flex-wrap gap-1.5 sm:gap-4 justify-end sm:justify-start">
        <!-- Bouton d'ajout à la liste de courses - visible uniquement pour les utilisateurs connectés -->
        <button 
          v-if="recipe && authStore.isAuthenticated"
          @click="showShoppingModal = true" 
          class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-primary-50 text-sm sm:text-base"
        >
          <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
          </svg>
          <span class="hidden sm:inline">Ajouter à la liste de courses</span>
          <span class="sm:hidden">Courses</span>
        </button>
        
        <!-- Bouton d'ajout au planning - visible uniquement pour les utilisateurs connectés -->
        <button 
          v-if="recipe && authStore.isAuthenticated"
          @click="addToPlanning" 
          class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-primary-50 text-sm sm:text-base"
        >
          <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          <span class="hidden sm:inline">Ajouter au planning</span>
          <span class="sm:hidden">Planning</span>
        </button>
        
        <!-- Bouton d'impression -->
        <button 
          v-if="recipe"
          @click="printRecipe" 
          class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-primary-50 text-sm sm:text-base"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
            </svg>
          <span class="hidden sm:inline">Imprimer</span>
          <span class="sm:hidden">Imprimer</span>
        </button>
      </div>
    </div>
    
    <!-- Deuxième ligne : boutons d'administration -->
    <div v-if="recipe && authStore.isAdmin" class="flex flex-wrap items-center justify-end gap-1.5 sm:gap-4">
      <!-- Bouton d'édition - visible uniquement pour les admins -->
      <button 
        @click="editRecipe" 
        class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-primary-50 text-sm sm:text-base"
        title="Modifier la recette"
      >
        <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
        </svg>
        Modifier
      </button>
      <!-- Bouton de suppression - visible uniquement pour les admins -->
      <button 
        @click="confirmDeleteRecipe" 
        class="flex items-center text-red-600 hover:text-red-800 font-medium transition-colors px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-red-50 text-sm sm:text-base"
        title="Supprimer la recette"
      >
        <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
        </svg>
        Supprimer
      </button>
    </div>
  </div>
  <div v-if="recipe" class="max-w-3xl mx-auto">
    <!-- Header -->
    <div class="mb-6 sm:mb-8 flex flex-col md:flex-row md:items-center">
      <div class="flex-shrink-0 mb-4 sm:mb-6 md:mb-0">
      </div>
      <div class="flex-1">
        <h1 class="text-2xl sm:text-4xl font-lobster text-gray-900 mb-2">{{ recipe.title }}</h1>
        <p class="text-sm sm:text-base text-gray-600 mb-3 sm:mb-4">{{ recipe.description }}</p>
        <div class="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 mb-2">
          <span><strong>Catégorie :</strong> {{ categoryName }}</span>
          <span v-if="totalTime !== null"><strong>Temps :</strong> {{ totalTime }} min</span>
          <span v-if="recipe.servings !== null && recipe.servings !== undefined"><strong>Portions :</strong> {{ recipe.servings }} pers.</span>
        </div>
        <!-- Tags -->
        <div class="flex flex-wrap gap-1 sm:gap-2 mb-2">
          <span 
            v-for="tag in recipe.tags" 
            :key="tag" 
            class="px-2 py-1 text-xs text-gray-600 rounded-full"
            :class="{
              'bg-green-500 text-white': tag === 'végétarien',
              'bg-emerald-600 text-white': tag === 'vegan',
              'bg-sky-400 text-white': tag === 'pescétarien' || tag === 'pescetarien',
              'bg-gray-100': tag !== 'végétarien' && tag !== 'vegan' && tag !== 'pescétarien' && tag !== 'pescetarien'
            }"
          >
            {{ tag }}
          </span>
        </div>
      </div>
    </div>

    <!-- Ingrédients -->
    <div class="mb-6 sm:mb-8">
      <h2 class="text-xl sm:text-2xl font-semibold text-gray-900 mb-3 sm:mb-4">Ingrédients</h2>
      
      <!-- Si des sections existent, les organiser par section -->
      <template v-if="recipe.sections && recipe.sections.length > 0">
        <div class="space-y-4">
          <div v-for="section in sectionsWithIngredients" :key="section.id" class="mb-4">
            <h3 class="text-lg font-medium text-gray-700 mb-2">{{ section.name }}</h3>
            <ul class="list-disc list-inside space-y-1 text-sm sm:text-base text-gray-800 ml-4">
              <li v-for="ingredient in section.ingredients" :key="ingredient.id">
                {{ formatIngredient(ingredient) }}
              </li>
            </ul>
          </div>
        </div>
      </template>
      
      <!-- Fallback : affichage simple si pas de sections -->
      <template v-else>
        <ul class="list-disc list-inside space-y-1 text-sm sm:text-base text-gray-800">
          <li v-for="ingredient in recipe.ingredients" :key="ingredient.name">
            {{ ingredient.amount ? ingredient.amount + ' ' : '' }}{{ ingredient.unit ? ingredient.unit + ' ' : '' }}{{ ingredient.name }}
          </li>
        </ul>
      </template>
    </div>

    <!-- Instructions -->
    <div class="mb-6 sm:mb-8">
      <h2 class="text-xl sm:text-2xl font-semibold text-gray-900 mb-3 sm:mb-4">Instructions</h2>
      
      <!-- Si des sections existent, les organiser par section -->
      <template v-if="recipe.sections && recipe.sections.length > 0">
        <div class="space-y-4">
          <div v-for="section in sectionsWithInstructions" :key="section.id" class="mb-4">
            <h3 class="text-lg font-medium text-gray-700 mb-2">{{ section.name }}</h3>
            <ol class="list-decimal list-inside space-y-2 text-sm sm:text-base text-gray-800 ml-4">
              <li v-for="instruction in section.instructions" :key="instruction.id">
                {{ instruction.content }}
              </li>
            </ol>
          </div>
        </div>
      </template>
      
      <!-- Fallback : affichage simple si pas de sections -->
      <template v-else>
        <ol class="list-decimal list-inside space-y-2 text-sm sm:text-base text-gray-800">
          <li v-for="(step, i) in recipe.instructions" :key="i">
            {{ step }}
          </li>
        </ol>
      </template>
    </div>

    <!-- Notes -->
    <div v-if="recipe.notes && recipe.notes.trim()" class="mb-6 sm:mb-8">
      <h2 class="text-xl sm:text-2xl font-semibold text-gray-900 mb-3 sm:mb-4">Notes et conseils</h2>
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
        <div class="flex items-start">
          <svg class="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mr-2 sm:mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-sm sm:text-base text-blue-800 whitespace-pre-wrap">{{ recipe.notes }}</p>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="text-center py-12 sm:py-16">
    <h2 class="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">Recette introuvable</h2>
    <NuxtLink to="/recettes" class="btn-primary">Retour aux recettes</NuxtLink>
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

  <!-- Shopping List Modal -->
  <div v-if="showShoppingModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-xl p-4 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-lg sm:text-2xl font-semibold text-gray-900 pr-4">
          Ajouter "{{ recipe?.title }}" à la liste de courses
        </h3>
        <button
          @click="closeShoppingModal"
          class="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- Si des sections existent -->
      <template v-if="recipe && recipe.sections && sectionsWithIngredients.length > 0">
        <div class="mb-4">
          <div class="flex items-center justify-between mb-4">
            <p class="text-sm text-gray-600">Sélectionnez les sections d'ingrédients à ajouter :</p>
            <div class="flex gap-2">
              <button
                @click="selectAllSections"
                class="text-xs sm:text-sm text-primary-600 hover:text-primary-800 font-medium px-2 py-1 rounded hover:bg-primary-50"
              >
                Tout sélectionner
              </button>
              <button
                @click="deselectAllSections"
                class="text-xs sm:text-sm text-gray-600 hover:text-gray-800 font-medium px-2 py-1 rounded hover:bg-gray-50"
              >
                Tout désélectionner
              </button>
            </div>
          </div>
          
          <div class="space-y-3">
            <div
              v-for="(section, index) in sectionsWithIngredients"
              :key="section.id || index"
              class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <label class="flex items-start cursor-pointer">
                <input
                  type="checkbox"
                  v-model="selectedSections"
                  :value="section.id || index"
                  class="mt-1 mr-3 w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                >
                <div class="flex-1">
                  <h4 class="font-medium text-gray-900 mb-2">
                    {{ section.name || 'Sans nom' }}
                  </h4>
                  <ul class="list-disc list-inside space-y-1 text-sm text-gray-600 ml-2">
                    <li v-for="ingredient in section.ingredients" :key="ingredient.id">
                      {{ formatIngredient(ingredient) }}
                    </li>
                  </ul>
                </div>
              </label>
            </div>
          </div>
        </div>
      </template>

      <!-- Si pas de sections (ancien format) -->
      <template v-else-if="recipe && recipe.ingredients && recipe.ingredients.length > 0">
        <div class="mb-4">
          <p class="text-sm text-gray-600 mb-4">Tous les ingrédients seront ajoutés :</p>
          <ul class="list-disc list-inside space-y-1 text-sm text-gray-600 ml-4">
            <li v-for="ingredient in recipe.ingredients" :key="ingredient.name">
              {{ ingredient.amount ? ingredient.amount + ' ' : '' }}{{ ingredient.unit ? ingredient.unit + ' ' : '' }}{{ ingredient.name }}
            </li>
          </ul>
        </div>
      </template>

      <div class="flex justify-end gap-3 mt-6">
        <button
          @click="closeShoppingModal"
          class="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
        >
          Annuler
        </button>
        <button
          @click="confirmAddToShoppingList"
          :disabled="recipe && recipe.sections && sectionsWithIngredients.length > 0 && selectedSections.length === 0"
          class="px-4 py-2 text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Ajouter
        </button>
      </div>
    </div>
  </div>

  <!-- Planning Modal -->
  <div v-if="showPlanningModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-xl p-4 sm:p-8 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-lg sm:text-2xl font-semibold text-gray-900 pr-4">
          Ajouter "{{ recipe?.title }}" au planning
        </h3>
        <button
          @click="closePlanningModal"
          class="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- Sélection de la semaine -->
      <div class="mb-6">
        <div class="flex justify-between items-center mb-4">
          <button
            @click="previousWeek"
            class="p-2 text-gray-600 hover:text-primary-600 transition-colors duration-200"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
            </svg>
          </button>
          
          <div class="flex flex-col items-center">
            <h4 class="text-lg font-semibold text-gray-900">
              Semaine du {{ formatWeekStart(planningCurrentWeek) }}
            </h4>
            <button
              @click="goToCurrentWeek"
              class="mt-2 px-3 py-1.5 text-sm bg-primary-100 text-primary-700 hover:bg-primary-200 rounded-lg transition-colors duration-200 font-medium"
            >
              Revenir à la semaine actuelle
            </button>
          </div>
          
          <button
            @click="nextWeek"
            class="p-2 text-gray-600 hover:text-primary-600 transition-colors duration-200"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- En-tête des jours -->
      <div class="grid grid-cols-7 gap-2 sm:gap-6 mb-6 overflow-x-auto">
        <div
          v-for="day in planningWeekDays"
          :key="`header-${day.dateString}`"
          class="text-center min-w-[80px] sm:min-w-[120px]"
        >
          <div class="text-sm sm:text-base font-medium text-gray-900 mb-2">{{ day.name }}</div>
          <div 
            class="text-xs sm:text-sm px-2 sm:px-3 py-1.5 rounded-lg transition-colors duration-200 font-medium"
            :class="isToday(day.date) 
              ? 'bg-primary-100 text-primary-700' 
              : 'text-gray-500'"
          >
            {{ formatDate(day.date) }}
          </div>
        </div>
      </div>

      <!-- Ligne des déjeuners -->
      <div class="mb-8">
        <div class="grid grid-cols-7 gap-2 sm:gap-6 overflow-x-auto">
          <div
            v-for="day in planningWeekDays"
            :key="`lunch-${day.dateString}`"
            class="text-center min-w-[80px] sm:min-w-[120px]"
          >
            <button
              @click="selectDayAndMeal(day.dateString, 'lunch')"
              class="w-full p-2 sm:p-3 text-xs sm:text-sm bg-green-100 text-green-700 hover:bg-green-200 rounded-lg transition-colors duration-200 font-medium relative"
              :class="{ 'bg-green-200 border-2 border-green-400': selectedDay === day.dateString && selectedMealType === 'lunch' }"
            >
              <span class="hidden sm:inline">Déjeuner</span>
              <span class="sm:hidden">Déj</span>
              <span 
                v-if="day.meals.lunch && day.meals.lunch.length > 0" 
                class="absolute -top-1 -right-1 bg-green-600 text-white text-xs rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center"
              >
                {{ day.meals.lunch.length }}
              </span>
            </button>
            <!-- Repas existants pour le déjeuner -->
            <div v-if="day.meals.lunch && day.meals.lunch.length > 0" class="mt-2 space-y-1">
              <div 
                v-for="meal in day.meals.lunch" 
                :key="meal.id" 
                class="text-xs text-gray-500 px-1 sm:px-2 py-1 truncate"
                :title="meal.recipe?.title || 'Recette sans nom'"
              >
                {{ meal.recipe?.title || 'Recette sans nom' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Ligne des dîners -->
      <div class="mb-8">
        <div class="grid grid-cols-7 gap-2 sm:gap-6 overflow-x-auto">
          <div
            v-for="day in planningWeekDays"
            :key="`dinner-${day.dateString}`"
            class="text-center min-w-[80px] sm:min-w-[120px]"
          >
            <button
              @click="selectDayAndMeal(day.dateString, 'dinner')"
              class="w-full p-2 sm:p-3 text-xs sm:text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors duration-200 font-medium relative"
              :class="{ 'bg-blue-200 border-2 border-blue-400': selectedDay === day.dateString && selectedMealType === 'dinner' }"
            >
              <span class="hidden sm:inline">Dîner</span>
              <span class="sm:hidden">Dîner</span>
              <span 
                v-if="day.meals.dinner && day.meals.dinner.length > 0" 
                class="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center"
              >
                {{ day.meals.dinner.length }}
              </span>
            </button>
            <!-- Repas existants pour le dîner -->
            <div v-if="day.meals.dinner && day.meals.dinner.length > 0" class="mt-2 space-y-1">
              <div 
                v-for="meal in day.meals.dinner" 
                :key="meal.id" 
                class="text-xs text-gray-500 px-1 sm:px-2 py-1 truncate"
                :title="meal.recipe?.title || 'Recette sans nom'"
              >
                {{ meal.recipe?.title || 'Recette sans nom' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bouton de confirmation -->
      <div v-if="selectedDay && selectedMealType" class="text-center pt-4">
        <button
          @click="confirmAddToPlanning"
          class="px-8 py-4 bg-primary-600 text-white hover:bg-primary-700 rounded-lg transition-colors duration-200 font-medium text-xl"
        >
          Ajouter au planning
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { computed, watch, ref } from 'vue'
const recipesStore = useRecipesStore()
const shoppingStore = useShoppingStore()
const authStore = useAuthStore()
const planningStore = usePlanningStore()
const route = useRoute()

const recipeId = computed(() => route.params.id)
const recipe = computed(() => recipesStore.recipes.find(r => r.id === recipeId.value))

// Console log de la recette pour debug
watch(recipe, (newRecipe) => {
  if (newRecipe) {
    console.log('Recette chargée:', newRecipe)
  }
}, { immediate: true })

// Sections avec ingrédients (pour l'affichage organisé)
const sectionsWithIngredients = computed(() => {
  if (!recipe.value?.sections || recipe.value.sections.length === 0) return []
  
  return recipe.value.sections
    .filter(section => 
      section.ingredients && 
      Array.isArray(section.ingredients) && 
      section.ingredients.length > 0
    )
    .sort((a, b) => a.orderIndex - b.orderIndex)
})

// Sections avec instructions (pour l'affichage organisé)
const sectionsWithInstructions = computed(() => {
  if (!recipe.value?.sections || recipe.value.sections.length === 0) return []
  
  return recipe.value.sections
    .filter(section => 
      section.instructions && 
      Array.isArray(section.instructions) && 
      section.instructions.length > 0
    )
    .sort((a, b) => a.orderIndex - b.orderIndex)
})

// Fonction pour formater un ingrédient
const formatIngredient = (ingredient) => {
  let formatted = ''
  if (ingredient.amount) {
    formatted += ingredient.amount + ' '
  }
  if (ingredient.unit) {
    formatted += ingredient.unit + ' '
  }
  formatted += ingredient.name
  return formatted
}

// Calculer le temps total (prepTime + cookTime) seulement si les deux sont non-nuls
const totalTime = computed(() => {
  if (!recipe.value) return null
  
  const prepTime = recipe.value.prepTime
  const cookTime = recipe.value.cookTime
  
  // Si prepTime est une string, retourner null (format non supporté)
  if (typeof prepTime === 'string') return null
  
  // Si les deux temps sont null ou undefined, retourner null
  if ((prepTime === null || prepTime === undefined) && (cookTime === null || cookTime === undefined)) {
    return null
  }
  
  // Calculer le total en utilisant 0 pour les valeurs null/undefined
  const prep = prepTime || 0
  const cook = cookTime || 0
  const total = prep + cook
  
  // Retourner null si le total est 0 (aucun temps renseigné)
  return total > 0 ? total : null
})

// Recipe editing and deletion
const showRecipeEditor = ref(false)
const editingRecipe = ref(null)
const showDeleteModal = ref(false)
const recipeToDelete = ref(null)

// Planning modal
const showPlanningModal = ref(false)
const planningCurrentWeek = ref(new Date())
const selectedDay = ref(null)
const selectedMealType = ref(null)

// Shopping modal
const showShoppingModal = ref(false)
const selectedSections = ref([])

const categoryName = computed(() => {
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
  return map[recipe.value?.category] || recipe.value?.category || ''
})

// Planning computed properties
const planningWeekDays = computed(() => {
  const days = []
  const startOfWeek = new Date(planningCurrentWeek.value)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1) // Monday

  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + i)
    const dateString = date.toISOString().split('T')[0]
    
    // Récupérer les repas existants pour ce jour
    const existingMeals = planningStore.getDayMeals(dateString)
    
    days.push({
      date: date,
      dateString: dateString,
      name: date.toLocaleDateString('fr-FR', { weekday: 'long' }),
      meals: existingMeals
    })
  }
  
  return days
})

const { $toast } = useNuxtApp()

// Computed delete confirmation message
const deleteConfirmMessage = computed(() => {
  if (!recipeToDelete.value) return ''
  return `Êtes-vous sûr de vouloir supprimer la recette "${recipeToDelete.value.title}" ? Cette action est irréversible.`
})

const closeShoppingModal = () => {
  showShoppingModal.value = false
  selectedSections.value = []
}

// Sélectionner toutes les sections par défaut quand le modal s'ouvre
watch(showShoppingModal, (isOpen) => {
  if (isOpen && recipe.value && recipe.value.sections && sectionsWithIngredients.value.length > 0) {
    selectedSections.value = sectionsWithIngredients.value.map((section, index) => section.id || index.toString())
  }
})

const selectAllSections = () => {
  if (!recipe.value || !recipe.value.sections) return
  selectedSections.value = sectionsWithIngredients.value.map((section, index) => section.id || index.toString())
}

const deselectAllSections = () => {
  selectedSections.value = []
}

const confirmAddToShoppingList = async () => {
  if (!recipe.value) return
  
  let ingredients = []
  
  // Si des sections existent et sont sélectionnées
  if (recipe.value.sections && recipe.value.sections.length > 0 && selectedSections.value.length > 0) {
    // Récupérer les ingrédients des sections sélectionnées
    sectionsWithIngredients.value.forEach((section, index) => {
      const sectionKey = section.id || index.toString()
      if (selectedSections.value.includes(sectionKey)) {
        section.ingredients.forEach(ingredient => {
          ingredients.push({
            name: ingredient.name,
            amount: ingredient.amount || null,
            unit: ingredient.unit || null,
            recipeId: recipe.value.id
          })
        })
      }
    })
  } else if (recipe.value.ingredients && recipe.value.ingredients.length > 0) {
    // Ancien format : utiliser tous les ingrédients
    ingredients = recipe.value.ingredients.map(ingredient => ({
      name: ingredient.name,
      amount: ingredient.amount || null,
      unit: ingredient.unit || null,
      recipeId: recipe.value.id
    }))
  }
  
  if (ingredients.length === 0) {
    $toast.error(
      'Erreur !',
      'Aucun ingrédient sélectionné',
      3000
    )
    return
  }
  
  try {
    // Utiliser la nouvelle méthode qui vérifie toutes les listes
    await shoppingStore.addIngredientsToLists(ingredients)
    
    // Afficher un toast de confirmation
    $toast.success(
      'Recette ajoutée !',
      `${ingredients.length} ingrédient${ingredients.length > 1 ? 's' : ''} ajouté${ingredients.length > 1 ? 's' : ''} à votre liste de courses`,
      3000
    )
    
    closeShoppingModal()
  } catch (error) {
    console.error('Erreur lors de l\'ajout à la liste de courses:', error)
    $toast.error(
      'Erreur !',
      'Impossible d\'ajouter la recette à la liste de courses. Veuillez réessayer.',
      3000
    )
  }
}

const addToPlanning = () => {
  if (!recipe.value) return
  
  // Ouvrir la modale de planning
  showPlanningModal.value = true
  // Aller à la semaine actuelle
  planningCurrentWeek.value = new Date()
}

// Planning modal methods
const closePlanningModal = () => {
  showPlanningModal.value = false
  selectedDay.value = null
  selectedMealType.value = null
}

const selectDayAndMeal = (dateString, mealType) => {
  selectedDay.value = dateString
  selectedMealType.value = mealType
}

const confirmAddToPlanning = () => {
  if (!recipe.value || !selectedDay.value || !selectedMealType.value) return
  
  // Sauvegarder les valeurs avant de fermer la modale
  const selectedDayValue = selectedDay.value
  const selectedMealTypeValue = selectedMealType.value
  
  // Formater la date pour l'affichage
  const dateObj = new Date(selectedDayValue)
  const formattedDate = dateObj.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })
  
  // Ajouter la recette au planning
  const planningStore = usePlanningStore()
  planningStore.addMeal(selectedDayValue, selectedMealTypeValue, recipe.value)
  
  // Fermer la modale
  closePlanningModal()
  
  // Afficher un toast de confirmation
  $toast.success(
    'Recette ajoutée !',
    `${recipe.value.title} a été ajoutée au planning du ${formattedDate} (${selectedMealTypeValue === 'lunch' ? 'déjeuner' : 'dîner'})`,
    3000
  )
}

// Navigation des semaines
const previousWeek = () => {
  const newDate = new Date(planningCurrentWeek.value)
  newDate.setDate(newDate.getDate() - 7)
  planningCurrentWeek.value = newDate
}

const nextWeek = () => {
  const newDate = new Date(planningCurrentWeek.value)
  newDate.setDate(newDate.getDate() + 7)
  planningCurrentWeek.value = newDate
}

const goToCurrentWeek = () => {
  planningCurrentWeek.value = new Date()
}

// Date formatting functions
const formatWeekStart = (date) => {
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

const formatDate = (date) => {
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short'
  })
}

const isToday = (date) => {
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

const printRecipe = () => {
  if (!recipe.value) return
  
  const printWindow = window.open('', '_blank')
  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${recipe.value.title} - Recettes des Boultons</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 5px; 
          line-height: 1.8; 
          max-width: 800px; 
          margin-left: 50px; 
          margin-right: auto; 
        }
        h1 { 
          color: #1e40af; 
          font-size: 32px; 
          text-align: center; 
          font-weight: bold;
        }
        h2 { 
          color: #374151; 
          font-size: 24px; 
          text-align: center;
          font-weight: bold;
        }
        h3 { 
          color: #4b5563; 
          font-size: 18px; 
          font-weight: bold;
          margin-top: 20px;
          margin-bottom: 10px;
          margin-left: 50px;
        }
        .recipe-info { 
          background: #f3f4f6; 
          padding: 20px; 
          border-radius: 12px; 
          text-align: center;
          font-size: 11px;
        }
        .recipe-info span { 
          margin-right: 25px; 
          font-weight: 500;
        }
        .tags { 
          margin: 25px 0; 
          text-align: center;
        }
        .tag { 
          background: #e5e7eb; 
          padding: 8px 16px; 
          border-radius: 20px; 
          font-size: 14px; 
          margin-right: 12px; 
          font-weight: 500;
        }
        ul { 
          margin-left: 50px; 
          font-size: 11px;
        }
        ol { 
          margin-left: 50px; 
          font-size: 11px;
        }
        li { 
          line-height: 1.8;
        }
        .header { 
          text-align: center; 
        }
        .header p {
          font-size: 18px;
          color: #6b7280;
        }
        .footer {
          margin-top: 50px; 
          text-align: center; 
          font-size: 12px; 
          color: #6b7280;
          border-top: 2px solid #e5e7eb;
          padding-top: 20px;
        }
        @media print { 
          body { 
            font-size: 11px;
          } 
          h1 { font-size: 28px; }
          h2 { font-size: 14px; }
          h3 { font-size: 12px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${recipe.value.title}</h1>
      </div>
      
      <div class="recipe-info">
        <span><strong>Catégorie :</strong> ${categoryName.value}</span>
        ${totalTime.value !== null ? `<span><strong>Temps :</strong> ${totalTime.value} min</span>` : ''}
        ${recipe.value.servings !== null && recipe.value.servings !== undefined ? `<span><strong>Portions :</strong> ${recipe.value.servings} pers.</span>` : ''}
      </div>
      
      <h2>Ingrédients</h2>
      ${recipe.value.sections && sectionsWithIngredients.value.length > 0 ? 
        sectionsWithIngredients.value.map(section => `
          ${section.name && section.name.trim() ? `<h3>${section.name}</h3>` : ''}
          <ul>
            ${section.ingredients.map(ingredient => 
              `<li>${formatIngredient(ingredient)}</li>`
            ).join('')}
          </ul>
        `).join('') :
        `<ul>
          ${recipe.value.ingredients ? recipe.value.ingredients.map(ingredient => 
            `<li>${ingredient.amount ? ingredient.amount + ' ' : ''}${ingredient.unit ? ingredient.unit + ' ' : ''}${ingredient.name}</li>`
          ).join('') : ''}
        </ul>`
      }
      
      <h2>Instructions</h2>
      ${recipe.value.sections && sectionsWithInstructions.value.length > 0 ? 
        sectionsWithInstructions.value.map(section => `
          ${section.name && section.name.trim() ? `<h3>${section.name}</h3>` : ''}
          <ol>
            ${section.instructions.map(instruction => 
              `<li>${typeof instruction === 'string' ? instruction : instruction.content || ''}</li>`
            ).join('')}
          </ol>
        `).join('') :
        `<ol>
          ${recipe.value.instructions ? recipe.value.instructions.map(step => `<li>${typeof step === 'string' ? step : step.content || ''}</li>`).join('') : ''}
        </ol>`
      }
      
      ${recipe.value.notes && recipe.value.notes.trim() ? `
      <h2 style="margin-top: 50px;">Notes et conseils</h2>
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 25px 0;">
        <p style="color: #1e40af; margin: 0; line-height: 1.8;">${recipe.value.notes}</p>
      </div>
      ` : ''}
      
      <div class="footer">
        Recettes des Boultons
      </div>
    </body>
    </html>
  `
  
  printWindow.document.write(printContent)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  printWindow.close()
}

// Recipe editing methods
const editRecipe = () => {
  editingRecipe.value = recipe.value
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
const confirmDeleteRecipe = () => {
  recipeToDelete.value = recipe.value
  showDeleteModal.value = true
}

const deleteRecipe = async () => {
  if (recipeToDelete.value) {
    try {
      await recipesStore.deleteRecipe(recipeToDelete.value.id)
      closeDeleteModal()
      $toast.success('Succès', 'Recette supprimée avec succès !', 3000)
      // Redirect to recipes list after deletion
      navigateTo('/recettes')
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
  title: () => recipe.value ? `${recipe.value.title} - Recettes des Boultons` : 'Recette introuvable',
  meta: [
    { name: 'description', content: () => recipe.value ? recipe.value.description : 'Recette non trouvée.' }
  ]
})
</script> 