<template>
  <div>
    <!-- Vérification de l'authentification -->
    <div v-if="!authStore.isAuthenticated">
      <AuthRequired @login="showLoginModal = true" />
      <AuthModal 
        :is-open="showLoginModal" 
        @close="showLoginModal = false"
        @success="handleLoginSuccess"
      />
      <ToastContainer ref="toastContainer" />
      <Toast />
    </div>

    <!-- Contenu pour utilisateurs connectés -->
    <div v-else>
      <!-- Header -->
      <div class="mb-6">
        <!-- Bouton imprimer - au-dessus sur mobile, à droite sur desktop -->
        <div class="flex justify-end mb-3 sm:mb-0">
          <button 
            @click="printPlanning" 
            class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors px-3 py-2 rounded-lg hover:bg-primary-50"
          >
            <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 002 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
            </svg>
            <span class="text-sm sm:text-base">Imprimer</span>
          </button>
        </div>
        
        <!-- Titre centré -->
        <div class="text-center">
          <h1 class="text-2xl sm:text-3xl font-lobster text-gray-900">
            Planning hebdomadaire
          </h1>
        </div>
      </div>

      <!-- Week Navigation -->
      <div class="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div class="flex justify-between items-center">
          <button
            @click="previousWeek"
            class="p-1.5 text-gray-600 hover:text-primary-600 transition-colors duration-200"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
            </svg>
          </button>
          
          <div class="flex flex-col items-center">
            <h2 class="text-lg font-semibold text-gray-900">
              Semaine du {{ formatWeekStart(currentWeek) }}
            </h2>
            <button
              @click="goToCurrentWeek"
              class="mt-2 px-3 py-1.5 text-sm bg-primary-100 text-primary-700 hover:bg-primary-200 rounded-lg transition-colors duration-200 font-medium"
            >
            Revenir à la semaine actuelle
            </button>
          </div>
          
          <button
            @click="nextWeek"
            class="p-1.5 text-gray-600 hover:text-primary-600 transition-colors duration-200"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- Weekly Grid -->
      <div class="space-y-6">
        <!-- En-tête des jours -->
        <div class="bg-white rounded-xl shadow-sm p-4">
          <div class="grid grid-cols-1 lg:grid-cols-7 gap-2">
            <div
              v-for="day in weekDays"
              :key="`header-${day.date}`"
              class="text-center"
            >
              <h3 class="font-semibold text-gray-900 text-sm">{{ day.name }}</h3>
              <p 
                class="text-xs px-3 py-1.5 rounded-lg transition-colors duration-200 font-medium"
                :class="isToday(day.date) 
                  ? 'bg-primary-100 text-primary-700' 
                  : 'text-gray-500'"
              >
                {{ formatDate(day.date) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Ligne des déjeuners -->
        <div class="bg-white rounded-xl shadow-sm p-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 text-center">Déjeuners</h3>
          <div class="grid grid-cols-1 lg:grid-cols-7 gap-0 divide-x divide-gray-200">
            <div
              v-for="(day, index) in weekDays"
              :key="`lunch-${day.date}`"
              class="min-h-[120px] px-3 first:pl-0 last:pr-0"
            >
              <!-- Liste des recettes du déjeuner -->
              <div v-if="day.meals.lunch && day.meals.lunch.length > 0" class="space-y-2 mb-3">
                <div 
                  v-for="meal in day.meals.lunch" 
                  :key="meal.id" 
                  class="flex items-center justify-between p-1.5 bg-gray-50 rounded-lg cursor-move hover:bg-gray-100 transition-colors"
                  draggable="true"
                  @dragstart="onDragStart($event, day.dateString, 'lunch', meal)"
                  @dragend="onDragEnd"
                >
                  <div class="flex-1 min-w-0">
                    <span class="text-xs text-gray-900 truncate block" :title="meal.recipe?.title || 'Recette sans nom'">{{ meal.recipe?.title || 'Recette sans nom' }}</span>
                  </div>
                  <div class="flex items-center space-x-1 ml-2">
                    <!-- Supprimer cette recette -->
                    <button
                      @click="removeMeal(day.date, 'lunch', meal.id)"
                      class="text-red-500 hover:text-red-700 text-xs p-0.5"
                      title="Supprimer cette recette"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Bouton pour ajouter une recette -->
              <div
                class="w-full min-h-[40px] flex items-center justify-center drop-zone"
                @dragover="onDragOver($event, day.dateString, 'lunch')"
                @drop="onDrop($event, day.dateString, 'lunch')"
                @dragenter="onDragEnter($event)"
                @dragleave="onDragLeave($event)"
              >
                <div class="flex flex-col space-y-2 w-full">
                  <button
                    @click="openMealSelector(day.date, 'lunch')"
                    class="w-full text-xs text-gray-500 hover:text-primary-600 border-2 border-dashed border-gray-300 rounded-lg py-1.5 hover:border-primary-300 transition-colors duration-200"
                  >
                    + Ajouter une recette
                  </button>
                  <button
                    @click="openCustomMealInput(day.date, 'lunch')"
                    class="w-full text-xs text-gray-400 hover:text-primary-600 border border-dashed border-gray-200 rounded-lg py-1 hover:border-primary-300 transition-colors duration-200"
                  >
                    + Ajouter autre
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Ligne des dîners -->
        <div class="bg-white rounded-xl shadow-sm p-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 text-center">Dîners</h3>
          <div class="grid grid-cols-1 lg:grid-cols-7 gap-0 divide-x divide-gray-200">
            <div
              v-for="(day, index) in weekDays"
              :key="`dinner-${day.date}`"
              class="min-h-[120px] px-3 first:pl-0 last:pr-0"
            >
              <!-- Liste des recettes du dîner -->
              <div v-if="day.meals.dinner && day.meals.dinner.length > 0" class="space-y-2 mb-3">
                <div 
                  v-for="meal in day.meals.dinner" 
                  :key="meal.id" 
                  class="flex items-center justify-between p-1.5 bg-gray-50 rounded-lg cursor-move hover:bg-gray-100 transition-colors"
                  draggable="true"
                  @dragstart="onDragStart($event, day.dateString, 'dinner', meal)"
                  @dragend="onDragEnd"
                >
                  <div class="flex-1 min-w-0">
                    <span class="text-xs text-gray-900 truncate block" :title="meal.recipe?.title || 'Recette sans nom'">{{ meal.recipe?.title || 'Recette sans nom' }}</span>
                  </div>
                  <div class="flex items-center space-x-1 ml-2">
                    <!-- Supprimer cette recette -->
                    <button
                      @click="removeMeal(day.date, 'dinner', meal.id)"
                      class="text-red-500 hover:text-red-700 text-xs p-0.5"
                      title="Supprimer cette recette"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Bouton pour ajouter une recette -->
              <div
                class="w-full min-h-[40px] flex items-center justify-center drop-zone"
                @dragover="onDragOver($event, day.dateString, 'dinner')"
                @drop="onDrop($event, day.dateString, 'dinner')"
                @dragenter="onDragEnter($event)"
                @dragleave="onDragLeave($event)"
              >
                <div class="flex flex-col space-y-2 w-full">
                  <button
                    @click="openMealSelector(day.date, 'dinner')"
                    class="w-full text-xs text-gray-500 hover:text-primary-600 border-2 border-dashed border-gray-300 rounded-lg py-1.5 hover:border-primary-300 transition-colors duration-200"
                  >
                    + Ajouter une recette
                  </button>
                  <button
                    @click="openCustomMealInput(day.date, 'dinner')"
                    class="w-full text-xs text-gray-400 hover:text-primary-600 border border-dashed border-gray-200 rounded-lg py-1 hover:border-primary-300 transition-colors duration-200"
                  >
                    + Ajouter autre
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Notes générales pour la semaine -->
        <div class="bg-white rounded-xl shadow-sm p-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 text-center">Notes</h3>
          <div class="grid grid-cols-1 lg:grid-cols-7 gap-0 divide-x divide-gray-200">
            <div
              v-for="(day, index) in weekDays"
              :key="`notes-${day.date}`"
              class="px-3 first:pl-0 last:pr-0"
            >
              <!-- Notes du jour -->
              <div class="space-y-2">
                <!-- Mode affichage -->
                <div v-if="editingDayNotes !== day.dateString" class="min-h-[100px]">
                  <div v-if="day.meals.notes" class="text-xs text-gray-700 bg-gray-50 p-2 rounded border min-h-[80px]">
                    {{ day.meals.notes }}
                  </div>
                  <button
                    @click="startEditingDayNotes(day.date, day.meals.notes || '')"
                    class="w-full mt-2 text-xs text-gray-400 hover:text-primary-600 border border-dashed border-gray-200 rounded-lg py-2 hover:border-primary-300 transition-colors duration-200"
                  >
                    {{ day.meals.notes ? 'Modifier' : '+ Ajouter une note' }}
                  </button>
                </div>
                
                <!-- Mode édition -->
                <div v-else class="space-y-2">
                  <textarea
                    v-model="editingDayNotesValue"
                    placeholder="Notes du jour..."
                    class="w-full text-xs border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                    rows="4"
                  ></textarea>
                  <div class="flex space-x-1">
                    <button
                      @click="saveDayNotes(day.date)"
                      class="text-green-600 hover:text-green-700 transition-colors duration-200 p-1"
                      title="Sauvegarder"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                    </button>
                    <button
                      @click="cancelDayNotes()"
                      class="text-red-500 hover:text-red-700 transition-colors duration-200 p-1"
                      title="Annuler"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Meal Selector Modal -->
      <div v-if="showMealSelector" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
          <div class="flex justify-between items-center mb-6">
            <h3 class="text-2xl font-semibold text-gray-900">
              Choisir une recette
            </h3>
            <button
              @click="closeMealSelector"
              class="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <!-- Search Bar -->
          <div class="mb-6">
            <div class="relative">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Rechercher une recette..."
                class="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg"
              >
              <svg class="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>
          </div>

          <!-- Recipe Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="recipe in filteredRecipes"
              :key="recipe.id"
              @click="selectMeal(recipe)"
              class="p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 hover:border-primary-300 transition-all duration-200 hover:shadow-md"
            >
              <div class="flex flex-col space-y-3">
                <NuxtImg
                  :src="recipe.image"
                  :alt="recipe.title"
                  class="w-full h-32 object-cover rounded-lg"
                />
                <div class="flex-1">
                  <h4 class="font-medium text-gray-900 text-lg mb-2">{{ recipe.title }}</h4>
                  <div class="flex items-center justify-between text-sm text-gray-500 mb-2">
                    <span>⏱️ {{ recipe.prepTime + recipe.cookTime }} min</span>
                    <span v-if="recipe.category" class="px-2 py-1 bg-gray-100 rounded-full text-xs">
                      {{ recipe.category }}
                    </span>
                  </div>
                  <!-- Tags -->
                  <div v-if="recipe.tags && recipe.tags.length > 0" class="flex flex-wrap gap-1">
                    <span
                      v-for="tag in recipe.tags"
                      :key="tag"
                      class="px-2 py-1 text-xs rounded-full"
                      :class="{
                        'bg-green-500 text-white': tag === 'végétarien',
                        'bg-emerald-600 text-white': tag === 'vegan',
                        'bg-gray-100 text-gray-600': tag !== 'végétarien' && tag !== 'vegan'
                      }"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- No Results Message -->
          <div v-if="filteredRecipes.length === 0" class="text-center py-8">
            <p class="text-gray-500 text-lg mb-4">Aucune recette trouvée pour "{{ searchQuery }}"</p>
            <button
              @click="addCustomMealFromSearch"
              class="px-6 py-3 bg-primary-600 text-white hover:bg-primary-700 rounded-lg transition-colors font-medium text-lg"
            >
              Ajouter "{{ searchQuery }}" au planning
            </button>
          </div>
        </div>
      </div>

      <!-- Custom Meal Input Modal -->
      <div v-if="showCustomMealInput" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
          <div class="flex justify-between items-center mb-6">
            <h3 class="text-2xl font-semibold text-gray-900">
              Ajouter un autre élément
            </h3>
            <button
              @click="closeCustomMealInput"
              class="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <form @submit.prevent="addCustomMeal" class="space-y-4">
            <div>
              <input
                id="customMealTitle"
                v-model="customMealTitle"
                type="text"
                placeholder="Ex: Un accompagnement, dessert..."
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg"
                required
                autofocus
              >
            </div>

            <div class="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                @click="closeCustomMealInput"
                class="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                class="px-4 py-2 bg-primary-600 text-white hover:bg-primary-700 rounded-lg transition-colors"
              >
                Ajouter
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Styles pour le drag and drop */
.drag-over {
  background-color: rgb(239 246 255);
  border-color: rgb(147 197 253);
}

.meal-dragging {
  opacity: 0.5;
  transform: scale(0.95);
}

.drop-zone {
  transition: all 0.2s ease-in-out;
}

.drop-zone:hover {
  background-color: rgb(248 250 252);
}
</style>

<script setup>
import AuthRequired from '@/components/AuthRequired.vue'
import AuthModal from '@/components/AuthModal.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import Toast from '@/components/Toast.vue'

const recipesStore = useRecipesStore()
const planningStore = usePlanningStore()
const authStore = useAuthStore()

// Reactive data
const currentWeek = ref(new Date())
const showMealSelector = ref(false)
const selectedDay = ref(null)
const selectedMealType = ref(null)

// Variables pour les notes du jour uniquement
const editingDayNotes = ref(null)
const editingDayNotesValue = ref('')
const searchQuery = ref('')

// Variables pour les éléments personnalisés
const showCustomMealInput = ref(false)
const customMealTitle = ref('')
const customMealNote = ref('')
const customMealDay = ref(null)
const customMealType = ref(null)

// Variables pour le drag and drop
const draggedMeal = ref(null)
const draggedFromDate = ref(null)
const draggedFromMealType = ref(null)
const dragOverTarget = ref(null)

// Variables pour l'authentification
const showLoginModal = ref(false)
const toastContainer = ref()

// Computed properties
const recipes = computed(() => recipesStore.recipes)

const filteredRecipes = computed(() => {
  if (!searchQuery.value.trim()) {
    return recipes.value
  }
  
  const query = searchQuery.value.toLowerCase().trim()
  return recipes.value.filter(recipe => 
    recipe.title.toLowerCase().includes(query) ||
    (recipe.category && recipe.category.toLowerCase().includes(query)) ||
    (recipe.tags && recipe.tags.some(tag => tag.toLowerCase().includes(query)))
  )
})

const weekDays = computed(() => {
  const days = []
  const startOfWeek = new Date(currentWeek.value)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1) // Monday

  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + i)
    const dateString = date.toISOString().split('T')[0]
    
    days.push({
      date: date,
      dateString: dateString,
      name: date.toLocaleDateString('fr-FR', { weekday: 'long' }),
      meals: planningStore.getDayMeals(dateString)
    })
  }
  
  return days
})

// Methods
const previousWeek = () => {
  const newDate = new Date(currentWeek.value)
  newDate.setDate(newDate.getDate() - 7)
  currentWeek.value = newDate
}

const nextWeek = () => {
  const newDate = new Date(currentWeek.value)
  newDate.setDate(newDate.getDate() + 7)
  currentWeek.value = newDate
}

const goToCurrentWeek = () => {
  currentWeek.value = new Date()
}

const openMealSelector = (date, mealType, prefillSearch = '') => {
  selectedDay.value = date
  selectedMealType.value = mealType
  if (prefillSearch) {
    searchQuery.value = prefillSearch
  }
  showMealSelector.value = true
}

const closeMealSelector = () => {
  showMealSelector.value = false
  selectedDay.value = null
  selectedMealType.value = null
  searchQuery.value = ''
}

// Fonctions de gestion des notes du jour uniquement
const startEditingDayNotes = (date, currentNotes = '') => {
  editingDayNotes.value = date.toISOString().split('T')[0]
  editingDayNotesValue.value = currentNotes
}

const saveDayNotes = async (date) => {
  const dateString = date.toISOString().split('T')[0]
  
  try {
    // Si le texte est vide ou null, supprimer la note
    if (!editingDayNotesValue.value || editingDayNotesValue.value.trim() === '') {
      const result = await planningStore.deleteDayNotes(dateString)
      
      if (result.success) {
        console.log('✅ Note du jour supprimée:', result.message)
        // Recharger le planning pour voir les changements
        await planningStore.loadPlanning()
      } else {
        console.error('❌ Erreur lors de la suppression:', result.error)
      }
    } else {
      // Appeler l'API pour créer ou modifier la note
      const result = await planningStore.updateDayNotes(dateString, editingDayNotesValue.value.trim())
      
      if (result.success) {
        console.log('✅ Note du jour sauvegardée:', result.message)
        // Recharger le planning pour voir les changements
        await planningStore.loadPlanning()
      } else {
        console.error('❌ Erreur lors de la sauvegarde:', result.error)
      }
    }
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde de la note:', error)
  } finally {
    // Toujours fermer le mode édition
    editingDayNotes.value = null
    editingDayNotesValue.value = ''
  }
}

const cancelDayNotes = () => {
  editingDayNotes.value = null
  editingDayNotesValue.value = ''
}

// Gérer la connexion réussie
const handleLoginSuccess = async () => {
  showLoginModal.value = false
  // Les données seront automatiquement rechargées par le layout
}

// Méthodes pour les éléments personnalisés
const openCustomMealInput = (date, mealType) => {
  customMealDay.value = date
  customMealType.value = mealType
  customMealTitle.value = ''
  customMealNote.value = ''
  showCustomMealInput.value = true
}

const closeCustomMealInput = () => {
  showCustomMealInput.value = false
  customMealDay.value = null
  customMealType.value = null
  customMealTitle.value = ''
  customMealNote.value = ''
}

const addCustomMeal = async () => {
  if (customMealDay.value && customMealType.value && customMealTitle.value.trim()) {
    const dateString = customMealDay.value.toISOString().split('T')[0]
    
    // Utiliser la nouvelle méthode du store pour les repas personnalisés
    const result = await planningStore.addCustomMeal(
      dateString, 
      customMealType.value, 
      customMealTitle.value.trim()
    )
    
    if (result.success) {
      closeCustomMealInput()
    } else {
      console.error('Erreur lors de l\'ajout du repas personnalisé:', result.error)
      // TODO: Afficher une notification d'erreur à l'utilisateur
    }
  }
}

const addCustomMealFromSearch = async () => {
  if (selectedDay.value && selectedMealType.value && searchQuery.value.trim()) {
    const dateString = selectedDay.value.toISOString().split('T')[0]
    
    // Utiliser la méthode du store pour les repas personnalisés
    const result = await planningStore.addCustomMeal(
      dateString, 
      selectedMealType.value, 
      searchQuery.value.trim()
    )
    
    if (result.success) {
      closeMealSelector()
    } else {
      console.error('Erreur lors de l\'ajout du repas personnalisé:', result.error)
      // TODO: Afficher une notification d'erreur à l'utilisateur
    }
  }
}

const selectMeal = (recipe) => {
  if (selectedDay.value && selectedMealType.value) {
    const dateString = selectedDay.value.toISOString().split('T')[0]
    planningStore.addMeal(dateString, selectedMealType.value, recipe)
  }
  
  closeMealSelector()
}

const removeMeal = (date, mealType, mealId) => {
  const dateString = date.toISOString().split('T')[0]
  planningStore.removeMeal(dateString, mealType, mealId)
}

// Méthodes pour le drag and drop
const onDragStart = (event, date, mealType, meal) => {
  draggedMeal.value = meal
  draggedFromDate.value = date
  draggedFromMealType.value = mealType
  
  // Ajouter un effet visuel au drag
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', meal.id)
  
  // Ajouter une classe CSS pour l'élément en cours de drag
  event.target.classList.add('meal-dragging')
}

const onDragEnd = (event) => {
  // Retirer la classe CSS
  event.target.classList.remove('meal-dragging')
  
  // Réinitialiser les variables
  draggedMeal.value = null
  draggedFromDate.value = null
  draggedFromMealType.value = null
  dragOverTarget.value = null
}

const onDragOver = (event, date, mealType) => {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

const onDrop = (event, toDate, toMealType) => {
  event.preventDefault()
  
  // Vérifier que nous avons une recette à déplacer
  if (!draggedMeal.value || !draggedFromDate.value || !draggedFromMealType.value) {
    return
  }
  
  // Vérifier que la destination est différente de la source
  if (draggedFromDate.value === toDate && draggedFromMealType.value === toMealType) {
    return
  }
  
  // Déplacer la recette
  const success = planningStore.moveMeal(
    draggedFromDate.value,
    draggedFromMealType.value,
    toDate,
    toMealType,
    draggedMeal.value.id
  )
  
  // Réinitialiser les variables
  draggedMeal.value = null
  draggedFromDate.value = null
  draggedFromMealType.value = null
  dragOverTarget.value = null
}

const onDragEnter = (event) => {
  event.preventDefault()
  // Ajouter un effet visuel pour indiquer que la zone accepte le drop
  event.currentTarget.classList.add('drag-over')
}

const onDragLeave = (event) => {
  event.preventDefault()
  // Retirer l'effet visuel
  event.currentTarget.classList.remove('drag-over')
}

const updateDayNotes = (date, notes) => {
  const dateString = date.toISOString().split('T')[0]
  planningStore.updateDayNotes(dateString, notes)
}

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

const printPlanning = () => {
  const printWindow = window.open('', '_blank')
  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Planning hebdomadaire - Recettes des Boultons</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 30px; 
          line-height: 1.6; 
          max-width: 1200px; 
          margin-left: auto; 
          margin-right: auto; 
        }
        h1 { 
          color: #1e40af; 
          font-size: 32px; 
          margin-bottom: 30px; 
          text-align: center; 
          font-weight: bold;
        }
        .section { 
          margin: 10px 0; 
          page-break-inside: avoid; 
        }
        .section-title { 
          font-size: 14px; 
          font-weight: bold; 
          color: #374151; 
          text-align: center; 
          margin-bottom: 0px; 
        }
        .week-grid { 
          display: grid; 
          grid-template-columns: repeat(7, 1fr); 
          gap: 0; 
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #e5e7eb;
        }
        .day-header {
          background: #f3f4f6;
          border-right: 1px solid #d1d5db;
          padding: 5px 10px;
          text-align: center;
          min-height: 60px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .day-header:last-child {
          border-right: none;
        }
        .day-name { 
          font-weight: bold; 
          color: #374151; 
          font-size: 16px;
          text-transform: capitalize;
        }
        .day-date { 
          font-size: 12px; 
          color: #6b7280; 
          margin-top: 0px;
        }
        .day-content {
          border-right: 1px solid #d1d5db;
          padding: 5px 10px;
          min-height: 120px;
          display: flex;
          flex-direction: column;
        }
        .day-content:last-child {
          border-right: none;
        }
        .day-content.notes {
          min-height: 100px;
        }
        .recipe-item {
          padding: 6px 8px;
          margin-bottom: 8px;
          background: #f9fafb;
          border-radius: 6px;
          border: 1px solid #e5e7eb;
        }
        .recipe-title {
          font-weight: 500;
          color: #374151;
          font-size: 13px;
        }
        .notes-content {
          min-height: 80px;
          padding: 8px;
          background: #f9fafb;
          border-radius: 6px;
          font-size: 11px;
          color: #6b7280;
        }
        .custom-meal {
          background-color: #e0f2fe; /* Couleur légère pour les éléments personnalisés */
          border: 1px dashed #90cdf4; /* Bordure légère pour les éléments personnalisés */
        }
        .custom-label {
          font-size: 10px;
          color: #3b82f6;
          font-weight: 500;
          margin-top: 2px;
        }
        .meal-note {
          font-size: 10px;
          color: #6b7280;
          margin-top: 4px;
        }
        @media print { 
          body { 
            margin: 15px; 
            font-size: 14px;
          } 
          h1 { font-size: 28px; }
          .section { margin: 10px 0; }
          .section-title { 
            font-size: 14px; 
            margin-bottom: 0px; 
          }
          .day-header {
            padding: 12px 8px;
            min-height: 50px;
          }
          .day-content {
            padding: 12px 8px;
            min-height: 100px;
          }
          .day-content.notes {
            min-height: 80px;
          }
          .day-name { font-size: 14px; }
          .day-date { font-size: 11px; }
          .recipe-item {
            padding: 4px 6px;
            margin-bottom: 6px;
          }
          .recipe-title { font-size: 12px; }
          .add-button {
            padding: 6px;
            font-size: 10px;
          }
          .notes-content {
            min-height: 60px;
            padding: 6px;
            font-size: 11px;
          }
          .footer {
            margin-top: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #6b7280;
            border-top: 2px solid #e5e7eb;
            padding-top: 20px;
        }
        }
      </style>
    </head>
    <body>
      <h1>Planning hebdomadaire</h1>
      
      <!-- En-tête des jours -->
      <div class="section">
        <div class="week-grid">
          ${weekDays.value.map(day => `
            <div class="day-header">
              <div class="day-name">${day.name}</div>
              <div class="day-date">${formatDate(day.date)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Ligne des déjeuners -->
      <div class="section">
        <div class="section-title">Déjeuners</div>
        <div class="week-grid">
          ${weekDays.value.map(day => `
            <div class="day-content">
              ${day.meals.lunch && day.meals.lunch.length > 0 ? `
                ${day.meals.lunch.map(meal => `
                  <div class="recipe-item ${meal.recipeId && meal.recipeId.startsWith('custom-') ? 'custom-meal' : ''}">
                    <div class="recipe-title">${meal.recipe?.title || 'Recette sans nom'}</div>
                  </div>
                `).join('')}
              ` : `
              `}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Ligne des dîners -->
      <div class="section">
        <div class="section-title">Dîners</div>
        <div class="week-grid">
          ${weekDays.value.map(day => `
            <div class="day-content">
              ${day.meals.dinner && day.meals.dinner.length > 0 ? `
                ${day.meals.dinner.map(meal => `
                  <div class="recipe-item ${meal.recipeId && meal.recipeId.startsWith('custom-') ? 'custom-meal' : ''}">
                    <div class="recipe-title">${meal.recipe?.title || 'Recette sans nom'}</div>
                  </div>
                `).join('')}
              ` : `
              `}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Notes générales pour la semaine -->
      <div class="section">
        <div class="section-title">Notes</div>
        <div class="week-grid">
          ${weekDays.value.map(day => `
            <div class="day-content notes">
              ${day.meals.notes ? `
                <div class="notes-content">${day.meals.notes}</div>
              ` : `
              `}
            </div>
          `).join('')}
        </div>
      </div>
            
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

// Gestion des paramètres de requête pour ajouter une recette
const route = useRoute()

// Watcher pour détecter les paramètres de requête
watch(() => route.query, (query) => {
  if (query.addRecipe && query.recipeTitle) {
    // Ouvrir automatiquement le sélecteur de recettes
    // sur le jour actuel (aujourd'hui) et pré-remplir la recherche
    const today = new Date()
    const todayString = today.toISOString().split('T')[0]
    
    // Trouver le jour actuel dans weekDays
    const todayIndex = weekDays.value.findIndex(day => day.dateString === todayString)
    if (todayIndex !== -1) {
      selectedDay.value = weekDays.value[todayIndex].date
      selectedMealType.value = 'lunch' // Par défaut, on met au déjeuner
      searchQuery.value = query.recipeTitle
      showMealSelector.value = true
    }
    
    // Nettoyer les paramètres de requête
    navigateTo({ path: '/planning', query: {} }, { replace: true })
  }
}, { immediate: true })

// Initialize
onMounted(() => {
  if (authStore.isAuthenticated) {
    planningStore.loadPlanning()
  }
})

// Surveiller les changements d'authentification
watch(() => authStore.isAuthenticated, async (isAuthenticated) => {
  if (isAuthenticated) {
    await planningStore.loadPlanning()
  }
})

// SEO
useHead({
  title: 'Planning hebdomadaire - Recettes des Boultons',
  meta: [
    { name: 'description', content: 'Organisez vos repas de la semaine. Planifiez vos menus et ne manquez plus rien !' }
  ]
})
</script> 