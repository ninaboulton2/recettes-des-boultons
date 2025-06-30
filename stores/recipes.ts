import { defineStore } from 'pinia'
import { sampleRecipes } from '~/data/recipes'

export const useRecipesStore = defineStore('recipes', () => {
  const recipes = ref([])
  const favorites = ref([])
  const currentCategory = ref(null)
  const searchQuery = ref('')

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

    return filtered
  })

  const recipesByCategory = computed(() => {
    const grouped = {
      soupes: [],
      entrees: [],
      plats: [],
      poissons: [],
      viandes: [],
      'yaourts-fromages': [],
      desserts: [],
      boissons: []
    }

    recipes.value.forEach(recipe => {
      grouped[recipe.category].push(recipe)
    })

    return grouped
  })

  // Actions
  const addRecipe = (recipe) => {
    recipes.value.push(recipe)
    saveToLocalStorage()
  }

  const updateRecipe = (id, updates) => {
    const index = recipes.value.findIndex(recipe => recipe.id === id)
    if (index !== -1) {
      recipes.value[index] = { ...recipes.value[index], ...updates, updatedAt: new Date() }
      saveToLocalStorage()
    }
  }

  const deleteRecipe = (id) => {
    recipes.value = recipes.value.filter(recipe => recipe.id !== id)
    favorites.value = favorites.value.filter(recipe => recipe.id !== id)
    saveToLocalStorage()
  }

  const toggleFavorite = (recipe) => {
    const index = recipes.value.findIndex(r => r.id === recipe.id)
    if (index !== -1) {
      recipes.value[index].favorite = !recipes.value[index].favorite
      
      if (recipes.value[index].favorite) {
        favorites.value.push(recipes.value[index])
      } else {
        favorites.value = favorites.value.filter(r => r.id !== recipe.id)
      }
      
      saveToLocalStorage()
    }
  }

  const setCategory = (category) => {
    currentCategory.value = category
  }

  const setSearchQuery = (query) => {
    searchQuery.value = query
  }

  const clearFilters = () => {
    currentCategory.value = null
    searchQuery.value = ''
  }

  // Local storage
  const saveToLocalStorage = () => {
    if (process.client) {
      localStorage.setItem('boultons-recipes', JSON.stringify(recipes.value))
      localStorage.setItem('boultons-favorites', JSON.stringify(favorites.value))
    }
  }

  const loadFromLocalStorage = () => {
    if (process.client) {
      const savedRecipes = localStorage.getItem('boultons-recipes')
      const savedFavorites = localStorage.getItem('boultons-favorites')
      
      if (savedRecipes) {
        recipes.value = JSON.parse(savedRecipes)
      } else {
        // Load sample data if no saved data
        recipes.value = sampleRecipes
      }
      
      if (savedFavorites) {
        favorites.value = JSON.parse(savedFavorites)
      } else {
        // Load favorites from sample data
        favorites.value = sampleRecipes.filter(recipe => recipe.favorite)
      }
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
    
    // Computed
    filteredRecipes,
    recipesByCategory,
    
    // Actions
    addRecipe,
    updateRecipe,
    deleteRecipe,
    toggleFavorite,
    setCategory,
    setSearchQuery,
    clearFilters
  }
}) 