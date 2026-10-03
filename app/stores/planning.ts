import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '~/composables/useApi'
import { apiErrorFromResponse } from '~/composables/useApiError'
import type { DayMeals, MealType, PlanningMeal, WeekPlanning } from '#shared/types'
import type { Database } from '#shared/types/database'
import type { NoteType } from '#shared/schemas/planning'
import { RECIPE_SUMMARY_COLUMNS, toRecipeSummary } from '#shared/utils/recipes'
import { weekBounds } from '~/utils/week'
import { useAuthStore } from './auth'

type Meal = PlanningMeal

/** Appel d'écriture vers `/api/*` : lève une `ApiError` si la réponse n'est pas 2xx. */
async function request(url: string, init: RequestInit = {}): Promise<void> {
  const response = await apiFetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  if (!response.ok) throw await apiErrorFromResponse(response)
}

/**
 * Planning hebdomadaire de l'utilisateur connecté.
 *
 * Lecture directe sous RLS (`planning` + `planning_notes`) par plage de dates :
 * `loadWeek(date)` charge la semaine demandée (et élargit la plage connue),
 * `refresh()` recharge toute la plage déjà consultée.
 *
 * Les écritures passent par `/api/planning*` (validation Zod côté serveur) puis
 * rechargent la plage : les actions LÈVENT en cas d'erreur (`ApiError`), à
 * convertir avec `toUserMessage()` par l'appelant (`usePlanningWeek`).
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
      if (!userId) {
        weekPlanning.value = {}
        loadedRange.value = null
        loadedForUserId.value = null
        return weekPlanning.value
      }

      const [mealsResult, notesResult] = await Promise.all([
        supabase
          .from('planning')
          .select(`*, recipe:recipes(${RECIPE_SUMMARY_COLUMNS})`)
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
        dayOf(row.date_string)[mealType].push({
          id: row.id,
          dateString: row.date_string,
          mealType,
          recipeId: row.recipe_id,
          customTitle: row.custom_title,
          userId: row.user_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          recipe: row.recipe ? toRecipeSummary(row.recipe) : null
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
      error.value = err instanceof Error ? err.message : 'Erreur inconnue'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /** Charge la semaine contenant `date` (élargit la plage connue si besoin). */
  const loadWeek = async (date: Date = new Date()): Promise<WeekPlanning> => {
    const { from, to } = weekBounds(date)
    const known = loadedRange.value
    const range = known && loadedForUserId.value === currentUserId()
      ? { from: from < known.from ? from : known.from, to: to > known.to ? to : known.to }
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

  /** Recharge sans lever (changement d'utilisateur depuis le layout, par exemple). */
  const refreshPlanning = async (): Promise<void> => {
    try {
      await refresh()
    } catch {
      // Erreur déjà consignée dans `error`
    }
  }

  /** Repas et notes d'un jour (`YYYY-MM-DD`), vides si le jour est inconnu. */
  const getDayMeals = (dateString: string): DayMeals => {
    const day = weekPlanning.value[dateString]
    return day ? { ...day, lunch: day.lunch, dinner: day.dinner } : { lunch: [], dinner: [] }
  }

  /** Repas identifié par son id dans la plage chargée. */
  const findMeal = (mealId: string): Meal | null => {
    for (const day of Object.values(weekPlanning.value)) {
      const meal = [...day.lunch, ...day.dinner].find(candidate => candidate.id === mealId)
      if (meal) return meal
    }
    return null
  }

  // --- Écritures (lèvent une ApiError, puis rechargent) ---

  /** Ajoute une recette à un créneau. */
  const addMeal = async (dateString: string, mealType: MealType, recipe: { id: string }): Promise<void> => {
    await request('/api/planning', {
      method: 'POST',
      body: JSON.stringify({ dateString, mealType, recipeId: recipe.id })
    })
    await refresh()
  }

  /** Ajoute un repas personnalisé (sans recette) à un créneau. */
  const addCustomMeal = async (dateString: string, mealType: MealType, customTitle: string): Promise<void> => {
    await request('/api/planning', {
      method: 'POST',
      body: JSON.stringify({ dateString, mealType, customTitle })
    })
    await refresh()
  }

  /** Retire un repas (retrait local immédiat, puis rechargement). */
  const removeMeal = async (mealId: string): Promise<void> => {
    const meal = findMeal(mealId)
    await request(`/api/planning/${mealId}`, { method: 'DELETE' })
    if (meal) {
      const day = weekPlanning.value[meal.dateString]
      if (day) day[meal.mealType] = day[meal.mealType].filter(candidate => candidate.id !== mealId)
    }
    await refresh()
  }

  /** Déplace un repas vers un autre jour / créneau (`PUT /api/planning/:id`, identifiant conservé). */
  const moveMeal = async (mealId: string, toDate: string, toMealType: MealType): Promise<void> => {
    const meal = findMeal(mealId)
    if (meal && meal.dateString === toDate && meal.mealType === toMealType) return

    await request(`/api/planning/${mealId}`, {
      method: 'PUT',
      body: JSON.stringify({ dateString: toDate, mealType: toMealType })
    })

    // Mise à jour locale immédiate (le rechargement confirme ensuite).
    if (meal) {
      const source = weekPlanning.value[meal.dateString]
      if (source) source[meal.mealType] = source[meal.mealType].filter(candidate => candidate.id !== mealId)
      const target = (weekPlanning.value[toDate] ??= { lunch: [], dinner: [] })
      target[toMealType].push({ ...meal, dateString: toDate, mealType: toMealType })
    }
    await refresh()
  }

  /**
   * Enregistre une note (`day`, `lunch` ou `dinner`) ; un contenu vide la supprime.
   */
  const saveNote = async (dateString: string, noteType: NoteType, content: string | null): Promise<void> => {
    const trimmed = content?.trim() ?? ''
    if (trimmed === '') {
      await request(`/api/planning-notes?dateString=${dateString}&noteType=${noteType}`, { method: 'DELETE' })
    } else {
      await request('/api/planning-notes', {
        method: 'POST',
        body: JSON.stringify({ dateString, noteType, content: trimmed })
      })
    }
    await refresh()
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
    refreshPlanning,
    getDayMeals,
    findMeal,

    // Écritures
    addMeal,
    addCustomMeal,
    removeMeal,
    moveMeal,
    saveNote
  }
})

export type { Meal }
