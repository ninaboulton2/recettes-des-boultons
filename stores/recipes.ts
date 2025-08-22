import { defineStore } from 'pinia'
import { ref, computed, onMounted, readonly } from 'vue'

export const useRecipesStore = defineStore('recipes', () => {
  const recipes = ref([])
  const favorites = ref([])
  const currentCategory = ref(null)
  const searchQuery = ref('')
  const selectedTags = ref([])
  const isLoading = ref(false)

  // Computed properties
  const filteredRecipes = computed(() => {
    let filtered = recipes.value

    if (currentCategory.value) {
      filtered = filtered.filter(recipe => recipe.category === currentCategory.value)
    }

    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      filtered = filtered.filter(recipe => 
        recipe.title.toLowerCase().includes(query) ||
        recipe.description.toLowerCase().includes(query) ||
        recipe.tags.some(tag => tag.toLowerCase().includes(query))
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
    const tagsSet = new Set()
    recipes.value.forEach(recipe => {
      recipe.tags.forEach(tag => tagsSet.add(tag))
    })
    return Array.from(tagsSet).sort()
  })

  // Get tags for current category
  const categoryTags = computed(() => {
    if (!currentCategory.value) return allTags.value
    
    const tagsSet = new Set()
    recipes.value
      .filter(recipe => recipe.category === currentCategory.value)
      .forEach(recipe => {
        recipe.tags.forEach(tag => tagsSet.add(tag))
      })
    return Array.from(tagsSet).sort()
  })

  const recipesByCategory = computed(() => {
    const grouped = {
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
      grouped[recipe.category].push(recipe)
    })

    return grouped
  })

  // Helper function to check if a recipe is favorite
  const isFavorite = (recipeId) => {
    return favorites.value.some(recipe => recipe.id === recipeId)
  }

  // Actions
  const addRecipe = async (recipe) => {
    try {
      isLoading.value = true
      
      // Validate recipe before adding
      if (!recipe || !recipe.title || !recipe.category) {
        throw new Error('Données de recette invalides')
      }

      // Appeler l'API pour ajouter la recette
      const response = await fetch('/api/add-recipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipe })
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success) {
        // Ajouter directement au store local
        recipes.value.push(result.recipe)
        
        // Sauvegarder dans localStorage
        saveToLocalStorage()
        
        console.log('Recette ajoutée avec succès:', result.message)
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

  const updateRecipe = async (id, updates) => {
    try {
      isLoading.value = true
      
      const index = recipes.value.findIndex(recipe => recipe.id === id)
      if (index === -1) {
        throw new Error('Recette non trouvée')
      }

      // Appeler l'API pour mettre à jour la recette
      const response = await fetch(`/api/update-recipe?id=${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates })
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success) {
        // Mettre à jour localement pour la réactivité
        recipes.value[index] = result.recipe

        // Mettre à jour les favoris si nécessaire
        const favoriteIndex = favorites.value.findIndex(r => r.id === id)
        if (favoriteIndex !== -1) {
          favorites.value[favoriteIndex] = result.recipe
        }

        // Sauvegarder dans localStorage
        saveToLocalStorage()
        
        console.log('Recette mise à jour avec succès:', result.message)
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

  const deleteRecipe = async (id) => {
    try {
      isLoading.value = true
      
      console.log('Tentative de suppression de la recette avec ID:', id, 'Type:', typeof id)
      console.log('Recettes disponibles:', recipes.value.map(r => ({ id: r.id, title: r.title, type: typeof r.id })))
      
      // Appeler l'API pour supprimer la recette du fichier JSON
      const response = await fetch(`/api/delete-recipe?id=${id}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.success) {
        // Supprimer de la mémoire locale immédiatement
        recipes.value = recipes.value.filter(recipe => recipe.id !== id)
        favorites.value = favorites.value.filter(recipe => recipe.id !== id)
        saveToLocalStorage()
        
        console.log('Recette supprimée avec succès:', result.message)
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

  const toggleFavorite = (recipe) => {
    try {
      const favoriteIndex = favorites.value.findIndex(r => r.id === recipe.id)
      
      if (favoriteIndex !== -1) {
        // Retirer des favoris
        favorites.value.splice(favoriteIndex, 1)
        console.log('Recette retirée des favoris:', recipe.title)
      } else {
        // Ajouter aux favoris
        favorites.value.push(recipe)
        console.log('Recette ajoutée aux favoris:', recipe.title)
      }
      
      // Sauvegarder dans localStorage
      saveToLocalStorage()
      
    } catch (error) {
      console.error('Erreur lors de la mise à jour du favori:', error)
      throw error
    }
  }

  const setCategory = (category) => {
    currentCategory.value = category
    // Clear selected tags when category changes
    selectedTags.value = []
  }

  const setSearchQuery = (query) => {
    searchQuery.value = query
  }

  const toggleTag = (tag) => {
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

  // Local storage
  const saveToLocalStorage = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('boultons-recipes', JSON.stringify(recipes.value))
      localStorage.setItem('boultons-favorites', JSON.stringify(favorites.value))
    }
  }

  const loadFromLocalStorage = async () => {
    if (typeof window !== 'undefined') {
      try {
        // Try to load from localStorage first
        const storedRecipes = localStorage.getItem('boultons-recipes')
        const storedFavorites = localStorage.getItem('boultons-favorites')
        
        if (storedRecipes && storedFavorites) {
          // Load from localStorage if available
          const parsedRecipes = JSON.parse(storedRecipes)
          const parsedFavorites = JSON.parse(storedFavorites)
          
          // Validate and clean recipes data
          recipes.value = parsedRecipes.filter(recipe => 
            recipe && recipe.id && recipe.title && recipe.category
          )
          favorites.value = parsedFavorites.filter(recipe => 
            recipe && recipe.id && recipe.title && recipe.category
          )
          
          console.log('Recettes chargées depuis localStorage:', recipes.value.length)
        } else {
          // Load from JSON file if localStorage is empty
          await loadFromJSON()
        }
      } catch (error) {
        console.error('Error loading recipes:', error)
        recipes.value = []
        favorites.value = []
      }
    }
  }

  const loadFromJSON = async () => {
    try {
      isLoading.value = true
      
      const response = await fetch('/data/recipes.json')
      const data = await response.json()
      
      // Validate and clean recipes data - remove favorite attribute
      recipes.value = data.recipes.filter(recipe => 
        recipe && recipe.id && recipe.title && recipe.category
      ).map(recipe => {
        // Remove favorite attribute from recipe data
        const { favorite, ...recipeWithoutFavorite } = recipe
        return recipeWithoutFavorite
      })
      
      // Load favorites from localStorage if available, otherwise start with empty array
      if (typeof window !== 'undefined') {
        const storedFavorites = localStorage.getItem('boultons-favorites')
        if (storedFavorites) {
          favorites.value = JSON.parse(storedFavorites).filter(recipe => 
            recipe && recipe.id && recipe.title && recipe.category
          )
        } else {
          favorites.value = []
        }
      }
      
      console.log('Recettes chargées depuis JSON:', recipes.value.length)
      
      // Save to localStorage for future use
      saveToLocalStorage()
    } catch (error) {
      console.error('Error loading recipes from JSON:', error)
      recipes.value = []
      favorites.value = []
    } finally {
      isLoading.value = false
    }
  }

  // Initialize
  onMounted(() => {
    loadFromLocalStorage()
  })

  return {
    // State
    recipes: readonly(recipes),
    favorites: readonly(favorites),
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
    toggleFavorite,
    isFavorite,
    setCategory,
    setSearchQuery,
    toggleTag,
    clearFilters,
    loadFromLocalStorage,
    loadFromJSON
  }
}) 