<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <!-- Logo -->
          <div class="flex items-center">
            <NuxtLink to="/" class="flex items-center space-x-3">
              <NuxtImg src="/images/logo.png" alt="Logo" class="h-10" />
              <span class="text-2xl font-lobster" style="color: rgb(123, 136, 189);">{{ $t('meta.title') }}</span>
            </NuxtLink>
          </div>

          <!-- Navigation -->
          <div class="hidden md:block">
            <div class="ml-10 flex items-baseline space-x-4">
              <NuxtLink 
                to="/" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path === '/' }"
              >
                {{ $t('navigation.home') }}
              </NuxtLink>
              <NuxtLink 
                to="/recettes" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path.startsWith('/recettes') }"
              >
                {{ $t('navigation.recipes') }}
              </NuxtLink>
              <NuxtLink 
                to="/favoris" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path === '/favoris' }"
              >
                {{ $t('navigation.favorites') }}
              </NuxtLink>
              <NuxtLink 
                to="/courses" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path.startsWith('/courses') }"
              >
                {{ $t('navigation.shopping') }}
              </NuxtLink>
              <NuxtLink 
                to="/planning" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path === '/planning' }"
              >
                {{ $t('navigation.planning') }}
              </NuxtLink>
              
            </div>
          </div>

          <!-- Côté droit - Authentification et menu mobile -->
          <div class="flex items-center space-x-4">
            
            <!-- Language Switcher -->
            <div class="ml-4">
              <LanguageSwitcher />
            </div>

            <!-- Bouton de connexion/déconnexion -->
            <div v-if="!authStore.isAuthenticated">
              <button
                @click="showLoginModal = true"
                class="bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
              </button>
            </div>
            
            <!-- Utilisateur connecté -->
            <div v-else class="hidden md:flex items-center space-x-3">
              <!-- Nom de l'utilisateur -->
              <div class="text-sm text-gray-700">
                <span class="font-medium">{{ authStore.currentUser?.name || authStore.currentUser?.email }}</span>
              </div>
              
              <!-- Bouton de déconnexion -->
              <button
                @click="handleLogout"
                class="bg-red-600 text-white p-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
                title="Déconnexion"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                </svg>
              </button>
            </div>

            <!-- Mobile menu button -->
            <div class="md:hidden">
              <button 
                @click="mobileMenuOpen = !mobileMenuOpen"
                class="text-gray-700 hover:text-primary-600 focus:outline-none focus:text-primary-600"
              >
                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path v-if="!mobileMenuOpen" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                  <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Mobile menu -->
        <div v-show="mobileMenuOpen" class="md:hidden">
          <div class="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t border-gray-200">
            <NuxtLink 
              to="/" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path === '/' }"
              @click="mobileMenuOpen = false"
            >
              {{ $t('navigation.home') }}
            </NuxtLink>
            <NuxtLink 
              to="/recettes" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path.startsWith('/recettes') }"
              @click="mobileMenuOpen = false"
            >
              {{ $t('navigation.recipes') }}
            </NuxtLink>
            <NuxtLink 
              to="/favoris" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path === '/favoris' }"
              @click="mobileMenuOpen = false"
            >
              {{ $t('navigation.favorites') }}
            </NuxtLink>
            <NuxtLink 
              to="/courses" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path.startsWith('/courses') }"
              @click="mobileMenuOpen = false"
            >
              {{ $t('navigation.shopping') }}
            </NuxtLink>
            <NuxtLink 
              to="/planning" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path === '/planning' }"
              @click="mobileMenuOpen = false"
            >
              {{ $t('navigation.planning') }}
            </NuxtLink>
            
            <!-- Authentification mobile -->
            <div class="border-t border-gray-200 pt-2 mt-2">
              <div v-if="!authStore.isAuthenticated">
                <button
                  @click="showLoginModal = true; mobileMenuOpen = false"
                  class="block w-full text-center bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <div class="flex items-center justify-center space-x-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                    </svg>
                  </div>
                </button>
              </div>
              <div v-else class="space-y-2">
                <div class="text-sm text-gray-700 text-center">
                  <span class="font-medium">{{ authStore.currentUser?.name || authStore.currentUser?.email }}</span>
                </div>
                <button
                  @click="handleLogout; mobileMenuOpen = false"
                  class="block w-full text-center bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  <div class="flex items-center justify-center space-x-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                    </svg>
                    <span>Déconnexion</span>
                  </div>
                </button>
              </div>
            </div>
            
            <!-- Mobile Language Switcher -->
            <div class="border-t border-gray-200 pt-2 mt-2">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </nav>
    </header>

    <!-- Main content -->
    <main v-if="$route.path === '/'" class="w-full flex-1">
      <slot />
    </main>
    <main v-else class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="bg-white border-t border-gray-200 mt-auto">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="text-center text-gray-600">
          <p>{{ $t('footer.copyright', { year: new Date().getFullYear() }) }}</p>
        </div>
      </div>
    </footer>

    <!-- Toast Container -->
    <ToastContainer ref="toastContainer" />

    <!-- Modal d'authentification -->
    <AuthModal 
      :is-open="showLoginModal" 
      @close="showLoginModal = false"
      @success="handleLoginSuccess"
    />
  </div>
</template>

<script setup>
import ToastContainer from '@/components/ToastContainer.vue'
import AuthModal from '@/components/AuthModal.vue'
import { useAuthStore } from '~/stores/auth'
import { useFavoritesStore } from '~/stores/favorites'
import { usePlanningStore } from '~/stores/planning'
import { useShoppingStore } from '~/stores/shopping'

const mobileMenuOpen = ref(false)
const showLoginModal = ref(false)
const toastContainer = ref()

// Stores
const authStore = useAuthStore()
const favoritesStore = useFavoritesStore()
const planningStore = usePlanningStore()
const shoppingStore = useShoppingStore()

// Setup global toast container
onMounted(() => {
  if (process.client) {
    window.$toastContainer = toastContainer.value
  }
})

const handleLoginSuccess = async () => {
  showLoginModal.value = false
  
  // Recharger les données des stores après connexion
  try {
    await Promise.all([
      favoritesStore.refreshFavorites(),
      planningStore.refreshPlanning(),
      shoppingStore.refreshShoppingLists()
    ])
  } catch (error) {
    console.error('Erreur lors du rechargement des données:', error)
  }
}

const handleLogout = async () => {
  await authStore.logout()
  
  // Vider les stores après déconnexion
  try {
    await Promise.all([
      favoritesStore.refreshFavorites(),
      planningStore.refreshPlanning(),
      shoppingStore.refreshShoppingLists()
    ])
  } catch (error) {
    console.error('Erreur lors du vidage des stores:', error)
  }
  
  // Rediriger vers la page d'accueil après déconnexion
  window.location.href = '/'
}

// Surveiller les changements d'authentification
watch(() => authStore.isAuthenticated, async (isAuthenticated) => {
  if (isAuthenticated) {
    // Utilisateur connecté, recharger les données
    try {
      await Promise.all([
        favoritesStore.refreshFavorites(),
        planningStore.refreshPlanning(),
        shoppingStore.refreshShoppingLists()
      ])

    } catch (error) {
      console.error('Erreur lors du rechargement des données:', error)
    }
  } else {
    // Utilisateur déconnecté, vider les données
    try {
      await Promise.all([
        favoritesStore.refreshFavorites(),
        planningStore.refreshPlanning(),
        shoppingStore.refreshShoppingLists()
      ])
    } catch (error) {
      console.error('Erreur lors du vidage des stores:', error)
    }
  }
})
</script> 