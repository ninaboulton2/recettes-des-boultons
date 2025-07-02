import { defineStore } from 'pinia'
import { ref, computed, onMounted, readonly } from 'vue'
import { sampleRecipes } from '~/data/recipes'

export const useRecipesStore = defineStore('recipes', () => {
  const recipes = ref([])
  const favorites = ref([])
  const currentCategory = ref(null)
  const searchQuery = ref('')
  const selectedTags = ref([])

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

  const loadFromLocalStorage = () => {
    if (typeof window !== 'undefined') {
      // Force reload sample data and clear localStorage
      localStorage.removeItem('boultons-recipes')
      localStorage.removeItem('boultons-favorites')
      
      // Load sample data
      recipes.value = sampleRecipes
      favorites.value = sampleRecipes.filter(recipe => recipe.favorite)
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
    setCategory,
    setSearchQuery,
    toggleTag,
    clearFilters
  }
}) 