<template>
  <article
    class="flex flex-col gap-2 rounded-xl border bg-default p-2 print:break-inside-avoid print:rounded-none print:border-default"
    :class="day.isToday ? 'border-primary' : 'border-default'"
  >
    <header
      class="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 lg:flex-col lg:items-center lg:gap-0 lg:text-center"
      :class="day.isToday ? 'bg-primary/10' : 'bg-muted print:bg-transparent'"
    >
      <h3 class="font-sans text-sm font-semibold capitalize text-highlighted">
        {{ dayName }}
      </h3>
      <p class="text-xs" :class="day.isToday ? 'font-medium text-primary' : 'text-muted'">
        {{ dateLabel }}
        <span v-if="day.isToday" class="sr-only">({{ $t('planning.today') }})</span>
      </p>
    </header>

    <PlanningMealSlot
      v-for="mealType in MEAL_TYPES"
      :key="mealType"
      :date-string="day.dateString"
      :meal-type="mealType"
      :meals="day.meals[mealType]"
      :group-note="mealType === 'lunch' ? day.meals.lunchGroupNote : day.meals.dinnerGroupNote"
      @add="(dateString, slot) => emit('add', dateString, slot)"
      @move="emit('move', $event)"
      @remove="emit('remove', $event)"
      @drop="(mealId, dateString, slot) => emit('drop', mealId, dateString, slot)"
      @save-note="(dateString, slot, content, done) => emit('save-note', dateString, slot, content, done)"
    />

    <PlanningMealNoteEditor
      class="mt-auto border-t border-default px-1.5 pt-2"
      :model-value="day.meals.notes"
      :label="$t('planning.note.day')"
      @save="(content, done) => emit('save-note', day.dateString, 'day', content, done)"
    />
  </article>
</template>

<script setup lang="ts">
import type { MealType, PlanningMeal } from '#shared/types'
import type { NoteType } from '#shared/schemas/planning'
import { MEAL_TYPES } from '#shared/schemas/planning'
import type { PlanningDay } from '~/composables/usePlanningWeek'

/**
 * Un jour du planning : en-tête (nom du jour, date), créneaux déjeuner et
 * dîner, note du jour. Carte empilée sur mobile, colonne de la grille sur
 * grand écran.
 */
defineProps<{
  day: PlanningDay
  dayName: string
  dateLabel: string
}>()

const emit = defineEmits<{
  add: [dateString: string, mealType: MealType]
  move: [meal: PlanningMeal]
  remove: [meal: PlanningMeal]
  drop: [mealId: string, dateString: string, mealType: MealType]
  'save-note': [dateString: string, noteType: NoteType, content: string | null, done: () => void]
}>()
</script>
