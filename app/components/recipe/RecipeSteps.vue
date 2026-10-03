<template>
  <section :aria-labelledby="headingId" class="space-y-5">
    <h2 :id="headingId" class="font-serif text-2xl font-semibold text-highlighted">
      {{ $t('recipeDetail.steps.title') }}
    </h2>

    <p v-if="sections.length === 0" class="text-sm text-muted">
      {{ $t('recipeDetail.steps.empty') }}
    </p>

    <div v-for="section in sections" :key="section.id" class="space-y-3">
      <h3 v-if="showSectionNames && section.name.trim()" class="font-serif text-lg font-medium text-default">
        {{ section.name }}
      </h3>
      <ol class="space-y-3">
        <li
          v-for="(instruction, index) in section.instructions"
          :key="instruction.id"
          class="flex gap-3"
        >
          <span
            class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary tabular-nums print:border print:border-default"
            :aria-label="$t('recipeDetail.steps.step', { n: index + 1 })"
          >
            {{ index + 1 }}
          </span>
          <p class="leading-7 text-default whitespace-pre-line">{{ instruction.content }}</p>
        </li>
      </ol>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RecipeSection } from '#shared/types'

/** Étapes numérotées, par section (sections ayant des instructions, déjà triées). */
const props = defineProps<{ sections: RecipeSection[] }>()

const headingId = useId()
const showSectionNames = computed(() => props.sections.length > 1 || props.sections.some(section => section.name.trim() !== ''))
</script>
