<template>
  <section
    class="rounded-lg p-1.5 transition-colors"
    :class="dragOver ? 'bg-primary/10 ring-2 ring-primary/40' : ''"
    :aria-label="`${slotLabel} — ${meals.length}`"
    @dragover.prevent="onDragOver"
    @dragenter.prevent="dragOver = true"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <header class="mb-1.5 flex items-center justify-between gap-1">
      <h4 class="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
        <UIcon :name="mealType === 'lunch' ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-3.5 print:hidden" />
        {{ slotLabel }}
      </h4>
      <UButton
        icon="i-lucide-plus"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="`${$t('planning.slot.add')} — ${slotLabel}`"
        class="print:hidden"
        @click="emit('add', dateString, mealType)"
      />
    </header>

    <div v-if="meals.length > 0" class="space-y-1.5">
      <PlanningMealCard
        v-for="meal in meals"
        :key="meal.id"
        :meal="meal"
        @move="emit('move', $event)"
        @remove="emit('remove', $event)"
      />
    </div>
    <button
      v-else
      type="button"
      class="flex min-h-11 w-full items-center justify-center rounded-lg border border-dashed border-default text-xs text-dimmed transition-colors hover:border-primary hover:text-primary print:hidden"
      @click="emit('add', dateString, mealType)"
    >
      {{ dragOver ? $t('planning.slot.dropHere') : $t('planning.slot.empty') }}
    </button>

    <PlanningMealNoteEditor
      class="mt-1.5"
      :model-value="groupNote"
      :label="$t(`planning.note.${mealType}`)"
      @save="(content, done) => emit('save-note', dateString, mealType, content, done)"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MealType, PlanningMeal } from '#shared/types'

/**
 * Un créneau (déjeuner ou dîner) d'un jour : repas, bouton d'ajout, zone de
 * dépôt du glisser-déposer et note du créneau.
 */
const props = defineProps<{
  dateString: string
  mealType: MealType
  meals: PlanningMeal[]
  groupNote?: string | null
}>()

const emit = defineEmits<{
  add: [dateString: string, mealType: MealType]
  move: [meal: PlanningMeal]
  remove: [meal: PlanningMeal]
  /** Dépôt d'un repas (identifiant transporté par le glisser-déposer). */
  drop: [mealId: string, dateString: string, mealType: MealType]
  'save-note': [dateString: string, mealType: MealType, content: string | null, done: () => void]
}>()

const { t } = useI18n()
const slotLabel = computed(() => t(`planning.meals.${props.mealType}`))

const dragOver = ref(false)

const onDragOver = (event: DragEvent) => {
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

const onDragLeave = (event: DragEvent) => {
  // Ignorer les sorties vers un enfant du créneau.
  const target = event.currentTarget
  if (target instanceof HTMLElement && event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return
  dragOver.value = false
}

const onDrop = (event: DragEvent) => {
  dragOver.value = false
  const mealId = event.dataTransfer?.getData('text/plain')
  if (mealId) emit('drop', mealId, props.dateString, props.mealType)
}
</script>
