<template>
  <div>
    <!-- Boutons d'action -->
    <div class="mb-4 sm:mb-6 flex flex-col gap-3 sm:gap-4">
      <!-- Première ligne : bouton retour et boutons principaux -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <button @click="$router.back()" class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors w-fit text-sm sm:text-base">
          <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          <span class="hidden sm:inline">Retour</span>
        </button>

        <!-- Boutons d'action - disposition mobile optimisée -->
        <div class="flex flex-wrap gap-1.5 sm:gap-4 justify-end sm:justify-start">
          <!-- Bouton d'ajout à la liste de courses - visible uniquement pour les utilisateurs connectés -->
          <button
            v-if="recipe && authStore.isAuthenticated"
            @click="showShoppingModal = true"
            class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-primary-50 text-sm sm:text-base"
          >
            <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
            </svg>
            <span class="hidden sm:inline">Ajouter à la liste de courses</span>
            <span class="sm:hidden">Courses</span>
          </button>

          <!-- Bouton d'ajout au planning - visible uniquement pour les utilisateurs connectés -->
          <button
            v-if="recipe && authStore.isAuthenticated"
            @click="showPlanningModal = true"
            class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-primary-50 text-sm sm:text-base"
          >
            <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            <span class="hidden sm:inline">Ajouter au planning</span>
            <span class="sm:hidden">Planning</span>
          </button>

          <!-- Bouton d'impression -->
          <button
            v-if="recipe"
            @click="printRecipe"
            class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-primary-50 text-sm sm:text-base"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
            </svg>
            <span class="hidden sm:inline">Imprimer</span>
            <span class="sm:hidden">Imprimer</span>
          </button>
        </div>
      </div>

      <!-- Deuxième ligne : boutons d'administration -->
      <div v-if="recipe && authStore.isAdmin" class="flex flex-wrap items-center justify-end gap-1.5 sm:gap-4">
        <!-- Bouton d'édition - visible uniquement pour les admins -->
        <button
          @click="editRecipe"
          class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-primary-50 text-sm sm:text-base"
          title="Modifier la recette"
        >
          <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
          </svg>
          Modifier
        </button>
        <!-- Bouton de suppression - visible uniquement pour les admins -->
        <button
          @click="confirmDeleteRecipe"
          class="flex items-center text-red-600 hover:text-red-800 font-medium transition-colors px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-red-50 text-sm sm:text-base"
          title="Supprimer la recette"
        >
          <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
          Supprimer
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <LoadingState v-if="status === 'pending'" :message="$t('recipes.detail.loading')" />

    <!-- Error State -->
    <ErrorState
      v-else-if="error"
      :message="error.message"
      :retry-action="() => refresh()"
      :title="$t('recipes.detail.loadError')"
      :retry-text="$t('recipes.loadError.retry')"
    />

    <div v-else-if="recipe" class="max-w-3xl mx-auto">
      <!-- Header -->
      <div class="mb-6 sm:mb-8 flex flex-col md:flex-row md:items-center">
        <div class="flex-shrink-0 mb-4 sm:mb-6 md:mb-0">
        </div>
        <div class="flex-1">
          <h1 class="text-2xl sm:text-4xl font-lobster text-gray-900 mb-2">{{ recipe.title }}</h1>
          <p class="text-sm sm:text-base text-gray-600 mb-3 sm:mb-4">{{ recipe.description }}</p>
          <div class="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 mb-2">
            <span><strong>Catégorie :</strong> {{ categoryName }}</span>
            <span v-if="duration !== null"><strong>Temps :</strong> {{ duration }} min</span>
            <span v-if="recipe.servings !== null"><strong>Portions :</strong> {{ recipe.servings }} pers.</span>
          </div>
          <!-- Tags -->
          <div class="flex flex-wrap gap-1 sm:gap-2 mb-2">
            <span
              v-for="tag in recipe.tags"
              :key="tag"
              class="px-2 py-1 text-xs text-gray-600 rounded-full"
              :class="{
                'bg-green-500 text-white': tag === 'végétarien',
                'bg-emerald-600 text-white': tag === 'vegan',
                'bg-sky-400 text-white': tag === 'pescétarien' || tag === 'pescetarien',
                'bg-gray-100': tag !== 'végétarien' && tag !== 'vegan' && tag !== 'pescétarien' && tag !== 'pescetarien'
              }"
            >
              {{ tag }}
            </span>
          </div>
        </div>
      </div>

      <!-- Ingrédients (par section) -->
      <div class="mb-6 sm:mb-8">
        <h2 class="text-xl sm:text-2xl font-semibold text-gray-900 mb-3 sm:mb-4">Ingrédients</h2>
        <div class="space-y-4">
          <div v-for="section in ingredientSections" :key="section.id" class="mb-4">
            <h3 class="text-lg font-medium text-gray-700 mb-2">{{ section.name }}</h3>
            <ul class="list-disc list-inside space-y-1 text-sm sm:text-base text-gray-800 ml-4">
              <li v-for="ingredient in section.ingredients" :key="ingredient.id">
                {{ formatIngredient(ingredient) }}
                <span v-if="ingredient.optional" class="text-xs text-gray-500">(optionnel)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Instructions (par section) -->
      <div class="mb-6 sm:mb-8">
        <h2 class="text-xl sm:text-2xl font-semibold text-gray-900 mb-3 sm:mb-4">Instructions</h2>
        <div class="space-y-4">
          <div v-for="section in instructionSections" :key="section.id" class="mb-4">
            <h3 class="text-lg font-medium text-gray-700 mb-2">{{ section.name }}</h3>
            <ol class="list-decimal list-inside space-y-2 text-sm sm:text-base text-gray-800 ml-4">
              <li v-for="instruction in section.instructions" :key="instruction.id">
                {{ instruction.content }}
              </li>
            </ol>
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div v-if="recipe.notes && recipe.notes.trim()" class="mb-6 sm:mb-8">
        <h2 class="text-xl sm:text-2xl font-semibold text-gray-900 mb-3 sm:mb-4">Notes et conseils</h2>
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
          <div class="flex items-start">
            <svg class="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mr-2 sm:mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p class="text-sm sm:text-base text-blue-800 whitespace-pre-wrap">{{ recipe.notes }}</p>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-12 sm:py-16">
      <h2 class="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">{{ $t('recipes.detail.notFound') }}</h2>
      <NuxtLink to="/recettes" class="btn-primary">{{ $t('recipes.detail.backToList') }}</NuxtLink>
    </div>

    <!-- Recipe Editor Modal -->
    <RecipeEditor
      :show="showRecipeEditor"
      :recipe="editingRecipe"
      @close="closeRecipeEditor"
      @save="onRecipeSaved"
    />

    <!-- Delete Confirmation Modal -->
    <ConfirmModal
      :show="showDeleteModal"
      title="Supprimer la recette"
      :message="deleteConfirmMessage"
      confirm-text="Supprimer"
      cancel-text="Annuler"
      @confirm="deleteRecipe"
      @close="closeDeleteModal"
    />

    <!-- Shopping List Modal -->
    <div v-if="showShoppingModal && recipe" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl p-4 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-lg sm:text-2xl font-semibold text-gray-900 pr-4">
            Ajouter "{{ recipe.title }}" à la liste de courses
          </h3>
          <button
            @click="closeShoppingModal"
            class="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <template v-if="ingredientSections.length > 0">
          <div class="mb-4">
            <div class="flex items-center justify-between mb-4">
              <p class="text-sm text-gray-600">Sélectionnez les sections d'ingrédients à ajouter :</p>
              <div class="flex gap-2">
                <button
                  @click="selectAllSections"
                  class="text-xs sm:text-sm text-primary-600 hover:text-primary-800 font-medium px-2 py-1 rounded hover:bg-primary-50"
                >
                  Tout sélectionner
                </button>
                <button
                  @click="deselectAllSections"
                  class="text-xs sm:text-sm text-gray-600 hover:text-gray-800 font-medium px-2 py-1 rounded hover:bg-gray-50"
                >
                  Tout désélectionner
                </button>
              </div>
            </div>

            <div class="space-y-3">
              <div
                v-for="section in ingredientSections"
                :key="section.id"
                class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <label class="flex items-start cursor-pointer">
                  <input
                    type="checkbox"
                    v-model="selectedSections"
                    :value="section.id"
                    class="mt-1 mr-3 w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  >
                  <div class="flex-1">
                    <h4 class="font-medium text-gray-900 mb-2">
                      {{ section.name || 'Sans nom' }}
                    </h4>
                    <ul class="list-disc list-inside space-y-1 text-sm text-gray-600 ml-2">
                      <li v-for="ingredient in section.ingredients" :key="ingredient.id">
                        {{ formatIngredient(ingredient) }}
                      </li>
                    </ul>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </template>

        <p v-else class="text-sm text-gray-600 mb-4">
          {{ $t('recipes.detail.noIngredients') }}
        </p>

        <div class="flex justify-end gap-3 mt-6">
          <button
            @click="closeShoppingModal"
            class="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
          >
            Annuler
          </button>
          <button
            @click="confirmAddToShoppingList"
            :disabled="selectedSections.length === 0"
            class="px-4 py-2 text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>

    <!-- Planning Modal -->
    <PlanningModal
      v-if="recipe"
      :show="showPlanningModal"
      :recipe="recipe"
      @close="showPlanningModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Recipe } from '#shared/types'
import {
  formatIngredient,
  sectionsWithIngredients,
  sectionsWithInstructions,
  totalTime
} from '#shared/utils/recipes'

// Nuxt 4 ordonne les routes dynamiques différemment de Nuxt 3 : sans ceci,
// `/recettes/:category` capturait aussi les identifiants de recettes. On
// réserve explicitement cette page aux UUID.
definePageMeta({
  path: '/recettes/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'
})

const recipesStore = useRecipesStore()
const shoppingStore = useShoppingStore()
const authStore = useAuthStore()
const route = useRoute()
const { $toast } = useNuxtApp()

const recipeId = computed(() => {
  const value = route.params.id
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
})

// Fiche : une requête ciblée (recette + sections imbriquées), rendue côté serveur
const { data: recipe, status, error, refresh } = await useRecipe(recipeId)

const ingredientSections = computed(() => sectionsWithIngredients(recipe.value?.sections ?? []))
const instructionSections = computed(() => sectionsWithInstructions(recipe.value?.sections ?? []))
const duration = computed(() => recipe.value ? totalTime(recipe.value) : null)

// Recipe editing and deletion
const showRecipeEditor = ref(false)
const editingRecipe = ref<Recipe | null>(null)
const showDeleteModal = ref(false)
const recipeToDelete = ref<Recipe | null>(null)

// Planning modal
const showPlanningModal = ref(false)

// Shopping modal
const showShoppingModal = ref(false)
const selectedSections = ref<string[]>([])

const CATEGORY_NAMES: Record<string, string> = {
  'soupes': 'Soupes',
  'entrees': 'Entrées, Salades, Pains et accompagnements',
  'plats': 'Plats',
  'poissons': 'Poissons',
  'viandes': 'Viandes',
  'yaourts et fromages': 'Yaourts et fromages',
  'desserts et gâteaux': 'Desserts et gâteaux',
  'boissons': 'Boissons',
  'confitures': 'Confitures'
}

const categoryName = computed(() => {
  const category = recipe.value?.category ?? ''
  return CATEGORY_NAMES[category] ?? category
})

// Computed delete confirmation message
const deleteConfirmMessage = computed(() => {
  if (!recipeToDelete.value) return ''
  return `Êtes-vous sûr de vouloir supprimer la recette "${recipeToDelete.value.title}" ? Cette action est irréversible.`
})

const closeShoppingModal = () => {
  showShoppingModal.value = false
  selectedSections.value = []
}

// Sélectionner toutes les sections par défaut quand le modal s'ouvre
watch(showShoppingModal, (isOpen) => {
  if (isOpen) {
    selectedSections.value = ingredientSections.value.map(section => section.id)
  }
})

const selectAllSections = () => {
  selectedSections.value = ingredientSections.value.map(section => section.id)
}

const deselectAllSections = () => {
  selectedSections.value = []
}

const confirmAddToShoppingList = async () => {
  if (!recipe.value) return
  const recipeIdValue = recipe.value.id

  const ingredients = ingredientSections.value
    .filter(section => selectedSections.value.includes(section.id))
    .flatMap(section => section.ingredients.map(ingredient => ({
      name: ingredient.name,
      amount: ingredient.amountNum,
      unit: ingredient.unit ?? '',
      recipeId: recipeIdValue
    })))

  if (ingredients.length === 0) {
    $toast.error(
      'Erreur !',
      'Aucun ingrédient sélectionné',
      3000
    )
    return
  }

  try {
    // Utiliser la nouvelle méthode qui vérifie toutes les listes
    await shoppingStore.addIngredientsToLists(ingredients)

    // Afficher un toast de confirmation
    $toast.success(
      'Recette ajoutée !',
      `${ingredients.length} ingrédient${ingredients.length > 1 ? 's' : ''} ajouté${ingredients.length > 1 ? 's' : ''} à votre liste de courses`,
      3000
    )

    closeShoppingModal()
  } catch (error) {
    console.error('Erreur lors de l\'ajout à la liste de courses:', error)
    $toast.error(
      'Erreur !',
      'Impossible d\'ajouter la recette à la liste de courses. Veuillez réessayer.',
      3000
    )
  }
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const printRecipe = () => {
  const current = recipe.value
  if (!current) return

  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHtml(current.title)} - Recettes des Boultons</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 5px;
          line-height: 1.8;
          max-width: 800px;
          margin-left: 50px;
          margin-right: auto;
        }
        h1 {
          color: #1e40af;
          font-size: 32px;
          text-align: center;
          font-weight: bold;
        }
        h2 {
          color: #374151;
          font-size: 24px;
          text-align: center;
          font-weight: bold;
        }
        h3 {
          color: #4b5563;
          font-size: 18px;
          font-weight: bold;
          margin-top: 20px;
          margin-bottom: 10px;
          margin-left: 50px;
        }
        .recipe-info {
          background: #f3f4f6;
          padding: 20px;
          border-radius: 12px;
          text-align: center;
          font-size: 11px;
        }
        .recipe-info span {
          margin-right: 25px;
          font-weight: 500;
        }
        ul {
          margin-left: 50px;
          font-size: 11px;
        }
        ol {
          margin-left: 50px;
          font-size: 11px;
        }
        li {
          line-height: 1.8;
        }
        .header {
          text-align: center;
        }
        .footer {
          margin-top: 50px;
          text-align: center;
          font-size: 12px;
          color: #6b7280;
          border-top: 2px solid #e5e7eb;
          padding-top: 20px;
        }
        @media print {
          body {
            font-size: 11px;
          }
          h1 { font-size: 28px; }
          h2 { font-size: 14px; }
          h3 { font-size: 12px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${escapeHtml(current.title)}</h1>
      </div>

      <div class="recipe-info">
        <span><strong>Catégorie :</strong> ${escapeHtml(categoryName.value)}</span>
        ${duration.value !== null ? `<span><strong>Temps :</strong> ${duration.value} min</span>` : ''}
        ${current.servings !== null ? `<span><strong>Portions :</strong> ${current.servings} pers.</span>` : ''}
      </div>

      <h2>Ingrédients</h2>
      ${ingredientSections.value.map(section => `
        ${section.name.trim() ? `<h3>${escapeHtml(section.name)}</h3>` : ''}
        <ul>
          ${section.ingredients.map(ingredient => `<li>${escapeHtml(formatIngredient(ingredient))}</li>`).join('')}
        </ul>
      `).join('')}

      <h2>Instructions</h2>
      ${instructionSections.value.map(section => `
        ${section.name.trim() ? `<h3>${escapeHtml(section.name)}</h3>` : ''}
        <ol>
          ${section.instructions.map(instruction => `<li>${escapeHtml(instruction.content)}</li>`).join('')}
        </ol>
      `).join('')}

      ${current.notes.trim() ? `
      <h2 style="margin-top: 50px;">Notes et conseils</h2>
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 25px 0;">
        <p style="color: #1e40af; margin: 0; line-height: 1.8;">${escapeHtml(current.notes)}</p>
      </div>
      ` : ''}

      <div class="footer">
        Recettes des Boultons
      </div>
    </body>
    </html>
  `

  printWindow.document.write(printContent)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  printWindow.close()
}

// Recipe editing methods
const editRecipe = () => {
  editingRecipe.value = recipe.value
  showRecipeEditor.value = true
}

const closeRecipeEditor = () => {
  showRecipeEditor.value = false
  editingRecipe.value = null
}

const onRecipeSaved = () => {
  closeRecipeEditor()
  // La fiche observe recipesStore.revision : elle se recharge seule
}

// Recipe deletion methods
const confirmDeleteRecipe = () => {
  recipeToDelete.value = recipe.value
  showDeleteModal.value = true
}

const deleteRecipe = async () => {
  if (recipeToDelete.value) {
    try {
      await recipesStore.deleteRecipe(recipeToDelete.value.id)
      closeDeleteModal()
      $toast.success('Succès', 'Recette supprimée avec succès !', 3000)
      // Redirect to recipes list after deletion
      await navigateTo('/recettes')
    } catch {
      $toast.error('Erreur', 'Impossible de supprimer la recette. Veuillez réessayer.', 3000)
    }
  }
}

const closeDeleteModal = () => {
  showDeleteModal.value = false
  recipeToDelete.value = null
}

// SEO
useHead({
  title: () => recipe.value ? `${recipe.value.title} - Recettes des Boultons` : 'Recette introuvable',
  meta: [
    { name: 'description', content: () => recipe.value ? recipe.value.description : 'Recette non trouvée.' }
  ]
})
</script>
