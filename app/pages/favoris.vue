<template>
  <div>
    <!-- Vérification de l'authentification -->
    <div v-if="!authStore.isAuthenticated">
      <AuthRequired @login="showLoginModal = true" />
      <AuthModal
        :is-open="showLoginModal"
        @close="showLoginModal = false"
        @success="handleLoginSuccess"
      />
    </div>

    <!-- Contenu pour utilisateurs connectés -->
    <div v-else>
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-4xl font-lobster text-gray-900 mb-4">
          Mes recettes favorites
        </h1>
        <p class="text-xl text-gray-600">
          Retrouvez ici toutes vos recettes préférées
        </p>
      </div>

      <!-- Loading State -->
      <LoadingState v-if="status === 'pending'" :message="$t('favorites.loading')" />

      <!-- Error State -->
      <ErrorState
        v-else-if="error"
        :message="error.message"
        :retry-action="() => refresh()"
        :title="$t('favorites.loadError')"
        :retry-text="$t('recipes.loadError.retry')"
      />

      <!-- Favorites Grid -->
      <div v-else-if="favoritesWithRecipes.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        <div
          v-for="favorite in favoritesWithRecipes"
          :key="favorite.id"
          class="block h-full"
        >
          <RecipeCard
            :recipe="favorite.recipe"
            :show-admin-actions="authStore.isAdmin"
          />
        </div>
      </div>

      <!-- Empty State -->
      <EmptyState
        v-else
        :title="$t('favorites.empty.title')"
        :message="$t('favorites.empty.description')"
        icon-path="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      >
        <template #action>
          <NuxtLink to="/recettes" class="btn-primary">
            {{ $t('favorites.empty.discover') }}
          </NuxtLink>
        </template>
      </EmptyState>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Favorite, RecipeSummary } from '#shared/types'

type FavoriteWithRecipe = Favorite & { recipe: RecipeSummary }

const authStore = useAuthStore()
const favoritesStore = useFavoritesStore()

const showLoginModal = ref(false)

// Favoris : lecture directe sous RLS (store), rendue côté serveur
const { status, error, refresh } = await useAsyncData('favorites', () => favoritesStore.refresh())

// Favoris dont la recette existe encore, triés par titre
const favoritesWithRecipes = computed(() =>
  favoritesStore.favorites
    .filter((favorite): favorite is FavoriteWithRecipe => favorite.recipe !== null)
    .sort((a, b) => a.recipe.title.localeCompare(b.recipe.title, 'fr', { sensitivity: 'base' }))
)

// Gérer la connexion réussie
const handleLoginSuccess = () => {
  showLoginModal.value = false
}

// Recharger à la connexion / déconnexion
watch(() => authStore.isAuthenticated, () => { void refresh() })

// SEO
useHead({
  title: 'Favoris - Recettes des Boultons',
  meta: [
    { name: 'description', content: 'Retrouvez toutes vos recettes favorites. Vos plats préférés en un seul endroit !' }
  ]
})
</script>
