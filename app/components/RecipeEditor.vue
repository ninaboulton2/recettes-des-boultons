<template>
  <UModal
    :open="show"
    :title="recipe ? $t('editor.titleEdit') : $t('editor.titleNew')"
    :description="recipe?.title"
    :content="{ onInteractOutside: keepOpenOnOutsideClick }"
    :ui="{ content: 'sm:max-w-4xl', title: 'font-serif text-xl' }"
    @update:open="onOpenChange"
  >
    <template #body>
      <RecipeEditorForm
        v-if="show"
        :recipe="recipe"
        @saved="onSaved"
        @cancel="emit('close')"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { Recipe } from '#shared/types'
import RecipeEditorForm from './editor/RecipeEditorForm.vue'

/**
 * Façade de l'éditeur de recette : même API qu'avant la refonte
 * (`show` / `recipe` → `close` / `save`) pour les pages qui l'utilisent
 * (`pages/recettes/index.vue`, `pages/recettes/[id].vue`). Le formulaire
 * lui-même vit dans `editor/RecipeEditorForm.vue` et est recréé à chaque
 * ouverture (état vierge).
 */
withDefaults(defineProps<{
  show?: boolean
  /** Recette complète (avec sections) à modifier ; `null` pour une création. */
  recipe?: Recipe | null
}>(), {
  show: false,
  recipe: null
})

const emit = defineEmits<{
  close: []
  save: [recipe: Recipe]
}>()

/**
 * Un clic à côté de la modale ne la ferme pas (saisie en cours protégée) ;
 * Échap, lui, la ferme comme toutes les modales de l'app. Avant, `dismissible:
 * false` bloquait les deux (Nuxt UI ne distingue pas Échap du clic extérieur).
 */
const keepOpenOnOutsideClick = (event: Event) => {
  event.preventDefault()
}

const onOpenChange = (open: boolean) => {
  if (!open) emit('close')
}

const onSaved = (recipe: Recipe) => {
  emit('save', recipe)
  emit('close')
}
</script>
