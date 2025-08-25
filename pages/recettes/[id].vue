<template>
  <!-- Boutons d'action -->
  <div class="mb-6 flex flex-col gap-4">
    <!-- Première ligne : bouton retour et boutons principaux -->
    <div class="flex items-center justify-between">
      <button @click="$router.back()" class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors">
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Retour
      </button>
      <div class="flex items-center gap-4">
        <!-- Bouton d'ajout à la liste de courses - visible pour tous -->
        <button 
          v-if="recipe"
          @click="addToShoppingList" 
          class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
          </svg>
          Ajouter à la liste de courses
        </button>
        <!-- Bouton d'ajout au planning - visible pour tous -->
        <button 
          v-if="recipe"
          @click="addToPlanning" 
          class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          Ajouter au planning
        </button>
        <!-- Bouton d'impression - visible pour tous -->
        <button 
          v-if="recipe"
          @click="printRecipe" 
          class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
          </svg>
          Imprimer
        </button>
      </div>
    </div>
    
    <!-- Deuxième ligne : boutons d'administration -->
    <div v-if="recipe && authStore.isAdmin" class="flex items-center justify-end gap-4">
      <!-- Bouton d'édition - visible uniquement pour les admins -->
      <button 
        @click="editRecipe" 
        class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors"
        title="Modifier la recette"
      >
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
        </svg>
        Modifier
      </button>
      <!-- Bouton de suppression - visible uniquement pour les admins -->
      <button 
        @click="confirmDeleteRecipe" 
        class="flex items-center text-red-600 hover:text-red-800 font-medium transition-colors"
        title="Supprimer la recette"
      >
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
        </svg>
        Supprimer
      </button>
    </div>
  </div>
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
          <span><strong>Temps :</strong> {{
            typeof(recipe.prepTime) === 'string' ? recipe.prepTime : recipe.prepTime + recipe.cookTime + ' min'}}</span>          <span><strong>Portions :</strong> {{ recipe.servings }} pers.</span>
        </div>
        <!-- Tags -->
        <div class="flex flex-wrap gap-2 mb-2">
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

    <!-- Notes -->
    <div v-if="recipe.notes && recipe.notes.trim()" class="mb-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-4">Notes et conseils</h2>
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div class="flex items-start">
          <svg class="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-blue-800 whitespace-pre-wrap">{{ recipe.notes }}</p>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="text-center py-16">
    <h2 class="text-2xl font-semibold text-gray-900 mb-4">Recette introuvable</h2>
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

  <!-- Planning Modal -->
  <div v-if="showPlanningModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-xl p-8 max-w-6xl w-full mx-8 max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-2xl font-semibold text-gray-900">
          Ajouter "{{ recipe?.title }}" au planning
        </h3>
        <button
          @click="closePlanningModal"
          class="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors"
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
      <div class="grid grid-cols-7 gap-6 mb-6">
        <div
          v-for="day in planningWeekDays"
          :key="`header-${day.dateString}`"
          class="text-center min-w-[120px]"
        >
          <div class="text-base font-medium text-gray-900 mb-2">{{ day.name }}</div>
          <div 
            class="text-sm px-3 py-1.5 rounded-lg transition-colors duration-200 font-medium"
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
        <div class="grid grid-cols-7 gap-6">
          <div
            v-for="day in planningWeekDays"
            :key="`lunch-${day.dateString}`"
            class="text-center min-w-[120px]"
          >
            <button
              @click="selectDayAndMeal(day.dateString, 'lunch')"
              class="w-full p-3 text-sm bg-green-100 text-green-700 hover:bg-green-200 rounded-lg transition-colors duration-200 font-medium relative"
              :class="{ 'bg-green-200 border-2 border-green-400': selectedDay === day.dateString && selectedMealType === 'lunch' }"
            >
              Déjeuner
              <span 
                v-if="day.meals.lunch && day.meals.lunch.length > 0" 
                class="absolute -top-1 -right-1 bg-green-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center"
              >
                {{ day.meals.lunch.length }}
              </span>
            </button>
            <!-- Repas existants pour le déjeuner -->
            <div v-if="day.meals.lunch && day.meals.lunch.length > 0" class="mt-2 space-y-1">
              <div 
                v-for="meal in day.meals.lunch" 
                :key="meal.id" 
                class="text-xs text-gray-500 px-2 py-1 truncate"
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
        <div class="grid grid-cols-7 gap-6">
          <div
            v-for="day in planningWeekDays"
            :key="`dinner-${day.dateString}`"
            class="text-center min-w-[120px]"
          >
            <button
              @click="selectDayAndMeal(day.dateString, 'dinner')"
              class="w-full p-3 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors duration-200 font-medium relative"
              :class="{ 'bg-blue-200 border-2 border-blue-400': selectedDay === day.dateString && selectedMealType === 'dinner' }"
            >
              Dîner
              <span 
                v-if="day.meals.dinner && day.meals.dinner.length > 0" 
                class="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center"
              >
                {{ day.meals.dinner.length }}
              </span>
            </button>
            <!-- Repas existants pour le dîner -->
            <div v-if="day.meals.dinner && day.meals.dinner.length > 0" class="mt-2 space-y-1">
              <div 
                v-for="meal in day.meals.dinner" 
                :key="meal.id" 
                class="text-xs text-gray-500 px-2 py-1 truncate"
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
import { computed } from 'vue'
const recipesStore = useRecipesStore()
const shoppingStore = useShoppingStore()
const authStore = useAuthStore()
const planningStore = usePlanningStore()
const route = useRoute()

const recipeId = computed(() => route.params.id)
const recipe = computed(() => recipesStore.recipes.find(r => r.id === recipeId.value))

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

const addToShoppingList = () => {
  if (!recipe.value) return
  
  // Préparer les ingrédients avec les informations nécessaires
  const ingredients = recipe.value.ingredients.map(ingredient => ({
    name: ingredient.name,
    amount: ingredient.amount,
    unit: ingredient.unit,
    recipeId: recipe.value.id
  }))
  
  // Utiliser la nouvelle méthode qui vérifie toutes les listes
  shoppingStore.addIngredientsToLists(ingredients)
  
  // Afficher un toast de confirmation
  $toast.success(
    'Recette ajoutée !',
    `${recipe.value.title} a été ajoutée à votre liste de courses`,
    3000
  )
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
          margin-left: auto; 
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
          margin-left: 30px; 
          font-size: 11px;
        }
        ol { 
          margin-left: 30px; 
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
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${recipe.value.title}</h1>
      </div>
      
      <div class="recipe-info">
        <span><strong>Catégorie :</strong> ${categoryName.value}</span>
        <span><strong>Temps :</strong> ${
          typeof(recipe.value.prepTime) === 'string' ? recipe.value.prepTime : recipe.value.prepTime + recipe.value.cookTime} min</span>
        <span><strong>Portions :</strong> ${recipe.value.servings} pers.</span>
      </div>
      
      <h2>Ingrédients</h2>
      <ul>
        ${recipe.value.ingredients.map(ingredient => 
          `<li>${ingredient.amount ? ingredient.amount + ' ' : ''}${ingredient.unit ? ingredient.unit + ' ' : ''}${ingredient.name}</li>`
        ).join('')}
      </ul>
      
      <h2>Instructions</h2>
      <ol>
        ${recipe.value.instructions.map(step => `<li>${step}</li>`).join('')}
      </ol>
      
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