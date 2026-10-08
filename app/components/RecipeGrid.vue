<template>
  <!-- Grille : les cartes s'étirent à la hauteur de la plus haute de leur rangée
       (`align-items: stretch` + carte `h-full flex flex-col`). -->
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6" data-testid="recipe-grid">
    <RecipeCard
      v-for="recipe in recipes"
      :key="recipe.id"
      :recipe="recipe"
      :show-admin-actions="showAdminActions"
      :compact-visual="compactVisual"
      @edit="emit('edit', $event)"
      @delete="emit('delete', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { Recipe, RecipeSummary } from '#shared/types'

const props = withDefaults(defineProps<{
  recipes: Array<RecipeSummary | Recipe>
  showAdminActions?: boolean
}>(), {
  showAdminActions: false
})

const emit = defineEmits<{
  edit: [recipe: RecipeSummary]
  delete: [recipe: RecipeSummary]
}>()

const { config } = useEdition()

/**
 * Hauteur de la zone visuelle, décidée pour TOUTE la grille (cartes de même
 * hauteur dans une rangée) :
 * - édition `fixed` (Boultons) : toujours `aspect-[4/3]` (photo ou illustration) ;
 * - édition `adaptive` (générique) : `aspect-[4/3]` si au moins une recette de
 *   la grille a une photo, sinon zone basse (icône seule) partout.
 */
const compactVisual = computed(() =>
  config.recipeCards.visual === 'adaptive' && !props.recipes.some(recipe => recipe.photoPath)
)
</script>
