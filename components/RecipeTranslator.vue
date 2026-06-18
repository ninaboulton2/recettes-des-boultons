<template>
      <div class="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
        <!-- Choix de la langue -->
        <div v-if="!successMessage" class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Langue de la recette
          </label>
          <div class="flex gap-3">
            <button
              @click="translationMode = 'keep'"
              :class="[
                'flex-1 px-4 py-2 rounded-lg border-2 transition-colors font-medium',
                translationMode === 'keep'
                  ? 'bg-primary-100 border-primary-500 text-primary-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              ]"
            >
              Garder la langue d'origine
            </button>
            <button
              @click="translationMode = 'translate'"
              :class="[
                'flex-1 px-4 py-2 rounded-lg border-2 transition-colors font-medium',
                translationMode === 'translate'
                  ? 'bg-primary-100 border-primary-500 text-primary-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              ]"
            >
              Traduire en français
            </button>
          </div>
        </div>

        <!-- Zone de saisie du texte de la recette -->
        <div v-if="!successMessage" class="mb-6">
          <label for="recipe-text" class="block text-sm font-medium text-gray-700 mb-2">
            Texte de la recette {{ translationMode === 'translate' ? 'à traduire' : '' }}
          </label>
      <textarea
        id="recipe-text"
        v-model="recipeText"
        rows="15"
        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm leading-relaxed"
        style="white-space: pre-wrap; word-wrap: break-word;"
        placeholder="Collez ici le texte de votre recette depuis Google Drive...&#10;&#10;"
      ></textarea>
    </div>

    <!-- Bouton de traduction -->
    <div v-if="!successMessage" class="text-center mb-6">
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
          Ajout en cours...
        </span>
        <span v-else>
          Ajouter aux recettes
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
        <button
          @click="resetForm"
          class="text-green-600 hover:text-green-800 text-sm font-medium"
        >
          Ajouter une autre recette →
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
const translationMode = ref('translate') // 'translate' ou 'keep'

// Accéder au store des recettes
const recipesStore = useRecipesStore()
const { supabase } = useSupabase()

const translateAndAddRecipe = async () => {
  if (!recipeText.value.trim()) return

  isLoading.value = true
  error.value = ''
  translatedRecipe.value = ''
  successMessage.value = ''
  addedRecipeId.value = ''

  try {
    // Le traducteur est réservé aux admins (requireAdmin côté serveur) :
    // on transmet le token de session Supabase.
    const { data: { session } } = await supabase.auth.getSession()

    // Étape 1: Traduire la recette
    const translationResponse = await $fetch('/api/translate-recipe', {
      method: 'POST',
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      body: {
        recipeText: recipeText.value,
        translateToFrench: translationMode.value === 'translate'
      }
    })

    const recipeJson = translationResponse.translatedRecipe
    translatedRecipe.value = recipeJson

    // Étape 2: Parser le JSON et ajouter la recette via le store
    const recipe = JSON.parse(recipeJson)
    
    // Utiliser le store pour ajouter la recette (ce qui la rendra réactive)
    const addedRecipe = await recipesStore.addRecipe(recipe)
    
    // Succès !
    successMessage.value = `Recette "${addedRecipe.title}" ajoutée avec succès !`
    addedRecipeId.value = addedRecipe.id
    
    // Vider le champ de texte
    recipeText.value = ''

  } catch (err) {
    console.error('Erreur lors de la traduction/ajout:', err)
    error.value = 'Erreur lors de l\'ajout. Veuillez réessayer.'
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

const resetForm = () => {
  recipeText.value = ''
  translatedRecipe.value = ''
  successMessage.value = ''
  addedRecipeId.value = ''
  error.value = ''
  translationMode.value = 'translate' // Réinitialiser à la traduction par défaut
}
</script> 