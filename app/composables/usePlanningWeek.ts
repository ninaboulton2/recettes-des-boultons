import { computed, ref } from 'vue'
import type { DayMeals, MealType, PlanningMeal } from '#shared/types'
import type { NoteType } from '#shared/schemas/planning'
import { toUserMessage } from '~/composables/useApiError'
import { fromDateString, isSameDay, shiftWeeks, startOfWeek, toDateString, weekDates } from '~/utils/week'

/** Un jour de la semaine affichée, avec ses repas et notes. */
export interface PlanningDay {
  date: Date
  dateString: string
  isToday: boolean
  meals: DayMeals
}

/** Titre affiché d'un repas : recette ou intitulé personnalisé. */
export function mealTitle(meal: PlanningMeal, fallback = ''): string {
  return meal.recipe?.title ?? meal.customTitle ?? fallback
}

/**
 * Semaine du planning côté interface : navigation, jours calculés, formats de
 * date dans la langue courante et actions du store converties en toasts
 * (`useToast()` + `toUserMessage()`).
 */
export function usePlanningWeek(initialDate: Date = new Date()) {
  const store = usePlanningStore()
  const toast = useToast()
  const { t, locale } = useI18n()

  const currentWeek = ref<Date>(startOfWeek(initialDate))
  /** Clé stable de la semaine affichée (lundi `YYYY-MM-DD`). */
  const weekKey = computed(() => toDateString(startOfWeek(currentWeek.value)))

  const days = computed<PlanningDay[]>(() => {
    const today = new Date()
    return weekDates(currentWeek.value).map((date) => {
      const dateString = toDateString(date)
      return { date, dateString, isToday: isSameDay(date, today), meals: store.getDayMeals(dateString) }
    })
  })

  const isEmptyWeek = computed(() =>
    days.value.every(day => day.meals.lunch.length === 0 && day.meals.dinner.length === 0 && !day.meals.notes)
  )

  // --- Navigation ---
  const previousWeek = () => { currentWeek.value = shiftWeeks(currentWeek.value, -1) }
  const nextWeek = () => { currentWeek.value = shiftWeeks(currentWeek.value, 1) }
  const goToToday = () => { currentWeek.value = startOfWeek(new Date()) }
  const isCurrentWeek = computed(() => isSameDay(startOfWeek(currentWeek.value), startOfWeek(new Date())))

  // --- Formats de date (langue courante) ---
  const formatter = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale.value, options)
  const dayName = (date: Date) => formatter({ weekday: 'long' }).format(date)
  const shortDayName = (date: Date) => formatter({ weekday: 'short' }).format(date)
  const shortDate = (date: Date) => formatter({ day: 'numeric', month: 'short' }).format(date)
  const longDate = (date: Date) => formatter({ weekday: 'long', day: 'numeric', month: 'long' }).format(date)
  const longDateString = (dateString: string) => {
    const date = fromDateString(dateString)
    return date ? longDate(date) : dateString
  }
  const weekLabel = computed(() => {
    const [first, , , , , , last] = weekDates(currentWeek.value)
    if (!first || !last) return ''
    return t('planning.weekRange', {
      from: formatter({ day: 'numeric', month: first.getMonth() === last.getMonth() ? undefined : 'short' }).format(first),
      to: formatter({ day: 'numeric', month: 'long', year: 'numeric' }).format(last)
    })
  })
  const slotLabel = (mealType: MealType) => t(`planning.meals.${mealType}`)

  // --- Actions avec retour utilisateur ---
  const notifyError = (error: unknown) => {
    toast.add({ title: t('planning.toast.error'), description: toUserMessage(error), color: 'error', icon: 'i-lucide-triangle-alert' })
  }
  const notifySuccess = (title: string, description?: string) => {
    toast.add({ title, description, color: 'success', icon: 'i-lucide-check' })
  }

  /** Exécute une action du store ; `true` si elle a réussi (sinon toast d'erreur). */
  const run = async (action: () => Promise<void>, success?: { title: string, description?: string }): Promise<boolean> => {
    try {
      await action()
      if (success) notifySuccess(success.title, success.description)
      return true
    } catch (error) {
      notifyError(error)
      return false
    }
  }

  const addRecipe = (dateString: string, mealType: MealType, recipe: { id: string, title: string }) =>
    run(() => store.addMeal(dateString, mealType, recipe), {
      title: t('planning.toast.added'),
      description: t('planning.toast.addedDescription', { title: recipe.title, date: longDateString(dateString), slot: slotLabel(mealType) })
    })

  const addCustom = (dateString: string, mealType: MealType, title: string) =>
    run(() => store.addCustomMeal(dateString, mealType, title), {
      title: t('planning.toast.added'),
      description: t('planning.toast.addedDescription', { title, date: longDateString(dateString), slot: slotLabel(mealType) })
    })

  const remove = (meal: PlanningMeal) =>
    run(() => store.removeMeal(meal.id), { title: t('planning.toast.removed'), description: mealTitle(meal) })

  const move = (meal: PlanningMeal, toDate: string, toMealType: MealType) =>
    run(() => store.moveMeal(meal.id, toDate, toMealType), {
      title: t('planning.toast.moved'),
      description: t('planning.toast.addedDescription', { title: mealTitle(meal), date: longDateString(toDate), slot: slotLabel(toMealType) })
    })

  const saveNote = (dateString: string, noteType: NoteType, content: string | null) =>
    run(() => store.saveNote(dateString, noteType, content))

  return {
    store,
    currentWeek,
    weekKey,
    weekLabel,
    days,
    isEmptyWeek,
    isCurrentWeek,
    previousWeek,
    nextWeek,
    goToToday,
    dayName,
    shortDayName,
    shortDate,
    longDate,
    longDateString,
    slotLabel,
    addRecipe,
    addCustom,
    remove,
    move,
    saveNote
  }
}
