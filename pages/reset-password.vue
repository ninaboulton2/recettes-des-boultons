<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-12">
    <div class="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
      <h1 class="text-2xl font-bold text-gray-900 mb-6">
        Réinitialiser le mot de passe
      </h1>

      <!-- Vérification du lien en cours -->
      <p v-if="!ready && !linkError" class="text-gray-600 text-sm">
        Vérification du lien…
      </p>

      <!-- Lien invalide / expiré -->
      <div v-if="linkError" class="text-center">
        <p class="text-red-600 text-sm mb-4">{{ linkError }}</p>
        <NuxtLink to="/" class="text-blue-600 hover:text-blue-800 font-medium">
          Retour à l'accueil
        </NuxtLink>
      </div>

      <!-- Formulaire de nouveau mot de passe -->
      <form v-if="ready" @submit.prevent="handleReset" class="space-y-6">
        <div>
          <label for="new-password" class="block text-sm font-medium text-gray-700 mb-2">
            Nouveau mot de passe
          </label>
          <input
            id="new-password"
            v-model="password"
            type="password"
            required
            minlength="6"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Au moins 6 caractères"
          />
        </div>

        <div>
          <label for="confirm-password" class="block text-sm font-medium text-gray-700 mb-2">
            Confirmer le mot de passe
          </label>
          <input
            id="confirm-password"
            v-model="confirmPassword"
            type="password"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Confirmez le mot de passe"
          />
        </div>

        <div v-if="error" class="text-red-600 text-sm text-center">{{ error }}</div>
        <div v-if="successMessage" class="text-green-600 text-sm text-center">{{ successMessage }}</div>

        <button
          type="submit"
          :disabled="isLoading"
          class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span v-if="isLoading">Enregistrement…</span>
          <span v-else>Définir le nouveau mot de passe</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useSupabase } from '~/composables/useSupabase'

const { supabase } = useSupabase()

const ready = ref(false)
const linkError = ref('')
const isLoading = ref(false)
const error = ref('')
const successMessage = ref('')
const password = ref('')
const confirmPassword = ref('')

onMounted(async () => {
  // Le client Supabase parse automatiquement le token de récupération présent
  // dans l'URL (#access_token...&type=recovery) et établit une session.
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    ready.value = true
    return
  }

  // Laisser une chance à l'événement de récupération de s'établir
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) ready.value = true
  })

  // Filet de sécurité : sans session valide après quelques secondes → lien invalide
  setTimeout(() => {
    if (!ready.value) {
      linkError.value = 'Lien invalide ou expiré. Veuillez refaire une demande de réinitialisation.'
    }
  }, 2500)
})

const handleReset = async () => {
  if (password.value.length < 6) {
    error.value = 'Le mot de passe doit contenir au moins 6 caractères'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'Les mots de passe ne correspondent pas'
    return
  }

  isLoading.value = true
  error.value = ''
  successMessage.value = ''

  try {
    const { error: updateError } = await supabase.auth.updateUser({ password: password.value })
    if (updateError) {
      error.value = updateError.message || 'Erreur lors de la mise à jour du mot de passe'
      return
    }
    successMessage.value = 'Mot de passe mis à jour ! Redirection…'
    setTimeout(() => navigateTo('/'), 1500)
  } catch (err) {
    error.value = 'Erreur lors de la mise à jour du mot de passe'
  } finally {
    isLoading.value = false
  }
}
</script>
