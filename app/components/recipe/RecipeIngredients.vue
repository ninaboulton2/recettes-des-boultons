<template>
  <section :aria-labelledby="headingId" class="space-y-4">
    <div class="flex items-baseline justify-between gap-3">
      <h2 :id="headingId" class="font-serif text-2xl font-semibold text-highlighted">
        {{ $t('recipeDetail.ingredients.title') }}
      </h2>
      <div v-if="total > 0" class="flex items-center gap-2 text-xs text-muted print:hidden">
        <span class="tabular-nums">{{ $t('recipeDetail.ingredients.progress', { checked: checkedCount, total }) }}</span>
        <UButton
          v-if="checkedCount > 0"
          :label="$t('recipeDetail.ingredients.resetChecks')"
          color="neutral"
          variant="link"
          size="xs"
          @click="resetChecks"
        />
      </div>
    </div>

    <p v-if="sections.length === 0" class="text-sm text-muted">
      {{ $t('recipeDetail.ingredients.empty') }}
    </p>

    <div v-for="section in sections" :key="section.id" class="space-y-2">
      <h3 v-if="showSectionNames && section.name.trim()" class="font-serif text-lg font-medium text-default">
        {{ section.name }}
      </h3>
      <ul class="space-y-1.5">
        <li
          v-for="ingredient in section.ingredients"
          :key="ingredient.id"
          class="rounded-lg px-2 py-1 -mx-2 transition-colors hover:bg-muted print:px-0 print:mx-0"
        >
          <UCheckbox
            :model-value="checked[ingredient.id] ?? false"
            :ui="{ root: 'items-start', label: 'cursor-pointer leading-6' }"
            @update:model-value="setChecked(ingredient.id, $event === true)"
          >
            <template #label>
              <span :class="checked[ingredient.id] ? 'text-dimmed line-through' : 'text-default'">
                <span v-if="amountLabel(ingredient)" class="font-medium tabular-nums">{{ amountLabel(ingredient) }} </span>
                <span>{{ ingredient.name }}</span>
                <span v-if="ingredient.optional" class="ml-1 text-xs text-muted">
                  ({{ $t('recipeDetail.ingredients.optional') }})
                </span>
              </span>
            </template>
          </UCheckbox>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { RecipeSection } from '#shared/types'

/**
 * Ingrédients par section avec cases à cocher (suivi en cuisinant) ; les
 * quantités sont mises à l'échelle (`factor`) et l'unité affichée via le
 * référentiel `units` (`unitLabel`), avec repli sur le texte saisi.
 */
const props = withDefaults(defineProps<{
  /** Sections ayant des ingrédients (déjà filtrées et triées). */
  sections: RecipeSection[]
  factor?: number
}>(), {
  factor: 1
})

const headingId = useId()
const { amountLabel: scaledLabel } = useIngredientLabel()

const checked = ref<Record<string, boolean>>({})
const setChecked = (id: string, value: boolean) => {
  checked.value = { ...checked.value, [id]: value }
}
const resetChecks = () => {
  checked.value = {}
}
// Nouvelle recette → on repart de zéro.
watch(() => props.sections.map(section => section.id).join('|'), resetChecks)

const total = computed(() => props.sections.reduce((count, section) => count + section.ingredients.length, 0))
const checkedCount = computed(() => Object.values(checked.value).filter(Boolean).length)
const showSectionNames = computed(() => props.sections.length > 1 || props.sections.some(section => section.name.trim() !== ''))

const amountLabel = (ingredient: RecipeSection['ingredients'][number]): string => scaledLabel(ingredient, props.factor)
</script>
