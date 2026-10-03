<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <UFormField :label="$t('planning.move.day')">
      <USelect
        :model-value="dateString"
        :items="dayItems"
        class="w-full"
        @update:model-value="emit('update:dateString', String($event))"
      />
    </UFormField>
    <UFormField :label="$t('planning.move.slot')">
      <URadioGroup
        :model-value="mealType"
        :items="slotItems"
        orientation="horizontal"
        variant="card"
        @update:model-value="emit('update:mealType', $event === 'dinner' ? 'dinner' : 'lunch')"
      />
    </UFormField>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MealType } from '#shared/types'
import type { PlanningDay } from '~/composables/usePlanningWeek'

/** Choix d'un jour (parmi la semaine affichée) et d'un créneau. */
const props = defineProps<{
  dateString: string
  mealType: MealType
  days: PlanningDay[]
}>()

const emit = defineEmits<{
  'update:dateString': [value: string]
  'update:mealType': [value: MealType]
}>()

const { t, locale } = useI18n()

const dayItems = computed(() => {
  const format = new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long' })
  return props.days.map(day => ({ label: format.format(day.date), value: day.dateString }))
})

const slotItems = computed(() => [
  { label: t('planning.meals.lunch'), value: 'lunch' },
  { label: t('planning.meals.dinner'), value: 'dinner' }
])
</script>
