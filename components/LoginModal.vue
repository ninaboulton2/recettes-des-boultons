<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center">
    <!-- Overlay -->
    <div class="absolute inset-0 bg-black bg-opacity-50" @click="closeModal"></div>
    
    <!-- Modal -->
    <div class="relative bg-white rounded-lg shadow-xl p-8 w-full max-w-md mx-4">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900">
          Connexion
        </h2>
        <button
          @click="closeModal"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleLogin" class="space-y-6">
        <!-- Username -->
        <div>
          <label for="username" class="block text-sm font-medium text-gray-700 mb-2">
            Nom d'utilisateur
          </label>
          <input
            id="username"
            v-model="credentials.username"
            type="text"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Entrez votre nom d'utilisateur"
          />
        </div>

        <!-- Password -->
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
            Mot de passe
          </label>
          <input
            id="password"
            v-model="credentials.password"
            type="password"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Entrez votre mot de passe"
          />
        </div>

        <!-- Error Message -->
        <div v-if="error" class="text-red-600 text-sm text-center">
          {{ error }}
        </div>

        <!-- Submit Button -->
        <button
          type="submit"
          :disabled="isLoading"
          class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span v-if="isLoading" class="flex items-center justify-center">
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Connexion en cours...
          </span>
          <span v-else>Se connecter</span>
        </button>
      </form>

      <!-- Footer -->
      <div class="mt-6 text-center text-sm text-gray-600">
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { LoginCredentials } from '~/types'
import { useAuthStore } from '~/stores/auth'

interface Props {
  isOpen: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'success'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const authStore = useAuthStore()

const credentials = ref<LoginCredentials>({
  username: '',
  password: ''
})

const isLoading = ref(false)
const error = ref('')

const closeModal = () => {
  emit('close')
  resetForm()
}

const resetForm = () => {
  credentials.value = { username: '', password: '' }
  error.value = ''
}

const handleLogin = async () => {
  if (!credentials.value.username || !credentials.value.password) {
    error.value = 'Veuillez remplir tous les champs'
    return
  }

  isLoading.value = true
  error.value = ''

  try {
    const result = await authStore.login(credentials.value)
    
    if (result.success) {
      emit('success')
      closeModal()
    } else {
      error.value = result.error || 'Erreur de connexion'
    }
  } catch (err) {
    error.value = 'Erreur de connexion'
  } finally {
    isLoading.value = false
  }
}

// Reset form when modal opens
watch(() => props.isOpen, (newValue) => {
  if (newValue) {
    resetForm()
  }
})
</script> 