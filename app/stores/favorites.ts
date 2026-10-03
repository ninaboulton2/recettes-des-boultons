import { defineStore } from 'pinia'
import { apiFetch } from '~/composables/useApi'
import { apiErrorFromResponse, toUserMessage } from '~/composables/useApiError'
import type { Favorite, RecipeSummary } from '#shared/types'
import type { Database } from '#shared/types/database'
import { RECIPE_SUMMARY_COLUMNS, toRecipeSummary } from '#shared/utils/recipes'
import { useAuthStore } from './auth'

interface FavoritesState {
  favorites: Favorite[]
  isLoading: boolean
  error: string | null
  /** Utilisateur pour lequel `favorites` a été chargé (`null` : personne). */
  loadedForUserId: string | null
}

/**
 * Favoris de l'utilisateur connecté.
 *
 * Lecture directe sous RLS (`favorites` + `recipes` par `in('id', …)`), rendue
 * côté serveur par la page `favoris` via `useAsyncData`. Les écritures passent
 * encore par `/api/favorites` (POST / DELETE).
 */
export const useFavoritesStore = defineStore('favorites', {
  state: (): FavoritesState => ({
    favorites: [],
    isLoading: false,
    error: null,
    loadedForUserId: null
  }),

  getters: {
    favoriteIds: (state) => state.favorites.map(f => f.recipeId),
    isFavorite: (state) => (recipeId: string) => state.favorites.some(f => f.recipeId === recipeId),
    favoritesCount: (state) => state.favorites.length
  },

  actions: {
    /**
     * Charge les favoris (et le résumé des recettes liées) de l'utilisateur
     * connecté. Lève l'erreur Supabase pour que `useAsyncData` la remonte.
     */
    async loadFavorites(): Promise<Favorite[]> {
      this.isLoading = true
      this.error = null

      try {
        const authStore = useAuthStore()
        const userId = authStore.currentUser?.id ?? null

        // Si pas d'utilisateur connecté, vider les favoris
        if (!userId) {
          this.favorites = []
          this.loadedForUserId = null
          return []
        }

        const supabase = useSupabaseClient<Database>()

        const { data: rows, error } = await supabase
          .from('favorites')
          .select('*')
          .order('created_at', { ascending: false })
        if (error) throw error

        const recipeIds = rows.map(row => row.recipe_id)
        const recipesById = new Map<string, RecipeSummary>()
        if (recipeIds.length > 0) {
          const { data: recipes, error: recipesError } = await supabase
            .from('recipes')
            .select(RECIPE_SUMMARY_COLUMNS)
            .in('id', recipeIds)
          if (recipesError) throw recipesError
          for (const recipe of recipes) {
            recipesById.set(recipe.id, toRecipeSummary(recipe))
          }
        }

        this.favorites = rows.map(row => ({
          id: row.id,
          recipeId: row.recipe_id,
          userId: row.user_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          recipe: recipesById.get(row.recipe_id) ?? null
        }))
        this.loadedForUserId = userId
        return this.favorites
      } catch (error) {
        console.error('Erreur chargement favoris:', error)
        this.error = error instanceof Error ? error.message : 'Erreur inconnue'
        throw error
      } finally {
        this.isLoading = false
      }
    },

    /** Recharge les favoris (à appeler après une écriture). Lève en cas d'erreur. */
    async refresh(): Promise<Favorite[]> {
      return this.loadFavorites()
    },

    /** Charge les favoris une seule fois par utilisateur (ex. cœurs des cartes). */
    async ensureLoaded(): Promise<void> {
      const authStore = useAuthStore()
      const userId = authStore.currentUser?.id ?? null
      if (this.isLoading || this.loadedForUserId === userId) return
      try {
        await this.loadFavorites()
      } catch {
        // Erreur déjà consignée dans `error`
      }
    },

    async addFavorite(recipeId: string) {
      try {
        const authStore = useAuthStore()
        const userId = authStore.currentUser?.id || null

        if (!userId) {
          throw new Error('Vous devez être connecté pour ajouter des favoris')
        }

        const response = await apiFetch('/api/favorites', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ recipeId, userId })
        })

        if (!response.ok) {
          throw await apiErrorFromResponse(response)
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
        this.error = toUserMessage(error)
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

        const response = await apiFetch(`/api/favorites?recipeId=${recipeId}&userId=${userId}`, {
          method: 'DELETE'
        })

        if (!response.ok) {
          throw await apiErrorFromResponse(response)
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
        this.error = toUserMessage(error)
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
      await this.ensureLoaded()
    },

    // Méthode pour recharger les favoris quand l'utilisateur change (layout)
    async refreshFavorites() {
      try {
        await this.loadFavorites()
      } catch {
        // Erreur déjà consignée dans `error`
      }
    }
  }
})
