<template>
  <div class="inline-flex items-center gap-1" role="group" :aria-label="$t('recipeDetail.servings')">
    <UButton
      icon="i-lucide-minus"
      color="neutral"
      variant="outline"
      size="xs"
      :aria-label="$t('recipeDetail.servingsDecrease')"
      :disabled="modelValue <= min"
      class="print:hidden"
      @click="emit('update:modelValue', modelValue - 1)"
    />
    <span class="min-w-[7.5rem] text-center text-sm font-medium text-default tabular-nums">
      {{ $t('recipeDetail.servingsCount', { count: modelValue }, modelValue) }}
    </span>
    <UButton
      icon="i-lucide-plus"
      color="neutral"
      variant="outline"
      size="xs"
      :aria-label="$t('recipeDetail.servingsIncrease')"
      :disabled="modelValue >= max"
      class="print:hidden"
      @click="emit('update:modelValue', modelValue + 1)"
    />
    <UTooltip v-if="base !== null && base !== modelValue" :text="$t('recipeDetail.servingsReset', { count: base })">
      <UButton
        icon="i-lucide-rotate-ccw"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="$t('recipeDetail.servingsReset', { count: base })"
        class="print:hidden"
        @click="emit('update:modelValue', base)"
      />
    </UTooltip>
  </div>
</template>

<script setup lang="ts">
import { MAX_SERVINGS, MIN_SERVINGS } from '~/composables/useServingsScaler'

/** Compteur de portions « − / n / + » avec retour aux portions d'origine. */
withDefaults(defineProps<{
  modelValue: number
  /** Portions de la recette d'origine (`null` si inconnues). */
  base?: number | null
  min?: number
  max?: number
}>(), {
  base: null,
  min: MIN_SERVINGS,
  max: MAX_SERVINGS
})

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>
