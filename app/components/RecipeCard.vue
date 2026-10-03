<template>
  <div class="h-full">
    <div class="recipe-card group h-full flex flex-col">
      <div class="relative mb-4">
        <div class="bg-white rounded-lg shadow p-2 overflow-hidden">
          <NuxtImg
            :src="recipe.image"
            :alt="recipe.title"
            class="w-full h-48 object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
          />
        </div>
        <div class="absolute top-3 right-3 flex flex-col space-y-2 z-10" @click="preventNavigation">
          <!-- Favorite button -->
          <button
            @click.stop.prevent="toggleFavorite"
            @mousedown.stop.prevent
            @mouseup.stop.prevent
            :class="[
              'p-2 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl border-2',
              isFavorite
                ? 'bg-red-100 border-red-400'
                : 'bg-white border-gray-300'
            ]"
            :title="isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'"
            :aria-label="isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'"
            :aria-pressed="isFavorite"
          >
            <svg
              v-if="isFavorite"
              class="w-5 h-5 text-red-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"></path>
            </svg>
            <svg
              v-else
              class="w-5 h-5 text-gray-600"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
            </svg>
          </button>

          <!-- Edit button - visible uniquement pour les admins -->
          <button
            v-if="showAdminActions"
            @click.stop.prevent="editRecipe"
            @mousedown.stop.prevent
            @mouseup.stop.prevent
            class="bg-white/90 hover:bg-white p-2 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl"
            title="Modifier la recette"
            aria-label="Modifier la recette"
          >
            <svg class="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
          </button>

          <!-- Delete button - visible uniquement pour les admins -->
          <button
            v-if="showAdminActions"
            @click.stop.prevent="deleteRecipe"
            @mousedown.stop.prevent
            @mouseup.stop.prevent
            class="bg-white/90 hover:bg-white p-2 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl"
            title="Supprimer la recette"
            aria-label="Supprimer la recette"
          >
            <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="space-y-3 flex-1 flex flex-col">
        <NuxtLink :to="`/recettes/${recipe.id}`" class="block">
          <h3 class="text-xl font-semibold text-gray-900 group-hover:text-primary-600 transition-colors duration-200 cursor-pointer">
            {{ recipe.title }}
          </h3>
        </NuxtLink>

        <p class="text-gray-600 text-sm line-clamp-2 flex-1 overflow-hidden text-ellipsis">
          {{ recipe.description }}
        </p>

        <div class="flex items-center justify-between text-sm text-gray-500 mt-auto">
          <div class="flex items-center space-x-4">
            <div v-if="duration !== null" class="flex items-center space-x-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>{{ duration }} min</span>
            </div>
            <div v-if="recipe.servings && recipe.servings > 0" class="flex items-center space-x-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
              </svg>
              <span>{{ recipe.servings }} pers.</span>
            </div>
          </div>

          <div class="flex items-center space-x-2" @click="preventNavigation">
            <!-- Bouton Ajouter à la liste de courses - visible uniquement pour les utilisateurs connectés -->
            <button
              v-if="authStore.isAuthenticated"
              @click.stop.prevent="showShoppingModal = true"
              @mousedown.stop.prevent
              @mouseup.stop.prevent
              class="text-primary-600 hover:text-primary-700 transition-colors duration-200"
              title="Ajouter à la liste de courses"
              aria-label="Ajouter à la liste de courses"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
              </svg>
            </button>

            <!-- Bouton Ajouter au planning - visible uniquement pour les utilisateurs connectés -->
            <button
              v-if="authStore.isAuthenticated"
              @click.stop.prevent="addToPlanning"
              @mousedown.stop.prevent
              @mouseup.stop.prevent
              class="text-primary-600 hover:text-primary-700 transition-colors duration-200"
              title="Ajouter au planning"
              aria-label="Ajouter au planning"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- Tags -->
        <div class="flex flex-wrap gap-1">
          <span
            v-for="tag in recipe.tags"
            :key="tag"
            class="px-2 py-1 text-xs text-gray-600 rounded-full"
            :class="{
              'bg-green-500 text-white': tag === 'végétarien',
              'bg-green-600 text-white': tag === 'vegan',
              'bg-sky-400 text-white': tag === 'pescétarien' || tag === 'pescetarien',
              'bg-gray-100': tag !== 'végétarien' && tag !== 'vegan' && tag !== 'pescétarien' && tag !== 'pescetarien'
            }"
          >
            {{ tag }}
          </span>
          <span
            v-if="recipe.tags.length > 3"
            class="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full"
          >
            +{{ recipe.tags.length - 3 }}
          </span>
        </div>
      </div>
    </div>

    <!-- Shopping List Modal -->
    <div v-if="showShoppingModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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

        <!-- Les sections sont chargées à l'ouverture (la liste ne transporte que le résumé) -->
        <LoadingState v-if="isLoadingSections" :message="$t('recipes.detail.ingredientsLoading')" />

        <template v-else-if="ingredientSections.length > 0">
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
            :disabled="isLoadingSections || selectedSections.length === 0"
            class="px-4 py-2 text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>

    <!-- Planning Modal - positionné au-dessus de tout le contenu -->
    <PlanningModal
      :show="showPlanningModal"
      :recipe="recipe"
      @close="closePlanningModal"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Recipe, RecipeSection, RecipeSummary } from '#shared/types'
import type { Database } from '#shared/types/database'
import { formatIngredient, sectionsWithIngredients, totalTime } from '#shared/utils/recipes'

const props = withDefaults(defineProps<{
  /** Résumé (liste) ou recette complète (fiche) : les sections sont chargées à la demande. */
  recipe: RecipeSummary | Recipe
  showAdminActions?: boolean
}>(), {
  showAdminActions: false
})

const emit = defineEmits<{
  edit: [recipe: RecipeSummary]
  delete: [recipe: RecipeSummary]
}>()

const supabase = useSupabaseClient<Database>()
const shoppingStore = useShoppingStore()
const favoritesStore = useFavoritesStore()
const authStore = useAuthStore()
const { $toast } = useNuxtApp()

// Computed property to check if recipe is favorite
const isFavorite = computed(() => favoritesStore.isFavorite(props.recipe.id))

const duration = computed(() => totalTime(props.recipe))

// État du modal de planning
const showPlanningModal = ref(false)

// État du modal de shopping
const showShoppingModal = ref(false)
const selectedSections = ref<string[]>([])
const loadedSections = ref<RecipeSection[] | null>(null)
const isLoadingSections = ref(false)

const ingredientSections = computed(() => sectionsWithIngredients(loadedSections.value ?? []))

const toggleFavorite = async () => {
  const result = await favoritesStore.toggleFavorite(props.recipe.id)
  if (result.success) {
    $toast.success('Favoris mis à jour !', result.message, 3000)
  } else {
    $toast.error('Erreur !', result.error || 'Erreur lors de la mise à jour des favoris', 3000)
  }
}

/** Sections de la recette : celles de la prop si présentes, sinon requête ciblée. */
const loadSections = async (): Promise<RecipeSection[]> => {
  if ('sections' in props.recipe) return props.recipe.sections
  const full = await fetchRecipeById(supabase, props.recipe.id)
  return full?.sections ?? []
}

const closeShoppingModal = () => {
  showShoppingModal.value = false
  selectedSections.value = []
}

// Charger les sections et les sélectionner toutes quand le modal s'ouvre
watch(showShoppingModal, async (isOpen) => {
  if (!isOpen) return
  isLoadingSections.value = true
  try {
    loadedSections.value = await loadSections()
    selectedSections.value = ingredientSections.value.map(section => section.id)
  } catch (error) {
    console.error('Erreur lors du chargement des ingrédients:', error)
    loadedSections.value = []
    $toast.error('Erreur !', 'Impossible de charger les ingrédients de la recette.', 3000)
  } finally {
    isLoadingSections.value = false
  }
})

const selectAllSections = () => {
  selectedSections.value = ingredientSections.value.map(section => section.id)
}

const deselectAllSections = () => {
  selectedSections.value = []
}

const confirmAddToShoppingList = async () => {
  const ingredients = ingredientSections.value
    .filter(section => selectedSections.value.includes(section.id))
    .flatMap(section => section.ingredients.map(ingredient => ({
      name: ingredient.name,
      amount: ingredient.amountNum,
      unit: ingredient.unit ?? '',
      recipeId: props.recipe.id
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

const addToPlanning = () => {
  // Ouvrir le modal de planning
  showPlanningModal.value = true
}

const closePlanningModal = () => {
  showPlanningModal.value = false
}

const preventNavigation = (event: Event) => {
  event.stopPropagation()
  event.preventDefault()
}

const editRecipe = () => {
  emit('edit', props.recipe)
}

const deleteRecipe = () => {
  emit('delete', props.recipe)
}
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
