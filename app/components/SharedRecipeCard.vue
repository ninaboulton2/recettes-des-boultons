<template>
  <div class="flex h-full flex-col gap-2" data-testid="shared-recipe" :data-recipe-id="recipe.id">
    <RecipeCard :recipe="recipe" class="flex-1" />
    <p v-if="note" class="px-1 text-xs text-muted" data-testid="shared-recipe-note">{{ note }}</p>
    <div class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RecipeSummary } from '#shared/types'

/** Carte d'une recette des pages « Partagées avec moi » et « Explorer » : la carte habituelle, une ligne d'origine et des actions. */
defineProps<{
  recipe: RecipeSummary
  /** Ligne discrète sous la carte (ex. « de Marie, via un groupe »). */
  note?: string
}>()
</script>
