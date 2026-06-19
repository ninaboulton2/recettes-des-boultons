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
        <!-- Email -->
        <div>
          <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
            Email
          </label>
          <input
            id="email"
            v-model="credentials.email"
            type="email"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Entrez votre email"
          />
        </div>

        <!-- Password -->
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
            Mot de passe
          </label>
          <div class="relative">
            <input
              id="password"
              v-model="credentials.password"
              :type="showPassword ? 'text' : 'password'"
              required
              class="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Entrez votre mot de passe"
            />
            <button
              type="button"
              @click="togglePassword"
              class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              :title="showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
            >
              <!-- Icône œil ouvert -->
              <svg
                v-if="showPassword"
                class="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              <!-- Icône œil barré -->
              <svg
                v-else
                class="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Mot de passe oublié -->
        <div class="text-right -mt-3">
          <button
            type="button"
            @click="handleForgotPassword"
            class="text-sm text-blue-600 hover:text-blue-800"
          >
            Mot de passe oublié ?
          </button>
        </div>

        <!-- Error Message -->
        <div v-if="error" class="text-red-600 text-sm text-center">
          {{ error }}
        </div>

        <!-- Success Message -->
        <div v-if="successMessage" class="text-green-600 text-sm text-center">
          {{ successMessage }}
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
        <p>Pas encore de compte ? 
          <button 
            @click="switchToSignUp" 
            class="text-blue-600 hover:text-blue-800 font-medium"
          >
            S'inscrire
          </button>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { LoginCredentials } from '~/types'
import { useAuthStore } from '~/stores/auth'
import { useSupabase } from '~/composables/useSupabase'

interface Props {
  isOpen: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'success'): void
  (e: 'switchToSignUp'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const authStore = useAuthStore()
const { supabase } = useSupabase()

const credentials = ref<LoginCredentials>({
  email: '',
  password: ''
})

const isLoading = ref(false)
const error = ref('')
const successMessage = ref('')
const showPassword = ref(false)

const togglePassword = () => {
  showPassword.value = !showPassword.value
}

const closeModal = () => {
  emit('close')
  resetForm()
}

const switchToSignUp = () => {
  emit('switchToSignUp')
}

const resetForm = () => {
  credentials.value = { email: '', password: '' }
  error.value = ''
  successMessage.value = ''
}

const handleForgotPassword = async () => {
  if (!credentials.value.email) {
    error.value = 'Entrez d\'abord votre email, puis cliquez sur « Mot de passe oublié »'
    return
  }

  isLoading.value = true
  error.value = ''
  successMessage.value = ''

  try {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      credentials.value.email,
      { redirectTo: `${window.location.origin}/reset-password` }
    )

    if (resetError) {
      error.value = resetError.message || 'Erreur lors de l\'envoi de l\'email'
    } else {
      successMessage.value = 'Email de réinitialisation envoyé ! Vérifiez votre boîte mail.'
    }
  } catch (err) {
    error.value = 'Erreur lors de l\'envoi de l\'email'
  } finally {
    isLoading.value = false
  }
}

const handleLogin = async () => {
  if (!credentials.value.email || !credentials.value.password) {
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