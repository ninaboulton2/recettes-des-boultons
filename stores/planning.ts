import { defineStore } from 'pinia'
import { ref, computed, onMounted, readonly } from 'vue'

interface Meal {
  id: string
  title: string
  recipeId?: string
  note?: string
}

interface DayMeals {
  breakfast: Meal[]
  lunch: Meal[]
  dinner: Meal[]
  notes?: string
  breakfastGroupNote?: string
  lunchGroupNote?: string
  dinnerGroupNote?: string
}

interface WeekPlanning {
  [date: string]: DayMeals
}

export const usePlanningStore = defineStore('planning', () => {
  const weekPlanning = ref<WeekPlanning>({})

  // Actions
  const addMeal = (date: string, mealType: 'breakfast' | 'lunch' | 'dinner', recipe: any, note?: string) => {
    if (!weekPlanning.value[date]) {
      weekPlanning.value[date] = {
        breakfast: [],
        lunch: [],
        dinner: []
      }
    }

    // S'assurer que le type de repas existe et est un tableau
    if (!Array.isArray(weekPlanning.value[date][mealType])) {
      weekPlanning.value[date][mealType] = []
    }

    const newMeal: Meal = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      title: recipe.title,
      recipeId: recipe.id,
      note: note || ''
    }

    weekPlanning.value[date][mealType].push(newMeal)
    saveToLocalStorage()
  }

  const removeMeal = (date: string, mealType: 'breakfast' | 'lunch' | 'dinner', mealId?: string) => {
    if (weekPlanning.value[date]) {
      if (mealId) {
        // Supprimer une recette spécifique
        weekPlanning.value[date][mealType] = weekPlanning.value[date][mealType].filter(meal => meal.id !== mealId)
      } else {
        // Supprimer toutes les recettes du repas
        weekPlanning.value[date][mealType] = []
      }
      saveToLocalStorage()
    }
  }

  const updateMealNote = (date: string, mealType: 'breakfast' | 'lunch' | 'dinner', mealId: string, note: string) => {
    if (weekPlanning.value[date]) {
      const meal = weekPlanning.value[date][mealType].find(m => m.id === mealId)
      if (meal) {
        meal.note = note
        saveToLocalStorage()
      }
    }
  }

  const updateDayNotes = (date: string, notes: string) => {
    if (!weekPlanning.value[date]) {
      weekPlanning.value[date] = {
        breakfast: [],
        lunch: [],
        dinner: []
      }
    }
    weekPlanning.value[date].notes = notes
    saveToLocalStorage()
  }

  const updateGroupNote = (date: string, mealType: 'breakfast' | 'lunch' | 'dinner', note: string) => {
    if (!weekPlanning.value[date]) {
      weekPlanning.value[date] = {
        breakfast: [],
        lunch: [],
        dinner: []
      }
    }
    
    const groupNoteKey = `${mealType}GroupNote` as keyof DayMeals
    weekPlanning.value[date][groupNoteKey] = note
    saveToLocalStorage()
  }

  const moveMeal = (fromDate: string, fromMealType: 'breakfast' | 'lunch' | 'dinner', toDate: string, toMealType: 'breakfast' | 'lunch' | 'dinner', mealId: string) => {
    // Trouver la recette à déplacer
    if (!weekPlanning.value[fromDate] || !weekPlanning.value[fromDate][fromMealType]) {
      return false
    }

    const mealIndex = weekPlanning.value[fromDate][fromMealType].findIndex(meal => meal.id === mealId)
    if (mealIndex === -1) {
      return false
    }

    // Récupérer la recette
    const mealToMove = weekPlanning.value[fromDate][fromMealType][mealIndex]

    // S'assurer que la destination existe
    if (!weekPlanning.value[toDate]) {
      weekPlanning.value[toDate] = {
        breakfast: [],
        lunch: [],
        dinner: []
      }
    }

    // S'assurer que le type de repas de destination est un tableau
    if (!Array.isArray(weekPlanning.value[toDate][toMealType])) {
      weekPlanning.value[toDate][toMealType] = []
    }

    // Supprimer de la source
    weekPlanning.value[fromDate][fromMealType].splice(mealIndex, 1)

    // Ajouter à la destination
    weekPlanning.value[toDate][toMealType].push(mealToMove)

    saveToLocalStorage()
    return true
  }

  const getDayMeals = (date: string): DayMeals => {
    if (!weekPlanning.value[date]) {
      return {
        breakfast: [],
        lunch: [],
        dinner: []
      }
    }

    // S'assurer que tous les types de repas sont des tableaux
    const dayMeals = weekPlanning.value[date]
    return {
      breakfast: Array.isArray(dayMeals.breakfast) ? dayMeals.breakfast : [],
      lunch: Array.isArray(dayMeals.lunch) ? dayMeals.lunch : [],
      dinner: Array.isArray(dayMeals.dinner) ? dayMeals.dinner : [],
      notes: dayMeals.notes
    }
  }

  // Local storage
  const saveToLocalStorage = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('boultons-planning', JSON.stringify(weekPlanning.value))
    }
  }

  const loadFromLocalStorage = () => {
    if (typeof window !== 'undefined') {
      const savedPlanning = localStorage.getItem('boultons-planning')
      if (savedPlanning) {
        try {
          const parsed = JSON.parse(savedPlanning)
          // Migration des anciennes données (une seule recette par repas)
          Object.keys(parsed).forEach(date => {
            // S'assurer que la structure de base existe
            if (!parsed[date]) {
              parsed[date] = { breakfast: [], lunch: [], dinner: [] }
            }
            
            // Migration des anciennes données (une seule recette par repas)
            if (parsed[date].breakfast && !Array.isArray(parsed[date].breakfast)) {
              parsed[date].breakfast = parsed[date].breakfast ? [parsed[date].breakfast] : []
            }
            if (parsed[date].lunch && !Array.isArray(parsed[date].lunch)) {
              parsed[date].lunch = parsed[date].lunch ? [parsed[date].lunch] : []
            }
            if (parsed[date].dinner && !Array.isArray(parsed[date].dinner)) {
              parsed[date].dinner = parsed[date].dinner ? [parsed[date].dinner] : []
            }
            
            // S'assurer que tous les types de repas sont des tableaux
            if (!Array.isArray(parsed[date].breakfast)) {
              parsed[date].breakfast = []
            }
            if (!Array.isArray(parsed[date].lunch)) {
              parsed[date].lunch = []
            }
            if (!Array.isArray(parsed[date].dinner)) {
              parsed[date].dinner = []
            }
          })
          weekPlanning.value = parsed
        } catch (error) {
          console.error('Erreur lors du chargement du planning:', error)
          // En cas d'erreur, initialiser avec un planning vide
          weekPlanning.value = {}
        }
      }
    }
  }

  // Initialize
  onMounted(() => {
    loadFromLocalStorage()
  })

  return {
    // State
    weekPlanning: readonly(weekPlanning),
    
    // Actions
    addMeal,
    removeMeal,
    updateMealNote,
    updateGroupNote,
    updateDayNotes,
    getDayMeals,
    moveMeal
  }
}) 