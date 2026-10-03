<template>
  <div class="flex items-start gap-2">
    <button
      type="button"
      class="mt-2 flex cursor-grab touch-none items-center text-dimmed hover:text-default active:cursor-grabbing"
      :aria-label="$t('editor.step.drag')"
      @pointerdown="emit('arm-drag')"
    >
      <UIcon name="i-lucide-grip-vertical" class="size-4" aria-hidden="true" />
    </button>
    <span class="mt-1.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary tabular-nums">
      {{ index + 1 }}
    </span>
    <UFormField :name="`${fieldPrefix}.content`" class="min-w-0 flex-1" :ui="{ error: 'text-xs' }">
      <UTextarea
        :model-value="step.content"
        :rows="2"
        autoresize
        :placeholder="$t('editor.step.placeholder')"
        :aria-label="$t('recipeDetail.steps.step', { n: index + 1 })"
        class="w-full"
        @update:model-value="emit('update:step', { ...step, content: String($event ?? '') })"
      />
    </UFormField>
    <div class="flex items-center gap-0.5 pt-1">
      <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="xs" :aria-label="$t('editor.sections.moveUp')" :disabled="!canMoveUp" @click="emit('move', -1)" />
      <UButton icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="xs" :aria-label="$t('editor.sections.moveDown')" :disabled="!canMoveDown" @click="emit('move', 1)" />
      <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs" :aria-label="$t('editor.step.remove')" @click="emit('remove')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FormStep } from './RecipeEditorForm.vue'

/** Une étape : poignée de glisser-déposer, numéro, texte, monter/descendre, supprimer. */
defineProps<{
  step: FormStep
  index: number
  /** Préfixe des noms de champs UForm (`sections.1.instructions.0`). */
  fieldPrefix: string
  canMoveUp: boolean
  canMoveDown: boolean
}>()

const emit = defineEmits<{
  'update:step': [value: FormStep]
  'move': [direction: -1 | 1]
  'remove': []
  /** La poignée est pressée : la ligne devient déplaçable. */
  'arm-drag': []
}>()
</script>
