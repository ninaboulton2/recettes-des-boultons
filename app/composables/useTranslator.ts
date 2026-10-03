import type { Recipe, RecipeInput as StoreRecipeInput } from '#shared/types'
import type { RecipeInput } from '#shared/schemas/recipe'
import { amountToText } from '#shared/schemas/common'
import type { AiTargetLanguage, TranslateRecipeResponse, TranslateUsageInfo } from '#shared/schemas/ai'
import { apiFetch } from '~/composables/useApi'

/**
 * État et actions de la page /traducteur :
 *  1. `translate()` : texte collé → `POST /api/translate-recipe` → aperçu (`preview`, un `RecipeInput`) ;
 *  2. `addToRecipes()` : aperçu → `useRecipesStore().addRecipe()` → recette créée (`added`) ;
 *  3. `editText()` / `reset()` pour revenir en arrière.
 *
 * Les erreurs passent par `toUserMessage` (messages serveur en français pour
 * les 4xx, générique sinon) ; les 502/504 du fournisseur IA, que
 * `toUserMessage` rendrait génériques, reçoivent un message i18n dédié.
 */

export type TranslatorStep = 'input' | 'preview' | 'done'

export const RECIPE_TEXT_MIN = 20
export const RECIPE_TEXT_MAX = 20000

/**
 * Le serveur renvoie la forme validée par `recipeInputSchema` (quantités
 * numériques, `null` autorisés, `unitCode`) ; le store attend la forme de
 * l'éditeur (`#shared/types` : textes, `undefined`). `unitCode` est conservé
 * par le spread : `POST /api/add-recipe` l'accepte.
 */
export function toStoreRecipeInput(recipe: RecipeInput): StoreRecipeInput {
  return {
    title: recipe.title,
    category: recipe.category,
    description: recipe.description ?? undefined,
    notes: recipe.notes ?? undefined,
    image: recipe.image ?? undefined,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    servings: recipe.servings,
    tags: recipe.tags ?? [],
    sections: (recipe.sections ?? []).map((section, sectionIndex) => ({
      name: section.name ?? '',
      type: section.type ?? 'mixed',
      orderIndex: section.orderIndex ?? sectionIndex,
      ingredients: (section.ingredients ?? []).map((ingredient, ingredientIndex) => ({
        ...ingredient,
        amount: amountToText(ingredient.amount),
        unit: ingredient.unit ?? null,
        optional: ingredient.optional ?? false,
        orderIndex: ingredient.orderIndex ?? ingredientIndex
      })),
      instructions: (section.instructions ?? []).map((step, stepIndex) =>
        typeof step === 'string'
          ? { content: step, orderIndex: stepIndex }
          : { content: step.content, orderIndex: step.orderIndex ?? stepIndex })
    }))
  }
}

export function useTranslator() {
  const { t } = useI18n()
  const recipesStore = useRecipesStore()
  const { toUserMessage, apiErrorFromResponse, isApiError } = useApiError()

  const recipeText = ref('')
  const targetLanguage = ref<AiTargetLanguage>('fr')
  const isTranslating = ref(false)
  const isAdding = ref(false)
  const preview = ref<RecipeInput | null>(null)
  const usage = ref<TranslateUsageInfo | null>(null)
  const added = ref<Recipe | null>(null)
  const error = ref<string | null>(null)

  const step = computed<TranslatorStep>(() => {
    if (added.value) return 'done'
    if (preview.value) return 'preview'
    return 'input'
  })

  const textLength = computed(() => recipeText.value.trim().length)
  const canTranslate = computed(() =>
    !isTranslating.value && textLength.value >= RECIPE_TEXT_MIN && textLength.value <= RECIPE_TEXT_MAX)

  function describeError(err: unknown): string {
    if (isApiError(err)) {
      if (err.statusCode === 502) return t('translator.errors.unavailable')
      if (err.statusCode === 504) return t('translator.errors.timeout')
    }
    return toUserMessage(err)
  }

  async function translate(): Promise<void> {
    if (!canTranslate.value) return
    isTranslating.value = true
    error.value = null
    try {
      const response = await apiFetch('/api/translate-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeText: recipeText.value.trim(), targetLanguage: targetLanguage.value })
      })
      if (!response.ok) throw await apiErrorFromResponse(response)
      const data = (await response.json()) as TranslateRecipeResponse
      preview.value = data.recipe
      usage.value = data.usage
    } catch (err: unknown) {
      error.value = describeError(err)
    } finally {
      isTranslating.value = false
    }
  }

  async function addToRecipes(): Promise<void> {
    if (!preview.value || isAdding.value) return
    isAdding.value = true
    error.value = null
    try {
      added.value = await recipesStore.addRecipe(toStoreRecipeInput(preview.value))
    } catch (err: unknown) {
      error.value = describeError(err)
    } finally {
      isAdding.value = false
    }
  }

  /** Retour à la saisie en conservant le texte collé. */
  function editText(): void {
    preview.value = null
    usage.value = null
    error.value = null
  }

  function reset(): void {
    recipeText.value = ''
    targetLanguage.value = 'fr'
    preview.value = null
    usage.value = null
    added.value = null
    error.value = null
  }

  return {
    recipeText,
    targetLanguage,
    isTranslating,
    isAdding,
    preview,
    usage,
    added,
    error,
    step,
    textLength,
    canTranslate,
    translate,
    addToRecipes,
    editText,
    reset
  }
}
