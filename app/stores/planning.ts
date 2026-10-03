import { defineStore } from 'pinia'
import { apiFetch } from '~/composables/useApi'
import { ref } from 'vue'
import type { DayMeals, MealType, PlanningMeal, RecipeSummary, WeekPlanning } from '#shared/types'
import type { Database } from '#shared/types/database'
import { toRecipeSummary } from '#shared/utils/recipes'
import { weekBounds } from '~/utils/week'
import { useAuthStore } from './auth'

type Meal = PlanningMeal

/** Recette « factice » affichée pour un repas personnalisé (sans recette). */
function customMealRecipe(meal: { id: string, custom_title: string, created_at: string | null, updated_at: string | null }): RecipeSummary {
  return {
    id: `custom-${meal.id}`,
    title: meal.custom_title,
    description: 'Repas personnalisé',
    category: 'Personnalisé',
    prepTime: 0,
    cookTime: 0,
    servings: 1,
    image: '/images/custom-meal.jpg',
    photoPath: null,
    tags: ['personnalisé'],
    notes: '',
    createdAt: meal.created_at,
    updatedAt: meal.updated_at
  }
}

/**
 * Planning hebdomadaire de l'utilisateur connecté.
 *
 * Lecture directe sous RLS (`planning` + `planning_notes`) par plage de dates :
 * `loadWeek(date)` charge la semaine demandée (et élargit la plage connue),
 * `refresh()` recharge toute la plage déjà consultée. Les écritures passent
 * encore par `/api/planning*`.
 */
export const usePlanningStore = defineStore('planning', () => {
  const supabase = useSupabaseClient<Database>()

  const weekPlanning = ref<WeekPlanning>({})
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  /** Plage de dates (incluses) déjà chargée, élargie à chaque `loadWeek`. */
  const loadedRange = ref<{ from: string, to: string } | null>(null)
  /** Utilisateur pour lequel la plage a été chargée (`null` : personne). */
  const loadedForUserId = ref<string | null>(null)

  const currentUserId = () => useAuthStore().currentUser?.id ?? null

  /** Charge repas et notes entre deux dates (incluses) et remplace la plage en mémoire. */
  const loadRange = async (from: string, to: string): Promise<WeekPlanning> => {
    isLoading.value = true
    error.value = null

    try {
      const userId = currentUserId()

      // Si pas d'utilisateur connecté, vider le planning
      if (!userId) {
        weekPlanning.value = {}
        loadedRange.value = null
        loadedForUserId.value = null
        return weekPlanning.value
      }

      const [mealsResult, notesResult] = await Promise.all([
        supabase
          .from('planning')
          .select('*, recipe:recipes(id, title, description, category, prep_time, cook_time, servings, image, photo_path, tags, notes, created_at, updated_at)')
          .gte('date_string', from)
          .lte('date_string', to)
          .order('date_string', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('planning_notes')
          .select('*')
          .gte('date_string', from)
          .lte('date_string', to)
      ])
      if (mealsResult.error) throw mealsResult.error
      if (notesResult.error) throw notesResult.error

      const planning: WeekPlanning = {}
      const dayOf = (dateString: string): DayMeals => (planning[dateString] ??= { lunch: [], dinner: [] })

      for (const row of mealsResult.data) {
        const mealType: MealType = row.meal_type === 'dinner' ? 'dinner' : 'lunch'
        const recipe = row.recipe
          ? toRecipeSummary(row.recipe)
          : row.custom_title
            ? customMealRecipe({ id: row.id, custom_title: row.custom_title, created_at: row.created_at, updated_at: row.updated_at })
            : null
        dayOf(row.date_string)[mealType].push({
          id: row.id,
          dateString: row.date_string,
          mealType,
          recipeId: row.recipe_id,
          customTitle: row.custom_title,
          userId: row.user_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          recipe
        })
      }

      for (const note of notesResult.data) {
        const day = dayOf(note.date_string)
        if (note.note_type === 'day') day.notes = note.content
        else if (note.note_type === 'lunch') day.lunchGroupNote = note.content
        else if (note.note_type === 'dinner') day.dinnerGroupNote = note.content
      }

      weekPlanning.value = planning
      loadedRange.value = { from, to }
      loadedForUserId.value = userId
      return planning
    } catch (err) {
      console.error('Erreur chargement planning:', err)
      error.value = err instanceof Error ? err.message : 'Erreur inconnue'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /** Charge la semaine contenant `date` (élargit la plage connue si besoin). */
  const loadWeek = async (date: Date = new Date()): Promise<WeekPlanning> => {
    const { from, to } = weekBounds(date)
    const range = loadedRange.value && loadedForUserId.value === currentUserId()
      ? { from: from < loadedRange.value.from ? from : loadedRange.value.from, to: to > loadedRange.value.to ? to : loadedRange.value.to }
      : { from, to }
    return loadRange(range.from, range.to)
  }

  /** Recharge la plage déjà consultée (semaine courante par défaut). Lève en cas d'erreur. */
  const refresh = async (): Promise<WeekPlanning> => {
    if (loadedRange.value && loadedForUserId.value === currentUserId()) {
      return loadRange(loadedRange.value.from, loadedRange.value.to)
    }
    return loadWeek(new Date())
  }

  /** Charge une seule fois par utilisateur la semaine demandée si elle n'est pas connue. */
  const ensureWeekLoaded = async (date: Date = new Date()): Promise<void> => {
    const { from, to } = weekBounds(date)
    const range = loadedRange.value
    if (range && loadedForUserId.value === currentUserId() && range.from <= from && range.to >= to) return
    try {
      await loadWeek(date)
    } catch {
      // Erreur déjà consignée dans `error`
    }
  }

  // Charger le planning depuis Supabase (compatibilité : utilisé par les actions d'écriture)
  const loadPlanning = async () => {
    try {
      await refresh()
    } catch {
      // Erreur déjà consignée dans `error`
    }
  }

  // Actions
  const addMeal = async (date: string, mealType: 'lunch' | 'dinner', recipe: RecipeSummary) => {
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

  const updateMealNote = (date: string, mealType: 'lunch' | 'dinner', mealId: string, _note: string) => {
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

        if (mealType === 'lunch') {
          weekPlanning.value[date].lunchGroupNote = note
        } else {
          weekPlanning.value[date].dinnerGroupNote = note
        }

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
    const day = weekPlanning.value[date]
    if (!day) {
      return {
        lunch: [],
        dinner: []
      }
    }

    return {
      lunch: day.lunch || [],
      dinner: day.dinner || [],
      notes: day.notes,
      lunchGroupNote: day.lunchGroupNote,
      dinnerGroupNote: day.dinnerGroupNote
    }
  }

  // Méthode pour recharger le planning quand l'utilisateur change (layout)
  const refreshPlanning = async () => {
    await loadPlanning()
  }

  return {
    // State
    weekPlanning,
    isLoading,
    error,
    loadedRange,

    // Lecture
    loadWeek,
    ensureWeekLoaded,
    refresh,
    loadPlanning,
    refreshPlanning,

    // Actions
    addMeal,
    addCustomMeal,
    removeMeal,
    updateMealNote,
    updateGroupNote,
    updateDayNotes,
    deleteDayNotes,
    getDayMeals,
    moveMeal
  }
})

export type { Meal }
