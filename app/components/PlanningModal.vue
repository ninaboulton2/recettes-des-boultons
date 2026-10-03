<template>
  <UModal
    :open="show"
    :title="$t('planning.planningModal.title', { title: recipe.title })"
    :description="$t('planning.planningModal.description')"
    :ui="{ content: 'sm:max-w-3xl' }"
    @update:open="value => !value && closeModal()"
  >
    <template #body>
      <div class="space-y-4">
        <PlanningWeekNavigator
          :label="week.weekLabel.value"
          :is-current-week="week.isCurrentWeek.value"
          @previous="week.previousWeek"
          @next="week.nextWeek"
          @today="week.goToToday"
        />

        <div v-if="week.store.isLoading && !hasData" class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <USkeleton v-for="index in 7" :key="index" class="h-28 w-full" />
        </div>

        <div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div
            v-for="day in week.days.value"
            :key="day.dateString"
            class="flex flex-col gap-1.5 rounded-lg border p-1.5"
            :class="day.isToday ? 'border-primary bg-primary/5' : 'border-default'"
          >
            <p class="truncate text-center text-xs font-semibold capitalize text-highlighted">
              {{ week.shortDayName(day.date) }}
              <span class="block font-normal text-muted">{{ week.shortDate(day.date) }}</span>
            </p>
            <UButton
              v-for="mealType in MEAL_TYPES"
              :key="mealType"
              :label="week.slotLabel(mealType)"
              :icon="mealType === 'lunch' ? 'i-lucide-sun' : 'i-lucide-moon'"
              :color="isSelected(day.dateString, mealType) ? 'primary' : 'neutral'"
              :variant="isSelected(day.dateString, mealType) ? 'solid' : 'soft'"
              size="xs"
              class="justify-start"
              :aria-pressed="isSelected(day.dateString, mealType)"
              @click="select(day.dateString, mealType)"
            >
              <template #trailing>
                <UBadge
                  v-if="day.meals[mealType].length > 0"
                  :label="String(day.meals[mealType].length)"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                  class="ml-auto"
                  :aria-label="$t('planning.planningModal.count', { count: day.meals[mealType].length })"
                />
              </template>
            </UButton>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <UButton :label="$t('planning.planningModal.cancel')" color="neutral" variant="ghost" @click="closeModal" />
        <UButton
          :label="$t('planning.planningModal.confirm')"
          icon="i-lucide-calendar-plus"
          :disabled="!selectedDay || !selectedMealType"
          :loading="submitting"
          @click="confirmAddToPlanning"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MealType, RecipeSummary } from '#shared/types'
import { MEAL_TYPES } from '#shared/schemas/planning'
import { usePlanningWeek } from '~/composables/usePlanningWeek'

/**
 * Ajout d'une recette au planning depuis sa carte ou sa fiche : choix d'un
 * jour et d'un créneau dans la semaine affichée (navigable).
 * API conservée : props `show` / `recipe`, événement `close`.
 */
const props = withDefaults(defineProps<{
  show?: boolean
  recipe: RecipeSummary
}>(), {
  show: false
})

const emit = defineEmits<{ close: [] }>()

const week = usePlanningWeek()

const selectedDay = ref<string | null>(null)
const selectedMealType = ref<MealType | null>(null)
const submitting = ref(false)

const hasData = computed(() => Object.keys(week.store.weekPlanning).length > 0)

// La semaine affichée est chargée à l'ouverture et à chaque navigation
watch([() => props.show, week.weekKey], ([isOpen]) => {
  if (isOpen) void week.store.ensureWeekLoaded(week.currentWeek.value)
}, { immediate: true })

// Réinitialisation à chaque changement de recette
watch(() => props.recipe.id, () => {
  week.goToToday()
  selectedDay.value = null
  selectedMealType.value = null
})

const isSelected = (dateString: string, mealType: MealType) =>
  selectedDay.value === dateString && selectedMealType.value === mealType

const select = (dateString: string, mealType: MealType) => {
  selectedDay.value = dateString
  selectedMealType.value = mealType
}

const closeModal = () => {
  emit('close')
  selectedDay.value = null
  selectedMealType.value = null
}

const confirmAddToPlanning = async () => {
  if (!selectedDay.value || !selectedMealType.value) return
  submitting.value = true
  const ok = await week.addRecipe(selectedDay.value, selectedMealType.value, props.recipe)
  submitting.value = false
  if (ok) closeModal()
}
</script>
