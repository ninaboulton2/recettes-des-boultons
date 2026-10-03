import { defineStore } from 'pinia'
import { ref, computed, onMounted, readonly } from 'vue'
import { apiFetch } from '~/composables/useApi'
import { normalizeAccents } from '#shared/utils/text'
import type { Recipe } from '#shared/types'

interface RecipesApiResponse {
  success: boolean
  recipes: Recipe[]
  error?: string
}

interface RecipeMutationResponse {
  success: boolean
  recipe: Recipe
  message?: string
}

interface DeleteResponse {
  success: boolean
  message?: string
}

export const useRecipesStore = defineStore('recipes', () => {
  const recipes = ref<Recipe[]>([])
  const currentCategory = ref<string | null>(null)
  const searchQuery = ref('')
  const selectedTags = ref<string[]>([])
  const isLoading = ref(false)

  // Computed properties
  const filteredRecipes = computed(() => {
    let filtered = recipes.value

    if (currentCategory.value) {
      filtered = filtered.filter(recipe => recipe.category === currentCategory.value)
    }

    if (searchQuery.value) {
      const normalizedQuery = normalizeAccents(searchQuery.value)
      filtered = filtered.filter(recipe => 
        normalizeAccents(recipe.title).includes(normalizedQuery) ||
        normalizeAccents(recipe.description).includes(normalizedQuery) ||
        recipe.tags.some(tag => normalizeAccents(tag).includes(normalizedQuery))
      )
    }

    if (selectedTags.value.length > 0) {
      filtered = filtered.filter(recipe => 
        selectedTags.value.some(selectedTag => 
          recipe.tags.some(tag => tag.toLowerCase() === selectedTag.toLowerCase())
        )
      )
    }

    return filtered
  })

  // Get all unique tags from recipes
  const allTags = computed(() => {
    const tagsSet = new Set<string>()
    recipes.value.forEach(recipe => {
      if (recipe.tags && Array.isArray(recipe.tags)) {
        recipe.tags.forEach(tag => tagsSet.add(tag))
      }
    })
    return Array.from(tagsSet).sort()
  })

  // Get tags for current category
  const categoryTags = computed(() => {
    if (!currentCategory.value) return allTags.value
    
    const tagsSet = new Set<string>()
    recipes.value
      .filter(recipe => recipe.category === currentCategory.value)
      .forEach(recipe => {
        if (recipe.tags && Array.isArray(recipe.tags)) {
          recipe.tags.forEach(tag => tagsSet.add(tag))
        }
      })
    return Array.from(tagsSet).sort()
  })

  const recipesByCategory = computed(() => {
    const grouped: Record<string, Recipe[]> = {
      soupes: [],
      entrees: [],
      plats: [],
      poissons: [],
      viandes: [],
      'yaourts et fromages': [],
      'desserts et gâteaux': [],
      boissons: [],
      confitures: []
    }

    recipes.value.forEach(recipe => {
      grouped[recipe.category]?.push(recipe)
    })

    return grouped
  })

  // Actions
  const addRecipe = async (recipe: Partial<Recipe>) => {
    try {
      isLoading.value = true
      
      // Validate recipe before adding
      if (!recipe || !recipe.title || !recipe.category) {
        throw new Error('Données de recette invalides')
      }

      // Appeler l'API pour ajouter la recette
      const response = await apiFetch('/api/add-recipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipe })
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const result = (await response.json()) as RecipeMutationResponse
      
      if (result.success) {
        // Ajouter directement au store local
        recipes.value.push(result.recipe)
        
        return result.recipe
      } else {
        throw new Error(result.message || 'Erreur lors de l\'ajout de la recette')
      }
    } catch (error) {
      console.error('Erreur lors de l\'ajout de la recette:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const updateRecipe = async (id: string, updates: Partial<Recipe>) => {
    try {
      isLoading.value = true
      
      const index = recipes.value.findIndex(recipe => recipe.id === id)
      if (index === -1) {
        throw new Error('Recette non trouvée')
      }

      // Appeler l'API pour mettre à jour la recette
      const response = await apiFetch(`/api/update-recipe?id=${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates })
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const result = (await response.json()) as RecipeMutationResponse
      
      if (result.success) {
        // Mettre à jour localement pour la réactivité
        recipes.value[index] = result.recipe
        
        return result.recipe
      } else {
        throw new Error(result.message || 'Erreur lors de la mise à jour')
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la recette:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const deleteRecipe = async (id: string) => {
    try {
      isLoading.value = true
            
      // Appeler l'API pour supprimer la recette
      const response = await apiFetch(`/api/delete-recipe?id=${id}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }
      
      const result = (await response.json()) as DeleteResponse
      
      if (result.success) {
        // Supprimer de la mémoire locale immédiatement
        recipes.value = recipes.value.filter(recipe => recipe.id !== id)
        return result
      } else {
        throw new Error(result.message || 'Erreur lors de la suppression')
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

  // Charger les recettes depuis Supabase
  const loadFromSupabase = async () => {
    try {
      isLoading.value = true
      
      // Utiliser la nouvelle API Supabase
      const response = await apiFetch('/api/recipes')
      const data = (await response.json()) as RecipesApiResponse
      
      if (data.success) {
        // Validate and clean recipes data
        recipes.value = data.recipes.filter(recipe => 
          recipe && recipe.id && recipe.title && recipe.category
        )
        
        console.log('Recettes chargées depuis Supabase:', recipes.value.length)
      } else {
        console.error('Erreur lors du chargement des recettes:', data.error)
        recipes.value = []
      }
      
    } catch (error) {
      console.error('Error loading recipes:', error)
      recipes.value = []
    } finally {
      isLoading.value = false
    }
  }

  // Initialize
  onMounted(() => {
    loadFromSupabase()
  })

  return {
    // State
    recipes: readonly(recipes),
    currentCategory: readonly(currentCategory),
    searchQuery: readonly(searchQuery),
    selectedTags: readonly(selectedTags),
    isLoading: readonly(isLoading),
    
    // Computed
    filteredRecipes,
    allTags,
    categoryTags,
    recipesByCategory,
    
    // Actions
    addRecipe,
    updateRecipe,
    deleteRecipe,
    setCategory,
    setSearchQuery,
    toggleTag,
    clearFilters,
    loadFromSupabase
  }
})
