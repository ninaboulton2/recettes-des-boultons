import { defineStore } from 'pinia'
import { apiFetch } from '~/composables/useApi'
import { ref, computed, onMounted, readonly } from 'vue'
import type { Recipe } from '~/utils/supabase'
import { useAuthStore } from './auth'

interface Meal {
  id: string
  dateString: string
  mealType: 'lunch' | 'dinner'
  recipeId: string
  userId: string | null
  createdAt: string
  updatedAt: string
  recipe: Recipe | null
}

interface DayMeals {
  lunch: Meal[]
  dinner: Meal[]
  notes?: string
  lunchGroupNote?: string
  dinnerGroupNote?: string
}

interface WeekPlanning {
  [date: string]: DayMeals
}

export const usePlanningStore = defineStore('planning', () => {
  const weekPlanning = ref<WeekPlanning>({})
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Actions
  const addMeal = async (date: string, mealType: 'lunch' | 'dinner', recipe: Recipe) => {
    try {
      const authStore = useAuthStore()
      const userId = authStore.currentUser?.id || null
      
      if (!userId) {
        throw new Error('Vous devez être connecté pour gérer votre planning')
      }
      
      const response = await apiFetch('/api/planning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dateString: date,
          mealType,
          recipeId: recipe.id,
          userId
        })
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Forcer la mise à jour du store en rechargeant depuis l'API
        // Cela garantit que les données sont synchronisées et correctement formatées
        await loadPlanning()
        
        return { success: true, message: data.message }
      } else {
        throw new Error('Erreur lors de l\'ajout au planning')
      }
    } catch (error) {
      console.error('Erreur ajout repas:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: errorMessage }
    }
  }

  const addCustomMeal = async (date: string, mealType: 'lunch' | 'dinner', customTitle: string) => {
    try {
      const authStore = useAuthStore()
      const userId = authStore.currentUser?.id || null
      
      if (!userId) {
        throw new Error('Vous devez être connecté pour gérer votre planning')
      }
      
      const response = await apiFetch('/api/planning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dateString: date,
          mealType,
          customTitle,
          userId
        })
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Forcer la mise à jour du store en rechargeant depuis l'API
        // Cela garantit que les données sont synchronisées et correctement formatées
        await loadPlanning()
        
        return { success: true, message: data.message }
      } else {
        throw new Error('Erreur lors de l\'ajout du repas personnalisé')
      }
    } catch (error) {
      console.error('Erreur ajout repas personnalisé:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: errorMessage }
    }
  }

  const removeMeal = async (date: string, mealType: 'lunch' | 'dinner', mealId: string) => {
    try {
      const authStore = useAuthStore()
      const userId = authStore.currentUser?.id || null
      
      if (!userId) {
        throw new Error('Vous devez être connecté pour gérer votre planning')
      }
      
      const response = await apiFetch(`/api/planning/${mealId}?userId=${userId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `Erreur HTTP: ${response.status}`)
      }

      // Supprimer du planning local
      if (weekPlanning.value[date] && weekPlanning.value[date][mealType]) {
        weekPlanning.value[date][mealType] = weekPlanning.value[date][mealType].filter(meal => meal.id !== mealId)
      }

      return { success: true, message: 'Repas supprimé du planning' }
    } catch (error) {
      console.error('Erreur suppression repas:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: errorMessage }
    }
  }

  const updateMealNote = (date: string, mealType: 'lunch' | 'dinner', mealId: string, note: string) => {
    if (weekPlanning.value[date]) {
      const meal = weekPlanning.value[date][mealType].find(m => m.id === mealId)
      if (meal) {
        // Note: Pour l'instant, on garde les notes en local
        // TODO: Ajouter une API pour mettre à jour les notes
        // meal.note = note // Commenté car la propriété note n'existe pas dans l'interface Meal
      }
    }
  }

  const updateDayNotes = async (date: string, notes: string) => {
    try {
      const authStore = useAuthStore()
      const userId = authStore.currentUser?.id || null
      
      if (!userId) {
        throw new Error('Vous devez être connecté pour gérer votre planning')
      }
      
      const response = await apiFetch('/api/planning-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dateString: date,
          noteType: 'day',
          content: notes || null,
          userId: userId
        })
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Mettre à jour le store local
        if (!weekPlanning.value[date]) {
          weekPlanning.value[date] = {
            lunch: [],
            dinner: []
          }
        }
        weekPlanning.value[date].notes = notes
        
        return { success: true, message: data.message }
      } else {
        throw new Error('Erreur lors de la mise à jour des notes')
      }
    } catch (error) {
      console.error('Erreur mise à jour notes jour:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: errorMessage }
    }
  }

  const deleteDayNotes = async (date: string) => {
    try {
      const authStore = useAuthStore()
      const userId = authStore.currentUser?.id || null
      
      if (!userId) {
        throw new Error('Vous devez être connecté pour gérer votre planning')
      }
      
      const response = await apiFetch(`/api/planning-notes?dateString=${date}&noteType=day&userId=${userId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Mettre à jour le store local
        if (weekPlanning.value[date]) {
          weekPlanning.value[date].notes = null
        }
        
        return { success: true, message: data.message }
      } else {
        throw new Error('Erreur lors de la suppression des notes')
      }
    } catch (error) {
      console.error('Erreur suppression notes jour:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: errorMessage }
    }
  }

  const updateGroupNote = async (date: string, mealType: 'lunch' | 'dinner', note: string) => {
    try {
      const authStore = useAuthStore()
      const userId = authStore.currentUser?.id || null
      
      if (!userId) {
        throw new Error('Vous devez être connecté pour gérer votre planning')
      }
      
      const noteType = mealType === 'lunch' ? 'lunch' : 'dinner'
      
      const response = await apiFetch('/api/planning-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dateString: date,
          noteType,
          content: note || null,
          userId
        })
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Mettre à jour le store local
        if (!weekPlanning.value[date]) {
          weekPlanning.value[date] = {
            lunch: [],
            dinner: []
          }
        }
        
        const groupNoteKey = `${mealType}GroupNote` as keyof DayMeals
        ;(weekPlanning.value[date] as any)[groupNoteKey] = note
        
        return { success: true, message: data.message }
      } else {
        throw new Error('Erreur lors de la mise à jour de la note de groupe')
      }
    } catch (error) {
      console.error('Erreur mise à jour note groupe:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: errorMessage }
    }
  }

  const moveMeal = async (fromDate: string, fromMealType: 'lunch' | 'dinner', toDate: string, toMealType: 'lunch' | 'dinner', mealId: string) => {
    try {
      // Récupérer le repas à déplacer
      const mealToMove = weekPlanning.value[fromDate]?.[fromMealType]?.find(meal => meal.id === mealId)
      if (!mealToMove) {
        return { success: false, error: 'Repas non trouvé' }
      }

      // Supprimer de la source
      await removeMeal(fromDate, fromMealType, mealId)

      // Ajouter à la destination selon le type de repas
      if (mealToMove.recipe && mealToMove.recipe.id.startsWith('custom-')) {
        // Repas personnalisé
        const customTitle = mealToMove.recipe.title
        const result = await addCustomMeal(toDate, toMealType, customTitle)
        return result
      } else if (mealToMove.recipe) {
        // Repas avec recette
        const result = await addMeal(toDate, toMealType, mealToMove.recipe)
        return result
      } else {
        return { success: false, error: 'Type de repas non reconnu' }
      }
    } catch (error) {
      console.error('Erreur déplacement repas:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: errorMessage }
    }
  }

  const getDayMeals = (date: string): DayMeals => {
    if (!weekPlanning.value[date]) {
      return {
        lunch: [],
        dinner: []
      }
    }

    return {
      lunch: weekPlanning.value[date].lunch || [],
      dinner: weekPlanning.value[date].dinner || [],
      notes: weekPlanning.value[date].notes,
      lunchGroupNote: weekPlanning.value[date].lunchGroupNote,
      dinnerGroupNote: weekPlanning.value[date].dinnerGroupNote
    }
  }

  // Charger le planning depuis Supabase
  const loadPlanning = async () => {
    isLoading.value = true
    error.value = null
    
    try {
      const authStore = useAuthStore()
      const userId = authStore.currentUser?.id || null
      
      // Si pas d'utilisateur connecté, vider le planning
      if (!userId) {
        weekPlanning.value = {}
        return
      }
      
      const response = await apiFetch(`/api/planning?userId=${userId}`)
      
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Convertir le format de l'API vers le format local
        weekPlanning.value = {}
        
        Object.entries(data.planning).forEach(([date, meals]: [string, any]) => {
          weekPlanning.value[date] = {
            lunch: meals.lunch || [],
            dinner: meals.dinner || [],
            notes: meals.notes || null,
            lunchGroupNote: meals.lunchGroupNote || null,
            dinnerGroupNote: meals.dinnerGroupNote || null
          }
        })
      } else {
        throw new Error('Erreur lors du chargement du planning')
      }
    } catch (error) {
      console.error('Erreur chargement planning:', error)
      error.value = error instanceof Error ? error.message : 'Erreur inconnue'
    } finally {
      isLoading.value = false
    }
  }

  // Méthode pour recharger le planning quand l'utilisateur change
  const refreshPlanning = async () => {
    await loadPlanning()
  }

  // Initialize
  onMounted(() => {
    loadPlanning()
  })

  return {
    // State
    weekPlanning: readonly(weekPlanning),
    isLoading: readonly(isLoading),
    error: readonly(error),
    
    // Actions
    addMeal,
    addCustomMeal,
    removeMeal,
    updateMealNote,
    updateGroupNote,
    updateDayNotes,
    deleteDayNotes,
    getDayMeals,
    moveMeal,
    loadPlanning,
    refreshPlanning
  }
}) 