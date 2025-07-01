<template>
  <div>
    <!-- Header -->
    <div class="mb-8">
      <div class="flex justify-between items-center mb-4">
        <h1 class="text-4xl font-lobster text-gray-900">
          Planning hebdomadaire
        </h1>
        <button 
          @click="printPlanning" 
          class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
          </svg>
          Imprimer
        </button>
      </div>
      <p class="text-xl text-gray-600">
        Organisez vos repas de la semaine
      </p>
    </div>

    <!-- Week Navigation -->
    <div class="bg-white rounded-xl shadow-sm p-6 mb-8">
      <div class="flex justify-between items-center">
        <button
          @click="previousWeek"
          class="p-2 text-gray-600 hover:text-primary-600 transition-colors duration-200"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
        </button>
        
        <h2 class="text-xl font-semibold text-gray-900">
          Semaine du {{ formatWeekStart(currentWeek) }}
        </h2>
        
        <button
          @click="nextWeek"
          class="p-2 text-gray-600 hover:text-primary-600 transition-colors duration-200"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- Weekly Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-7 gap-4">
      <div
        v-for="day in weekDays"
        :key="day.date"
        class="bg-white rounded-xl shadow-sm p-4"
      >
        <div class="text-center mb-4">
          <h3 class="font-semibold text-gray-900">{{ day.name }}</h3>
          <p class="text-sm text-gray-500">{{ formatDate(day.date) }}</p>
        </div>

        <!-- Meals -->
        <div class="space-y-4">
          <!-- Breakfast -->
          <div class="border border-gray-200 rounded-lg p-3">
            <h4 class="text-sm font-medium text-gray-700 mb-2">Petit-déjeuner</h4>
            <div v-if="day.meals.breakfast" class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-900">{{ day.meals.breakfast.title }}</span>
                <button
                  @click="removeMeal(day.date, 'breakfast')"
                  class="text-red-500 hover:text-red-700 text-xs"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
            </div>
            <button
              v-else
              @click="openMealSelector(day.date, 'breakfast')"
              class="w-full text-sm text-gray-500 hover:text-primary-600 border-2 border-dashed border-gray-300 rounded-lg p-2 hover:border-primary-300 transition-colors duration-200"
            >
              + Ajouter un repas
            </button>
          </div>

          <!-- Lunch -->
          <div class="border border-gray-200 rounded-lg p-3">
            <h4 class="text-sm font-medium text-gray-700 mb-2">Déjeuner</h4>
            <div v-if="day.meals.lunch" class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-900">{{ day.meals.lunch.title }}</span>
                <button
                  @click="removeMeal(day.date, 'lunch')"
                  class="text-red-500 hover:text-red-700 text-xs"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
            </div>
            <button
              v-else
              @click="openMealSelector(day.date, 'lunch')"
              class="w-full text-sm text-gray-500 hover:text-primary-600 border-2 border-dashed border-gray-300 rounded-lg p-2 hover:border-primary-300 transition-colors duration-200"
            >
              + Ajouter un repas
            </button>
          </div>

          <!-- Dinner -->
          <div class="border border-gray-200 rounded-lg p-3">
            <h4 class="text-sm font-medium text-gray-700 mb-2">Dîner</h4>
            <div v-if="day.meals.dinner" class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-900">{{ day.meals.dinner.title }}</span>
                <button
                  @click="removeMeal(day.date, 'dinner')"
                  class="text-red-500 hover:text-red-700 text-xs"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
            </div>
            <button
              v-else
              @click="openMealSelector(day.date, 'dinner')"
              class="w-full text-sm text-gray-500 hover:text-primary-600 border-2 border-dashed border-gray-300 rounded-lg p-2 hover:border-primary-300 transition-colors duration-200"
            >
              + Ajouter un repas
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Meal Selector Modal -->
    <div v-if="showMealSelector" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4 max-h-96 overflow-y-auto">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-semibold text-gray-900">
            Choisir une recette
          </h3>
          <button
            @click="closeMealSelector"
            class="text-gray-500 hover:text-gray-700"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div class="space-y-2">
          <div
            v-for="recipe in recipes"
            :key="recipe.id"
            @click="selectMeal(recipe)"
            class="p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors duration-200"
          >
            <div class="flex items-center space-x-3">
              <img
                :src="recipe.image"
                :alt="recipe.title"
                class="w-12 h-12 object-cover rounded-lg"
              >
              <div class="flex-1">
                <h4 class="font-medium text-gray-900">{{ recipe.title }}</h4>
                <p class="text-sm text-gray-500">{{ recipe.prepTime + recipe.cookTime }} min</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const recipesStore = useRecipesStore()

// Reactive data
const currentWeek = ref(new Date())
const showMealSelector = ref(false)
const selectedDay = ref(null)
const selectedMealType = ref(null)

// Computed properties
const recipes = computed(() => recipesStore.recipes)

const weekDays = computed(() => {
  const days = []
  const startOfWeek = new Date(currentWeek.value)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1) // Monday

  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + i)
    
    days.push({
      date: date,
      name: date.toLocaleDateString('fr-FR', { weekday: 'long' }),
      meals: {
        breakfast: null,
        lunch: null,
        dinner: null
      }
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
}

const selectMeal = (recipe) => {
  if (selectedDay.value && selectedMealType.value) {
    const dayIndex = weekDays.value.findIndex(day => 
      day.date.toDateString() === selectedDay.value.toDateString()
    )
    
    if (dayIndex !== -1) {
      weekDays.value[dayIndex].meals[selectedMealType.value] = recipe
    }
  }
  
  closeMealSelector()
}

const removeMeal = (date, mealType) => {
  const dayIndex = weekDays.value.findIndex(day => 
    day.date.toDateString() === date.toDateString()
  )
  
  if (dayIndex !== -1) {
    weekDays.value[dayIndex].meals[mealType] = null
  }
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
          line-height: 1.8; 
          max-width: 1200px; 
          margin-left: auto; 
          margin-right: auto; 
        }
        h1 { 
          color: #1e40af; 
          font-size: 32px; 
          margin-bottom: 20px; 
          text-align: center; 
          font-weight: bold;
        }
        .week-info { 
          background: #f3f4f6; 
          padding: 20px; 
          border-radius: 12px; 
          margin: 25px 0; 
          text-align: center; 
          font-size: 18px;
          font-weight: 500;
        }
        .week-grid { 
          display: grid; 
          grid-template-columns: repeat(7, 1fr); 
          gap: 20px; 
          margin: 30px 0; 
        }
        .day { 
          border: 2px solid #e5e7eb; 
          border-radius: 12px; 
          padding: 20px; 
          min-height: 300px;
        }
        .day-header { 
          text-align: center; 
          margin-bottom: 20px; 
          padding-bottom: 15px;
          border-bottom: 2px solid #e5e7eb;
        }
        .day-name { 
          font-weight: bold; 
          color: #374151; 
          font-size: 18px;
          text-transform: capitalize;
        }
        .day-date { 
          font-size: 14px; 
          color: #6b7280; 
          margin-top: 5px;
        }
        .meal { 
          margin-bottom: 20px; 
        }
        .meal-title { 
          font-weight: bold; 
          color: #374151; 
          font-size: 16px; 
          margin-bottom: 10px; 
          text-align: center;
          background: #f9fafb;
          padding: 8px;
          border-radius: 8px;
        }
        .meal-content { 
          font-size: 14px; 
          color: #6b7280; 
          text-align: center;
          min-height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .empty-meal { 
          font-style: italic; 
          color: #9ca3af; 
          font-size: 12px; 
        }
        .footer {
          margin-top: 40px; 
          text-align: center; 
          font-size: 14px; 
          color: #6b7280;
          border-top: 2px solid #e5e7eb;
          padding-top: 20px;
        }
        @media print { 
          body { 
            margin: 15px; 
            font-size: 14px;
          } 
          h1 { font-size: 28px; }
          .week-grid { 
            grid-template-columns: repeat(7, 1fr); 
            gap: 10px;
          }
          .day {
            padding: 15px;
            min-height: 250px;
          }
          .day-name { font-size: 16px; }
          .meal-title { font-size: 14px; }
          .meal-content { font-size: 12px; }
        }
      </style>
    </head>
    <body>
      <h1>Planning hebdomadaire</h1>
      
      <div class="week-info">
        <p>Semaine du ${formatWeekStart(currentWeek.value)}</p>
      </div>
      
      <div class="week-grid">
        ${weekDays.value.map(day => `
          <div class="day">
            <div class="day-header">
              <div class="day-name">${day.name}</div>
              <div class="day-date">${formatDate(day.date)}</div>
            </div>
            
            <div class="meal">
              <div class="meal-title">Petit-déjeuner</div>
              <div class="meal-content">
                ${day.meals.breakfast ? day.meals.breakfast.title : '<span class="empty-meal">Aucun repas planifié</span>'}
              </div>
            </div>
            
            <div class="meal">
              <div class="meal-title">Déjeuner</div>
              <div class="meal-content">
                ${day.meals.lunch ? day.meals.lunch.title : '<span class="empty-meal">Aucun repas planifié</span>'}
              </div>
            </div>
            
            <div class="meal">
              <div class="meal-title">Dîner</div>
              <div class="meal-content">
                ${day.meals.dinner ? day.meals.dinner.title : '<span class="empty-meal">Aucun repas planifié</span>'}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="footer">
        Recettes des Boultons - ${new Date().toLocaleDateString('fr-FR')}
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