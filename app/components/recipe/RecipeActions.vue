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

    <!-- v2 : ce que MES droits sur cette recette permettent (ajouter / retirer du carnet, copie, partage) -->
    <template v-if="v2 && rights">
      <USeparator orientation="vertical" class="hidden h-6 sm:block" />
      <UButton
        v-if="rights.canAddToCookbook"
        icon="i-lucide-bookmark-plus"
        color="primary"
        variant="soft"
        size="sm"
        :label="$t('recipeDetail.v2.addToCookbook')"
        :loading="busy === 'add'"
        :disabled="busy !== null"
        data-testid="action-add-cookbook"
        @click="emit('add')"
      />
      <UButton
        v-if="rights.canRemoveFromCookbook"
        icon="i-lucide-bookmark-minus"
        color="neutral"
        variant="outline"
        size="sm"
        :label="$t('recipeDetail.v2.removeFromCookbook')"
        :loading="busy === 'remove'"
        :disabled="busy !== null"
        data-testid="action-remove-cookbook"
        @click="emit('remove')"
      />
      <UButton
        v-if="rights.canCopy"
        icon="i-lucide-copy"
        color="neutral"
        variant="outline"
        size="sm"
        :label="$t('recipeDetail.v2.copy')"
        :loading="busy === 'copy'"
        :disabled="busy !== null"
        data-testid="action-copy"
        @click="emit('copy')"
      />
      <UButton
        v-if="rights.canShare"
        icon="i-lucide-share-2"
        color="neutral"
        variant="outline"
        size="sm"
        :label="$t('recipeDetail.v2.share')"
        data-testid="action-share"
        @click="emit('share')"
      />
    </template>

    <template v-if="canEdit || canDelete">
      <USeparator orientation="vertical" class="hidden h-6 sm:block" />
      <UButton
        v-if="canEdit"
        icon="i-lucide-pencil"
        color="neutral"
        variant="outline"
        size="sm"
        :label="$t('recipeDetail.actions.edit')"
        data-testid="action-edit"
        @click="emit('edit')"
      />
      <UButton
        v-if="canDelete"
        icon="i-lucide-trash-2"
        color="error"
        variant="outline"
        size="sm"
        :label="$t('recipeDetail.actions.delete')"
        data-testid="action-delete"
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
import type { RecipeRights } from '#shared/utils/recipeRights'

/**
 * Barre d'actions de la fiche : favori, courses (par section), planning,
 * mode cuisine, impression ; modifier/supprimer pour l'admin (les
 * confirmations et l'éditeur sont portés par la page).
 *
 * v2 : `rights` (calculés par `recipeRights` d'après `recipe_access`) décide des boutons « Ajouter à mon carnet »,
 * « Retirer », « Faire une copie modifiable », « Partager », « Modifier » (auteur ou edit_original) et « Supprimer »
 * (auteur seulement). Affichage seulement : la base refuse (42501) ce qui n'est pas permis.
 */
const props = withDefaults(defineProps<{
  recipe: Recipe
  /** Facteur de portions transmis à `add_recipe_to_list`. */
  factor?: number
  servings?: number | null
  /** v2 : droits affichés sur cette recette (`null` : pas encore connus). */
  rights?: RecipeRights | null
  /** v2 : action de carnet en cours (désactive les boutons). */
  busy?: 'add' | 'remove' | 'copy' | null
}>(), {
  factor: 1,
  servings: null,
  rights: null,
  busy: null
})

const emit = defineEmits<{ edit: [], delete: [], cook: [], add: [], remove: [], copy: [], share: [] }>()

const v2 = useV2()

const authStore = useAuthStore()
const favoritesStore = useFavoritesStore()
const toast = useToast()
const { t } = useI18n()

// v1 : « Modifier / Supprimer » pour les admins ; v2 : selon les droits sur CETTE recette.
const canEdit = computed(() => (v2 ? props.rights?.canEdit === true : authStore.isAdmin))
const canDelete = computed(() => (v2 ? props.rights?.canDelete === true : authStore.isAdmin))

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
