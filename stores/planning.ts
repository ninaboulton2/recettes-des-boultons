import { defineStore } from 'pinia'
import { ref, computed, onMounted, readonly } from 'vue'

interface Meal {
  id: string
  title: string
  recipeId?: string
  note?: string
}

interface DayMeals {
  breakfast: Meal | null
  lunch: Meal | null
  dinner: Meal | null
  notes?: string
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
        breakfast: null,
        lunch: null,
        dinner: null
      }
    }

    weekPlanning.value[date][mealType] = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      title: recipe.title,
      recipeId: recipe.id,
      note: note || ''
    }

    saveToLocalStorage()
  }

  const removeMeal = (date: string, mealType: 'breakfast' | 'lunch' | 'dinner') => {
    if (weekPlanning.value[date]) {
      weekPlanning.value[date][mealType] = null
      saveToLocalStorage()
    }
  }

  const updateMealNote = (date: string, mealType: 'breakfast' | 'lunch' | 'dinner', note: string) => {
    if (weekPlanning.value[date] && weekPlanning.value[date][mealType]) {
      weekPlanning.value[date][mealType]!.note = note
      saveToLocalStorage()
    }
  }

  const updateDayNotes = (date: string, notes: string) => {
    if (!weekPlanning.value[date]) {
      weekPlanning.value[date] = {
        breakfast: null,
        lunch: null,
        dinner: null
      }
    }
    weekPlanning.value[date].notes = notes
    saveToLocalStorage()
  }

  const getDayMeals = (date: string): DayMeals => {
    return weekPlanning.value[date] || {
      breakfast: null,
      lunch: null,
      dinner: null
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
        weekPlanning.value = JSON.parse(savedPlanning)
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
    updateDayNotes,
    getDayMeals
  }
}) 