<template>
  <div>
    <!-- Afficher le contenu si l'utilisateur est admin -->
    <div v-if="authStore.isAdmin">
      <slot />
    </div>
    
    <!-- Message d'erreur si l'utilisateur n'est pas admin -->
    <div v-else class="text-center py-12">
      <div class="max-w-md mx-auto">
        <div class="text-red-600 mb-4">
          <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
          </svg>
        </div>
        <h2 class="text-2xl font-bold text-gray-900 mb-4">
          Accès restreint
        </h2>
        <p class="text-gray-600 mb-6">
          Cette fonctionnalité n'est accessible qu'aux administrateurs. Veuillez vous connecter avec un compte admin.
        </p>
        <button
          @click="showLoginModal = true"
          class="bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          Se connecter
        </button>
      </div>
    </div>

    <!-- Modal de connexion -->
    <LoginModal 
      :is-open="showLoginModal" 
      @close="showLoginModal = false"
      @success="handleLoginSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()
const showLoginModal = ref(false)

const handleLoginSuccess = () => {
  showLoginModal.value = false
}
</script> 