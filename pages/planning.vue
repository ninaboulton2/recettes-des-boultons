<template>
  <div>
          <!-- Header -->
      <div class="mb-6 relative">
        <div class="text-center mb-3">
          <h1 class="text-3xl font-lobster text-gray-900">
            Planning hebdomadaire
          </h1>
        </div>
        <button 
          @click="printPlanning" 
          class="absolute top-0 right-0 flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
          </svg>
          Imprimer
        </button>
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
        
        <h2 class="text-lg font-semibold text-gray-900">
          Semaine du {{ formatWeekStart(currentWeek) }}
        </h2>
        
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
            <p class="text-xs text-gray-500">{{ formatDate(day.date) }}</p>
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
              <div v-for="meal in day.meals.lunch" :key="meal.id" class="flex items-center justify-between p-1.5 bg-gray-50 rounded-lg">
                <div class="flex-1 min-w-0">
                  <span class="text-xs text-gray-900 truncate block" :title="meal.title">{{ meal.title }}</span>
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
            <button
              @click="openMealSelector(day.date, 'lunch')"
              class="w-full text-xs text-gray-500 hover:text-primary-600 border-2 border-dashed border-gray-300 rounded-lg py-1.5 hover:border-primary-300 transition-colors duration-200"
            >
              + Ajouter une recette
            </button>
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
              <div v-for="meal in day.meals.dinner" :key="meal.id" class="flex items-center justify-between p-1.5 bg-gray-50 rounded-lg">
                <div class="flex-1 min-w-0">
                  <span class="text-xs text-gray-900 truncate block" :title="meal.title">{{ meal.title }}</span>
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
            <button
              @click="openMealSelector(day.date, 'dinner')"
              class="w-full text-xs text-gray-500 hover:text-primary-600 border-2 border-dashed border-gray-300 rounded-lg py-1.5 hover:border-primary-300 transition-colors duration-200"
            >
              + Ajouter une recette
            </button>
          </div>
        </div>
      </div>

      <!-- Notes générales pour la semaine -->
      <div class="bg-white rounded-xl shadow-sm p-4">
        <h3 class="text-lg font-semibold text-gray-900 mb-4 text-center">Notes de la semaine</h3>
        <div class="grid grid-cols-1 lg:grid-cols-7 gap-0 divide-x divide-gray-200">
          <div
            v-for="(day, index) in weekDays"
            :key="`notes-${day.date}`"
            class="min-h-[120px] px-3 first:pl-0 last:pr-0"
          >
            <!-- Notes du jour -->
            <div class="h-full">
              <textarea
                v-model="day.meals.notes"
                placeholder="Notes du jour..."
                class="w-full h-full min-h-[100px] p-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                @input="updateDayNotes(day.date, $event.target.value)"
              ></textarea>
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
              <img
                :src="recipe.image"
                :alt="recipe.title"
                class="w-full h-32 object-cover rounded-lg"
              >
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
          <p class="text-gray-500 text-lg">Aucune recette trouvée pour "{{ searchQuery }}"</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const recipesStore = useRecipesStore()
const planningStore = usePlanningStore()

// Reactive data
const currentWeek = ref(new Date())
const showMealSelector = ref(false)
const selectedDay = ref(null)
const selectedMealType = ref(null)
const editingNote = ref(null)
const editingNoteValue = ref('')

const editingDayNotes = ref(null)
const editingDayNotesValue = ref('')
const searchQuery = ref('')

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
  currentWeek.value.setDate(currentWeek.value.getDate() - 7)
}

const nextWeek = () => {
  currentWeek.value.setDate(currentWeek.value.getDate() + 7)
}

const openMealSelector = (date, mealType) => {
  selectedDay.value = date
  selectedMealType.value = mealType
  showMealSelector.value = true
}

const closeMealSelector = () => {
  showMealSelector.value = false
  selectedDay.value = null
  selectedMealType.value = null
  searchQuery.value = ''
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

const startEditingNote = (date, mealType, currentNote = '') => {
  editingNote.value = `${date.toISOString().split('T')[0]}-${mealType}`
  editingNoteValue.value = currentNote
}

const saveNote = (date, mealType, mealId) => {
  const dateString = date.toISOString().split('T')[0]
  planningStore.updateMealNote(dateString, mealType, mealId, editingNoteValue.value)
  editingNote.value = null
}

const cancelNoteEdit = () => {
  editingNote.value = null
}



const startEditingDayNotes = (date, currentNotes = '') => {
  editingDayNotes.value = date.toISOString().split('T')[0]
  editingDayNotesValue.value = currentNotes
}

const saveDayNotes = (date) => {
  const dateString = date.toISOString().split('T')[0]
  planningStore.updateDayNotes(dateString, editingDayNotesValue.value)
  editingDayNotes.value = null
}

const cancelDayNotesEdit = () => {
  editingDayNotes.value = null
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
        .add-button {
          margin-top: auto;
          padding: 8px;
          text-align: center;
          color: #6b7280;
          font-size: 11px;
          font-style: italic;
          border: 1px dashed #d1d5db;
          border-radius: 6px;
          background: #f9fafb;
        }
        .notes-content {
          min-height: 80px;
          padding: 8px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 12px;
          color: #6b7280;
          font-style: italic;
        }
        .empty-notes {
          color: #9ca3af;
          font-style: italic;
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
                  <div class="recipe-item">
                    <div class="recipe-title">${meal.title}</div>
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
                  <div class="recipe-item">
                    <div class="recipe-title">${meal.title}</div>
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
        <div class="section-title">Notes de la semaine</div>
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
    </body>
    </html>
  `
  
  printWindow.document.write(printContent)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  printWindow.close()
}

// SEO
useHead({
  title: 'Planning hebdomadaire - Recettes des Boultons',
  meta: [
    { name: 'description', content: 'Organisez vos repas de la semaine. Planifiez vos menus et ne manquez plus rien !' }
  ]
})
</script> 