import { defineStore } from 'pinia'
import type { Recipe } from '~/types'
import { useAuthStore } from './auth'

interface Favorite {
  id: string
  recipeId: string
  userId: string | null
  createdAt: string
  updatedAt: string
  recipe: Recipe | null
}

interface FavoritesState {
  favorites: Favorite[]
  isLoading: boolean
  error: string | null
}

export const useFavoritesStore = defineStore('favorites', {
  state: (): FavoritesState => ({
    favorites: [],
    isLoading: false,
    error: null
  }),

  getters: {
    favoriteIds: (state) => state.favorites.map(f => f.recipeId),
    isFavorite: (state) => (recipeId: string) => state.favorites.some(f => f.recipeId === recipeId),
    favoritesCount: (state) => state.favorites.length
  },

  actions: {
    async loadFavorites() {
      try {
        this.isLoading = true
        this.error = null
        
        const authStore = useAuthStore()
        const userId = authStore.currentUser?.id || null
        
        // Si pas d'utilisateur connecté, vider les favoris
        if (!userId) {
          this.favorites = []
          return
        }
        
        const response = await fetch(`/api/favorites?userId=${userId}`)
        
        if (!response.ok) {
          throw new Error(`Erreur HTTP: ${response.status}`)
        }
        
        const data = await response.json()
        if (data.success) {
          this.favorites = data.favorites
        } else {
          throw new Error('Erreur lors du chargement des favoris')
        }
      } catch (error) {
        console.error('Erreur chargement favoris:', error)
        this.error = error instanceof Error ? error.message : 'Erreur inconnue'
      } finally {
        this.isLoading = false
      }
    },

    async addFavorite(recipeId: string) {
      try {
        const authStore = useAuthStore()
        const userId = authStore.currentUser?.id || null
        
        if (!userId) {
          throw new Error('Vous devez être connecté pour ajouter des favoris')
        }
        
        const response = await fetch('/api/favorites', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ recipeId, userId })
        })

        if (!response.ok) {
          throw new Error(`Erreur HTTP: ${response.status}`)
        }

        const data = await response.json()
        if (data.success) {
          this.favorites.push(data.favorite)
          return { success: true, message: data.message }
        } else {
          throw new Error('Erreur lors de l\'ajout du favori')
        }
      } catch (error) {
        console.error('Erreur ajout favori:', error)
        this.error = error instanceof Error ? error.message : 'Erreur inconnue'
        return { success: false, error: this.error }
      }
    },

    async removeFavorite(recipeId: string) {
      try {
        const authStore = useAuthStore()
        const userId = authStore.currentUser?.id || null
        
        if (!userId) {
          throw new Error('Vous devez être connecté pour gérer vos favoris')
        }
        
        const response = await fetch(`/api/favorites?recipeId=${recipeId}&userId=${userId}`, {
          method: 'DELETE'
        })

        if (!response.ok) {
          throw new Error(`Erreur HTTP: ${response.status}`)
        }

        const data = await response.json()
        if (data.success) {
          this.favorites = this.favorites.filter(f => f.recipeId !== recipeId)
          return { success: true, message: data.message }
        } else {
          throw new Error('Erreur lors de la suppression du favori')
        }
      } catch (error) {
        console.error('Erreur suppression favori:', error)
        this.error = error instanceof Error ? error.message : 'Erreur inconnue'
        return { success: false, error: this.error }
      }
    },

    async toggleFavorite(recipeId: string) {
      if (this.isFavorite(recipeId)) {
        return await this.removeFavorite(recipeId)
      } else {
        return await this.addFavorite(recipeId)
      }
    },

    // Initialisation au démarrage de l'app
    async init() {
      await this.loadFavorites()
    },

    // Méthode pour recharger les favoris quand l'utilisateur change
    async refreshFavorites() {
      await this.loadFavorites()
    }
  }
})
