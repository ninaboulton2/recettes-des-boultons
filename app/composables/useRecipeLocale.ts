import { computed } from 'vue'
import type { Recipe, RecipeLang, RecipeSummary } from '#shared/types'
import { localizeRecipe, localizeSummary } from '#shared/utils/translation'

/**
 * Langue d'affichage des recettes = langue de l'interface (`/` français,
 * `/en` anglais). Les recettes sont lues dans leur langue d'origine avec leur
 * traduction éventuelle ; ces fonctions choisissent le texte à montrer (repli
 * sur le texte d'origine quand il n'y a pas de traduction valide) et suivent
 * le changement de langue sans rechargement.
 */
export function useRecipeLocale() {
  const { locale } = useI18n()
  const lang = computed<RecipeLang>(() => (locale.value === 'en' ? 'en' : 'fr'))

  const localizeCard = <T extends RecipeSummary>(recipe: T) => localizeSummary(recipe, lang.value)
  const localizeFull = (recipe: Recipe) => localizeRecipe(recipe, lang.value)

  return { lang, localizeCard, localizeFull }
}
