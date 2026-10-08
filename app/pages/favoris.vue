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

      <RecipeGrid
        v-else-if="favoritesWithRecipes.length > 0"
        :recipes="favoriteRecipes"
        :show-admin-actions="authStore.isAdmin"
      />

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

// Favoris : lecture directe sous RLS (store), rendue côté serveur. Clé propre
// à l'utilisateur : un changement de compte (connexion / déconnexion)
// relance le chargement, sans réutiliser les données d'un autre compte.
const { status, error, refresh } = await useAsyncData(
  () => `favorites:${authStore.currentUser?.id ?? 'anonymous'}`,
  () => favoritesStore.refresh()
)

// Favoris dont la recette existe encore, triés par titre
const favoritesWithRecipes = computed(() =>
  favoritesStore.favorites
    .filter((favorite): favorite is FavoriteWithRecipe => favorite.recipe !== null)
    .sort((a, b) => a.recipe.title.localeCompare(b.recipe.title, 'fr', { sensitivity: 'base' }))
)
const favoriteRecipes = computed(() => favoritesWithRecipes.value.map(favorite => favorite.recipe))

useHead({
  title: () => t('favorites.title'),
  meta: [{ name: 'description', content: () => t('favorites.subtitle') }]
})
</script>
