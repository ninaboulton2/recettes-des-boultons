<template>
  <div class="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
    <!-- Zone de saisie du texte de la recette -->
    <div class="mb-6">
      <label for="recipe-text" class="block text-sm font-medium text-gray-700 mb-2">
        Texte de la recette à traduire
      </label>
      <textarea
        id="recipe-text"
        v-model="recipeText"
        rows="8"
        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        placeholder="Collez ici le texte de votre recette depuis Google Drive..."
      ></textarea>
    </div>

    <!-- Bouton de traduction -->
    <div class="text-center mb-6">
      <button
        @click="translateRecipe"
        :disabled="isLoading || !recipeText.trim()"
        class="btn-primary px-8 py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span v-if="isLoading" class="flex items-center">
          <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Traduction en cours...
        </span>
        <span v-else>
          Traduire en JSON
        </span>
      </button>
    </div>

    <!-- Résultat de la traduction -->
    <div v-if="translatedRecipe" class="mb-6">
      <h4 class="text-lg font-semibold text-gray-900 mb-3">Recette traduite :</h4>
      <div class="bg-gray-50 rounded-lg p-4">
        <pre class="text-sm text-gray-800 whitespace-pre-wrap">{{ translatedRecipe }}</pre>
      </div>
      
      <!-- Bouton pour copier le JSON -->
      <div class="mt-4 text-center">
        <button
          @click="copyToClipboard"
          class="btn-secondary px-6 py-2"
        >
          Copier le JSON
        </button>
      </div>
    </div>

    <!-- Message d'erreur -->
    <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4">
      <p class="text-red-800">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const recipeText = ref('')
const translatedRecipe = ref('')
const isLoading = ref(false)
const error = ref('')

const translateRecipe = async () => {
  if (!recipeText.value.trim()) return

  isLoading.value = true
  error.value = ''
  translatedRecipe.value = ''

  try {
    // Appel à l'API OpenAI via un endpoint Nuxt
    const response = await $fetch('/api/translate-recipe', {
      method: 'POST',
      body: {
        recipeText: recipeText.value
      }
    })

    translatedRecipe.value = response.translatedRecipe
  } catch (err) {
    console.error('Erreur lors de la traduction:', err)
    error.value = 'Erreur lors de la traduction. Veuillez réessayer.'
  } finally {
    isLoading.value = false
  }
}

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(translatedRecipe.value)
    // Optionnel : afficher un message de succès
  } catch (err) {
    console.error('Erreur lors de la copie:', err)
  }
}
</script> 