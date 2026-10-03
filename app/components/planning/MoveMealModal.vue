<template>
  <UModal
    :open="open"
    :title="$t('planning.move.title')"
    :description="meal ? $t('planning.move.description', { title: mealTitle(meal, $t('planning.meal.untitled')) }) : undefined"
    @update:open="value => !value && emit('close')"
  >
    <template #body>
      <PlanningDaySlotPicker
        v-model:date-string="targetDate"
        v-model:meal-type="targetSlot"
        :days="days"
      />
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton :label="$t('planning.move.cancel')" color="neutral" variant="ghost" @click="emit('close')" />
        <UButton
          :label="$t('planning.move.confirm')"
          icon="i-lucide-arrow-right-left"
          :loading="submitting"
          :disabled="!changed"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MealType, PlanningMeal } from '#shared/types'
import { mealTitle, type PlanningDay } from '~/composables/usePlanningWeek'

/** Repli accessible du glisser-déposer : choix du jour et du créneau cibles. */
const props = defineProps<{
  open: boolean
  meal: PlanningMeal | null
  days: PlanningDay[]
}>()

const emit = defineEmits<{
  close: []
  /** Destination choisie ; `done` ferme la modale une fois le déplacement terminé. */
  confirm: [meal: PlanningMeal, dateString: string, mealType: MealType, done: () => void]
}>()

const targetDate = ref('')
const targetSlot = ref<MealType>('lunch')
const submitting = ref(false)

watch(() => props.open, (isOpen) => {
  if (isOpen && props.meal) {
    targetDate.value = props.meal.dateString
    targetSlot.value = props.meal.mealType
    submitting.value = false
  }
}, { immediate: true })

const changed = computed(() =>
  Boolean(props.meal) && (targetDate.value !== props.meal?.dateString || targetSlot.value !== props.meal?.mealType)
)

const confirm = () => {
  if (!props.meal || !changed.value) return
  submitting.value = true
  emit('confirm', props.meal, targetDate.value, targetSlot.value, () => {
    submitting.value = false
  })
}
</script>
