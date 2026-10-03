<template>
  <div>
    <template v-if="!authStore.isAuthenticated">
      <AuthRequired @login="showLoginModal = true" />
      <AuthModal :is-open="showLoginModal" @close="showLoginModal = false" @success="showLoginModal = false" />
    </template>

    <div v-else class="space-y-6">
      <header>
        <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl">{{ $t('favorites.title') }}</h1>
        <p class="mt-2 text-muted">{{ $t('favorites.subtitle') }}</p>
      </header>

      <RecipeGridSkeleton v-if="status === 'pending'" :count="4" />

      <ErrorState
        v-else-if="error"
        :message="error.message"
        :retry-action="() => refresh()"
        :title="$t('favorites.loadError')"
        :retry-text="$t('recipes.loadError.retry')"
      />

      <div v-else-if="favoritesWithRecipes.length > 0" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
        <RecipeCard
          v-for="favorite in favoritesWithRecipes"
          :key="favorite.id"
          :recipe="favorite.recipe"
          :show-admin-actions="authStore.isAdmin"
        />
      </div>

      <EmptyState v-else icon="i-lucide-heart" :title="$t('favorites.empty.title')" :message="$t('favorites.empty.description')">
        <template #action>
          <UButton :to="localePath('/recettes')" icon="i-lucide-book-open" :label="$t('favorites.empty.discover')" />
        </template>
      </EmptyState>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Favorite, RecipeSummary } from '#shared/types'

type FavoriteWithRecipe = Favorite & { recipe: RecipeSummary }

const { t } = useI18n()
const localePath = useLocalePath()
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

// Recharger à la connexion / déconnexion
watch(() => authStore.isAuthenticated, () => { void refresh() })

useHead({
  title: () => t('favorites.title'),
  meta: [{ name: 'description', content: () => t('favorites.subtitle') }]
})
</script>
