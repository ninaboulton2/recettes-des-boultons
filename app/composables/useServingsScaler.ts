import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { Ingredient, Recipe } from '#shared/types'
import { formatScaledAmount, servingsFactor } from '#shared/utils/recipes'

export const MIN_SERVINGS = 1
export const MAX_SERVINGS = 99

/**
 * Ajustement des portions d'une recette : `servings` est la cible choisie par
 * l'utilisateur, `factor` le rapport avec les portions de la recette, et
 * `scaledAmount(ingredient)` la quantité recalculée avec un arrondi lisible
 * (fractions pour les petits nombres, une décimale sinon — voir
 * `formatScaledAmount`). La cible revient aux portions d'origine quand la
 * recette change.
 */
export function useServingsScaler(recipe: MaybeRefOrGetter<Recipe | null | undefined>) {
  const baseServings = computed<number | null>(() => {
    const value = toValue(recipe)?.servings
    return value && value > 0 ? value : null
  })

  const servings = ref<number | null>(baseServings.value)
  watch(baseServings, (value) => {
    servings.value = value
  })

  /** Sans portions renseignées, rien à mettre à l'échelle. */
  const canScale = computed(() => baseServings.value !== null)
  const factor = computed(() => servingsFactor(baseServings.value, servings.value))
  const isScaled = computed(() => factor.value !== 1)

  const setServings = (value: number) => {
    if (!canScale.value || !Number.isFinite(value)) return
    servings.value = Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(value)))
  }
  const increment = () => {
    if (servings.value !== null) setServings(servings.value + 1)
  }
  const decrement = () => {
    if (servings.value !== null) setServings(servings.value - 1)
  }
  const reset = () => {
    servings.value = baseServings.value
  }

  const numberLocale = useNumberLocale()
  const scaledAmount = (ingredient: Pick<Ingredient, 'amount' | 'amountNum'>): string =>
    formatScaledAmount(ingredient.amountNum, ingredient.amount, factor.value, numberLocale.value)

  return { baseServings, servings, canScale, factor, isScaled, setServings, increment, decrement, reset, scaledAmount }
}
