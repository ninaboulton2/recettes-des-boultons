<template>
  <div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-xl p-4 sm:p-8 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-lg sm:text-2xl font-semibold text-gray-900 pr-4">
          Ajouter "{{ recipe?.title }}" au planning
        </h3>
        <button
          @click="closeModal"
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
const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  recipe: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close'])

const planningStore = usePlanningStore()

// Planning modal state
const planningCurrentWeek = ref(new Date())
const selectedDay = ref(null)
const selectedMealType = ref(null)

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

// Planning modal methods
const closeModal = () => {
  emit('close')
  selectedDay.value = null
  selectedMealType.value = null
}

const selectDayAndMeal = (dateString, mealType) => {
  selectedDay.value = dateString
  selectedMealType.value = mealType
}

const confirmAddToPlanning = async () => {
  if (!props.recipe || !selectedDay.value || !selectedMealType.value) return
  
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
  
  try {
    // Ajouter la recette au planning
    const result = await planningStore.addMeal(selectedDayValue, selectedMealTypeValue, props.recipe)
    
    if (result.success) {
      // Fermer la modale
      closeModal()
      
      // Afficher un toast de confirmation
      $toast.success(
        'Recette ajoutée !',
        `${props.recipe.title} a été ajoutée au planning du ${formattedDate} (${selectedMealTypeValue === 'lunch' ? 'déjeuner' : 'dîner'})`,
        3000
      )
    } else {
      $toast.error('Erreur !', result.error || 'Erreur lors de l\'ajout au planning', 3000)
    }
  } catch (error) {
    console.error('Erreur ajout au planning:', error)
    $toast.error('Erreur !', 'Erreur lors de l\'ajout au planning', 3000)
  }
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

// Reset modal state when recipe changes
watch(() => props.recipe, () => {
  if (props.recipe) {
    planningCurrentWeek.value = new Date()
    selectedDay.value = null
    selectedMealType.value = null
  }
})
</script>
