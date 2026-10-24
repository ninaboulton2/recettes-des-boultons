import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '~/composables/useApi'
import { apiErrorFromResponse, translateKey } from '~/composables/useApiError'
import { useRecipePhoto } from '~/composables/useRecipePhoto'
import type { Recipe, RecipeInput, RecipeLang } from '#shared/types'
import type { TranslationDraft } from '#shared/utils/translation'
import type { TranslationResult } from '#shared/schemas/translation'

interface RecipeMutationResponse {
  success: boolean
  recipe: Recipe
  /** Traduction de la recette (0016) : fournie, générée, inchangée ou échouée. */
  translation?: TranslationResult
  message?: string
}

/** Langue d'origine et traduction livrées par le traducteur IA avec la recette. */
export interface RecipeTranslationInput {
  lang: RecipeLang
  translation: TranslationDraft
}

interface DeleteResponse {
  success: boolean
  message?: string
}

/**
 * Store « recettes » : uniquement l'état d'interface (catégorie, recherche,
 * tags) et les actions d'écriture.
 *
 * Les lectures ne passent plus par ici : la liste vient de la RPC
 * `search_recipes` (`useRecipeSearch`), la fiche d'une requête ciblée
 * (`useRecipe`), les facettes de `useRecipeFacets`. Ces composables observent
 * `revision` : appeler `refresh()` après une écriture les fait recharger.
 */
export const useRecipesStore = defineStore('recipes', () => {
  const { removeRecipePhotos } = useRecipePhoto()
  const v2 = useV2()
  const currentCategory = ref<string | null>(null)
  const searchQuery = ref('')
  const selectedTags = ref<string[]>([])
  const isLoading = ref(false)

  /**
   * Résultat de la traduction de la dernière écriture (0016) : l'éditeur et le
   * traducteur préviennent quand l'enregistrement a réussi mais pas la traduction.
   */
  const lastTranslation = ref<TranslationResult | null>(null)

  /** Incrémenté à chaque écriture ; observé par les lectures (`useAsyncData`). */
  const revision = ref(0)

  /** Signale aux lectures (liste, fiche, facettes) que les données ont changé. */
  const refresh = () => {
    revision.value++
  }

  // Actions
  const addRecipe = async (recipe: RecipeInput, translation?: RecipeTranslationInput) => {
    try {
      isLoading.value = true

      // Validate recipe before adding
      if (!recipe || !recipe.title || !recipe.category) {
        throw new Error(translateKey('errors.invalidRecipe', 'Données de recette invalides'))
      }

      // Appeler l'API pour ajouter la recette
      const response = await apiFetch('/api/add-recipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipe, ...(translation ?? {}) })
      })

      if (!response.ok) {
        throw await apiErrorFromResponse(response)
      }

      const result = (await response.json()) as RecipeMutationResponse

      if (result.success) {
        lastTranslation.value = result.translation ?? null
        refresh()

        return result.recipe
      } else {
        throw new Error(translateKey('errors.generic', 'Une erreur est survenue, réessayez plus tard.'))
      }
    } catch (error) {
      console.error('Erreur lors de l\'ajout de la recette:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const updateRecipe = async (id: string, updates: RecipeInput) => {
    try {
      isLoading.value = true

      // Appeler l'API pour mettre à jour la recette
      const response = await apiFetch(`/api/update-recipe?id=${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates })
      })

      if (!response.ok) {
        throw await apiErrorFromResponse(response)
      }

      const result = (await response.json()) as RecipeMutationResponse

      if (result.success) {
        lastTranslation.value = result.translation ?? null
        refresh()

        return result.recipe
      } else {
        throw new Error(translateKey('errors.generic', 'Une erreur est survenue, réessayez plus tard.'))
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la recette:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  /** Supprime la recette ; ses photos (bucket `recipe-photos`) sont retirées d'abord (v1) ou par le serveur après coup (v2). */
  const deleteRecipe = async (id: string) => {
    try {
      isLoading.value = true

      // v1 : photos retirées par le navigateur, avant la suppression. v2 : par le serveur (/api/delete-recipe), APRÈS la
      // suppression réussie (une suppression refusée ne doit pas faire perdre la photo).
      if (!v2) {
        try {
          await removeRecipePhotos(id)
        } catch (photoError) {
          console.warn('[recettes] photos non supprimées du bucket', photoError)
        }
      }

      // Appeler l'API pour supprimer la recette
      const response = await apiFetch(`/api/delete-recipe?id=${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw await apiErrorFromResponse(response)
      }

      const result = (await response.json()) as DeleteResponse

      if (result.success) {
        refresh()
        return result
      } else {
        throw new Error(translateKey('errors.generic', 'Une erreur est survenue, réessayez plus tard.'))
      }
    } catch (error) {
      console.error('Erreur lors de la suppression de la recette:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const setCategory = (category: string | null) => {
    currentCategory.value = category
    // Clear selected tags when category changes
    selectedTags.value = []
  }

  const setSearchQuery = (query: string) => {
    searchQuery.value = query
  }

  const toggleTag = (tag: string) => {
    const index = selectedTags.value.findIndex(t => t.toLowerCase() === tag.toLowerCase())
    if (index !== -1) {
      selectedTags.value.splice(index, 1)
    } else {
      selectedTags.value.push(tag)
    }
  }

  const clearFilters = () => {
    currentCategory.value = null
    searchQuery.value = ''
    selectedTags.value = []
  }

  return {
    // State (interface)
    currentCategory,
    searchQuery,
    selectedTags,
    isLoading,
    revision,
    lastTranslation,

    // Actions
    addRecipe,
    updateRecipe,
    deleteRecipe,
    setCategory,
    setSearchQuery,
    toggleTag,
    clearFilters,
    refresh
  }
})
