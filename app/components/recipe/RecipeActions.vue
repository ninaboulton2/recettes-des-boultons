<template>
  <div class="flex flex-wrap items-center gap-2 print:hidden">
    <UButton
      v-if="authStore.isAuthenticated"
      :icon="isFavorite ? 'i-lucide-heart' : 'i-lucide-heart'"
      :color="isFavorite ? 'primary' : 'neutral'"
      :variant="isFavorite ? 'soft' : 'outline'"
      :label="isFavorite ? $t('recipeDetail.actions.favoriteRemove') : $t('recipeDetail.actions.favoriteAdd')"
      :aria-pressed="isFavorite"
      :loading="favoriteBusy"
      size="sm"
      @click="toggleFavorite"
    />
    <UButton
      v-if="authStore.isAuthenticated"
      icon="i-lucide-shopping-basket"
      color="neutral"
      variant="outline"
      size="sm"
      :label="$t('recipeDetail.actions.shopping')"
      :disabled="!hasIngredients"
      @click="showShopping = true"
    />
    <UButton
      v-if="authStore.isAuthenticated"
      icon="i-lucide-calendar-plus"
      color="neutral"
      variant="outline"
      size="sm"
      :label="$t('recipeDetail.actions.planning')"
      @click="showPlanning = true"
    />
    <UButton
      icon="i-lucide-chef-hat"
      color="primary"
      size="sm"
      :label="$t('recipeDetail.actions.cook')"
      :disabled="!hasSteps"
      @click="emit('cook')"
    />
    <UButton
      icon="i-lucide-printer"
      color="neutral"
      variant="ghost"
      size="sm"
      :label="$t('recipeDetail.actions.print')"
      @click="print"
    />

    <template v-if="authStore.isAdmin">
      <USeparator orientation="vertical" class="hidden h-6 sm:block" />
      <UButton
        icon="i-lucide-pencil"
        color="neutral"
        variant="outline"
        size="sm"
        :label="$t('recipeDetail.actions.edit')"
        @click="emit('edit')"
      />
      <UButton
        icon="i-lucide-trash-2"
        color="error"
        variant="outline"
        size="sm"
        :label="$t('recipeDetail.actions.delete')"
        @click="emit('delete')"
      />
    </template>

    <RecipeAddToShoppingModal
      v-if="authStore.isAuthenticated"
      v-model:open="showShopping"
      :recipe="recipe"
      :factor="factor"
      :servings="servings"
    />
    <!-- Modale de planning (composant de l'agent 3C, API `show` / `recipe` / `close`) -->
    <PlanningModal
      v-if="authStore.isAuthenticated"
      :show="showPlanning"
      :recipe="recipe"
      @close="showPlanning = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Recipe } from '#shared/types'
import { sectionsWithIngredients, sectionsWithInstructions } from '#shared/utils/recipes'

/**
 * Barre d'actions de la fiche : favori, courses (par section), planning,
 * mode cuisine, impression ; modifier/supprimer pour l'admin (les
 * confirmations et l'éditeur sont portés par la page).
 */
const props = withDefaults(defineProps<{
  recipe: Recipe
  /** Facteur de portions transmis à `add_recipe_to_list`. */
  factor?: number
  servings?: number | null
}>(), {
  factor: 1,
  servings: null
})

const emit = defineEmits<{ edit: [], delete: [], cook: [] }>()

const authStore = useAuthStore()
const favoritesStore = useFavoritesStore()
const toast = useToast()
const { t } = useI18n()

const showShopping = ref(false)
const showPlanning = ref(false)
const favoriteBusy = ref(false)

const hasIngredients = computed(() => sectionsWithIngredients(props.recipe.sections).length > 0)
const hasSteps = computed(() => sectionsWithInstructions(props.recipe.sections).length > 0)
const isFavorite = computed(() => favoritesStore.isFavorite(props.recipe.id))

// Favoris chargés une seule fois par utilisateur (attendus en SSR).
useFavoritesLoader()

const toggleFavorite = async () => {
  if (favoriteBusy.value) return
  favoriteBusy.value = true
  const wasFavorite = isFavorite.value
  try {
    const result = await favoritesStore.toggleFavorite(props.recipe.id)
    if (result.success) {
      toast.add({
        title: wasFavorite ? t('recipeDetail.actions.favoriteRemoved') : t('recipeDetail.actions.favoriteAdded'),
        icon: 'i-lucide-heart',
        color: 'success'
      })
    } else {
      toast.add({ title: t('recipeDetail.actions.favoriteError'), description: result.error, color: 'error', icon: 'i-lucide-circle-alert' })
    }
  } finally {
    favoriteBusy.value = false
  }
}

const print = () => {
  if (import.meta.client) window.print()
}
</script>
