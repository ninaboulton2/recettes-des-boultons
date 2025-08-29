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
      <ToastContainer ref="toastContainer" />
      <Toast />
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
      <div v-if="favoritesStore.isLoading" class="text-center py-12">
        <div class="max-w-md mx-auto">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p class="text-gray-600">Chargement de vos favoris...</p>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="favoritesStore.error" class="text-center py-12">
        <div class="max-w-md mx-auto">
          <svg class="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
          </svg>
          <h3 class="text-lg font-semibold text-red-900 mb-2">
            Erreur de chargement
          </h3>
          <p class="text-red-600 mb-4">
            {{ favoritesStore.error }}
          </p>
          <button @click="loadFavorites" class="btn-primary">
            Réessayer
          </button>
        </div>
      </div>

      <!-- Favorites Grid -->
      <div v-else-if="favoritesWithRecipes.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        <div
          v-for="favorite in favoritesWithRecipes"
          :key="favorite.id"
          class="block"
        >
          <RecipeCard 
            :recipe="favorite.recipe" 
            :show-admin-actions="authStore.isAdmin"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-12">
        <div class="max-w-md mx-auto">
          <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
          </svg>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">
            Aucune recette favorite
          </h3>
          <p class="text-gray-600 mb-4">
            Vous n'avez pas encore ajouté de recettes à vos favoris. 
            Parcourez nos recettes et cliquez sur le cœur pour les ajouter !
          </p>
          <NuxtLink to="/recettes" class="btn-primary">
            Découvrir des recettes
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import AuthRequired from '@/components/AuthRequired.vue'
import AuthModal from '@/components/AuthModal.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import Toast from '@/components/Toast.vue'
import PlanningModal from '@/components/PlanningModal.vue'

const authStore = useAuthStore()
const favoritesStore = useFavoritesStore()

const showLoginModal = ref(false)
const toastContainer = ref()

// Computed property pour filtrer les favoris avec des recettes valides
const favoritesWithRecipes = computed(() => 
  favoritesStore.favorites
    .filter(favorite => favorite.recipe) // Filtrer les favoris avec des recettes
    .sort((a, b) => a.recipe.title.localeCompare(b.recipe.title, 'fr', { sensitivity: 'base' }))
)

// Charger les favoris au montage de la page
onMounted(async () => {
  if (authStore.isAuthenticated) {
    await favoritesStore.loadFavorites()
  }
})

// Fonction pour recharger les favoris en cas d'erreur
const loadFavorites = async () => {
  await favoritesStore.loadFavorites()
}

// Gérer la connexion réussie
const handleLoginSuccess = async () => {
  showLoginModal.value = false
  // Les favoris seront automatiquement rechargés par le layout
}

// Surveiller les changements d'authentification
watch(() => authStore.isAuthenticated, async (isAuthenticated) => {
  if (isAuthenticated) {
    await favoritesStore.loadFavorites()
  }
})

// SEO
useHead({
  title: 'Favoris - Recettes des Boultons',
  meta: [
    { name: 'description', content: 'Retrouvez toutes vos recettes favorites. Vos plats préférés en un seul endroit !' }
  ]
})
</script> 