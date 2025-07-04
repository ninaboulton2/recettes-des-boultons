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
        @click="translateAndAddRecipe"
        :disabled="isLoading || !recipeText.trim()"
        class="btn-primary px-8 py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span v-if="isLoading" class="flex items-center">
          <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Traduction et ajout en cours...
        </span>
        <span v-else>
          Traduire et ajouter aux recettes
        </span>
      </button>
    </div>

    <!-- Message de succès -->
    <div v-if="successMessage" class="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
      <div class="flex items-center">
        <svg class="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <p class="text-green-800 font-medium">{{ successMessage }}</p>
      </div>
      <div class="mt-3 flex gap-2">
        <NuxtLink 
          :to="`/recettes/${addedRecipeId}`" 
          class="text-green-600 hover:text-green-800 text-sm font-medium"
        >
          Voir la recette →
        </NuxtLink>
        <button
          @click="viewAllRecipes"
          class="text-green-600 hover:text-green-800 text-sm font-medium"
        >
          Voir toutes les recettes →
        </button>
      </div>
    </div>

    <!-- Résultat de la traduction (optionnel) -->
    <div v-if="translatedRecipe && !successMessage" class="mb-6">
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
const successMessage = ref('')
const addedRecipeId = ref('')

const translateAndAddRecipe = async () => {
  if (!recipeText.value.trim()) return

  isLoading.value = true
  error.value = ''
  translatedRecipe.value = ''
  successMessage.value = ''
  addedRecipeId.value = ''

  try {
    // Étape 1: Traduire la recette
    const translationResponse = await $fetch('/api/translate-recipe', {
      method: 'POST',
      body: {
        recipeText: recipeText.value
      }
    })

    const recipeJson = translationResponse.translatedRecipe
    translatedRecipe.value = recipeJson

    // Étape 2: Parser le JSON et ajouter la recette
    const recipe = JSON.parse(recipeJson)
    
    const addResponse = await $fetch('/api/add-recipe', {
      method: 'POST',
      body: {
        recipe: recipe
      }
    })

    // Succès !
    successMessage.value = addResponse.message
    addedRecipeId.value = addResponse.recipe.id
    
    // Vider le champ de texte
    recipeText.value = ''

  } catch (err) {
    console.error('Erreur lors de la traduction/ajout:', err)
    error.value = 'Erreur lors de la traduction ou de l\'ajout. Veuillez réessayer.'
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

const viewAllRecipes = () => {
  navigateTo('/recettes')
}
</script> 