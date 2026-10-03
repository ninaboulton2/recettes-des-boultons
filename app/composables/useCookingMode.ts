import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { Recipe, RecipeSection } from '#shared/types'
import { flattenSteps, sectionsWithIngredients } from '#shared/utils/recipes'

/**
 * Mode cuisine : une étape à la fois, navigation précédent/suivant, ingrédients
 * de la section courante, écran maintenu allumé (Wake Lock API, silencieux si
 * non supportée) et raccourcis clavier ←/→/Échap tant que le mode est ouvert.
 */
export function useCookingMode(recipe: MaybeRefOrGetter<Recipe | null | undefined>) {
  const isOpen = ref(false)
  const currentIndex = ref(0)

  const steps = computed(() => flattenSteps(toValue(recipe)?.sections ?? []))
  const stepCount = computed(() => steps.value.length)
  const current = computed(() => steps.value[currentIndex.value] ?? null)
  const hasPrev = computed(() => currentIndex.value > 0)
  const hasNext = computed(() => currentIndex.value < stepCount.value - 1)
  const progress = computed(() => (stepCount.value === 0 ? 0 : Math.round(((currentIndex.value + 1) / stepCount.value) * 100)))

  /**
   * Ingrédients à afficher avec l'étape : ceux de la section de l'étape si elle
   * en a, sinon la section d'ingrédients de même nom (recettes où ingrédients
   * et étapes sont dans des sections séparées), sinon l'unique section
   * d'ingrédients de la recette.
   */
  const currentIngredientSection = computed<RecipeSection | null>(() => {
    const sections = toValue(recipe)?.sections ?? []
    const step = current.value
    if (!step) return null
    const own = sections.find(section => section.id === step.sectionId)
    if (own && own.ingredients.length > 0) return own
    const withIngredients = sectionsWithIngredients(sections)
    const sameName = withIngredients.find(section => section.name.trim().toLowerCase() === step.sectionName.trim().toLowerCase())
    if (sameName) return sameName
    return withIngredients.length === 1 ? (withIngredients[0] ?? null) : null
  })

  // --- Wake Lock -------------------------------------------------------------
  const wakeLock = ref<WakeLockSentinel | null>(null)
  const wakeLockActive = computed(() => wakeLock.value !== null)

  const requestWakeLock = async () => {
    if (!import.meta.client || !('wakeLock' in navigator) || wakeLock.value) return
    try {
      const sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => {
        if (wakeLock.value === sentinel) wakeLock.value = null
      })
      wakeLock.value = sentinel
    } catch {
      // Non supporté, refusé (batterie faible, onglet masqué…) : on continue sans.
      wakeLock.value = null
    }
  }

  const releaseWakeLock = async () => {
    const sentinel = wakeLock.value
    wakeLock.value = null
    if (!sentinel) return
    try {
      await sentinel.release()
    } catch {
      // Déjà relâché par le navigateur.
    }
  }

  // Le navigateur relâche le verrou quand l'onglet passe en arrière-plan : on le redemande au retour.
  const onVisibilityChange = () => {
    if (isOpen.value && document.visibilityState === 'visible') void requestWakeLock()
  }

  // --- Navigation ------------------------------------------------------------
  const goTo = (index: number) => {
    if (stepCount.value === 0) return
    currentIndex.value = Math.min(stepCount.value - 1, Math.max(0, index))
  }
  const next = () => goTo(currentIndex.value + 1)
  const prev = () => goTo(currentIndex.value - 1)

  const open = (index = 0) => {
    goTo(index)
    isOpen.value = true
  }
  const close = () => {
    isOpen.value = false
  }

  const onKeydown = (event: KeyboardEvent) => {
    if (!isOpen.value) return
    const target = event.target
    if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        next()
        break
      case 'ArrowLeft':
        event.preventDefault()
        prev()
        break
      case 'Escape':
        close()
        break
    }
  }

  watch(isOpen, (opened) => {
    if (!import.meta.client) return
    if (opened) {
      window.addEventListener('keydown', onKeydown)
      document.addEventListener('visibilitychange', onVisibilityChange)
      void requestWakeLock()
    } else {
      window.removeEventListener('keydown', onKeydown)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void releaseWakeLock()
    }
  })

  // Si la recette change (navigation), on repart du début.
  watch(steps, () => {
    if (currentIndex.value >= stepCount.value) currentIndex.value = 0
  })

  onScopeDispose(() => {
    if (!import.meta.client) return
    window.removeEventListener('keydown', onKeydown)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void releaseWakeLock()
  })

  return {
    isOpen,
    steps,
    stepCount,
    currentIndex,
    current,
    currentIngredientSection,
    hasPrev,
    hasNext,
    progress,
    wakeLockActive,
    open,
    close,
    next,
    prev,
    goTo
  }
}
