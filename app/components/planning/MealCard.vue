<template>
  <div
    class="group relative flex items-center gap-2 rounded-lg border border-default bg-default p-1.5 transition-colors hover:bg-elevated print:border-0 print:p-0"
    :class="{ 'cursor-grab active:cursor-grabbing': draggable }"
    :draggable="draggable"
    @dragstart="onDragStart"
    @dragend="emit('dragend')"
  >
    <!-- Vignette : photo de la recette, ou icône de repli (masquée sur grand écran pour laisser la place au titre) -->
    <div
      class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted print:hidden"
      :class="photoUrl ? 'lg:size-7' : 'lg:hidden'"
    >
      <img
        v-if="photoUrl"
        :src="photoUrl"
        alt=""
        class="size-full object-cover"
        loading="lazy"
      >
      <UIcon
        v-else
        :name="meal.recipe ? 'i-lucide-utensils' : 'i-lucide-pencil-line'"
        class="size-4 text-muted"
      />
    </div>

    <div class="min-w-0 flex-1 lg:pr-5 print:pr-0">
      <NuxtLink
        v-if="meal.recipe"
        :to="localePath(`/recettes/${meal.recipe.id}`)"
        class="line-clamp-2 break-words text-sm leading-snug text-default hover:text-primary lg:text-xs"
        :title="title"
      >
        {{ title }}
      </NuxtLink>
      <span v-else class="line-clamp-2 break-words text-sm italic leading-snug text-default lg:text-xs" :title="title">{{ title }}</span>
    </div>

    <!-- Menu : en ligne sur mobile, superposé en haut à droite (au survol / focus) sur grand écran -->
    <UDropdownMenu :items="menuItems" :content="{ align: 'end' }">
      <UButton
        icon="i-lucide-ellipsis-vertical"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="$t('planning.meal.actions')"
        class="shrink-0 print:hidden lg:absolute lg:right-0.5 lg:top-0.5 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 lg:group-focus-within:opacity-100 lg:data-[state=open]:opacity-100"
      />
    </UDropdownMenu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PlanningMeal } from '#shared/types'
import type { Database } from '#shared/types/database'
import { mealTitle } from '~/composables/usePlanningWeek'

/**
 * Un repas planifié : vignette (photo de la recette ou icône de repli), titre,
 * menu d'actions (voir, déplacer, retirer). Déplaçable à la souris ; le menu
 * « Déplacer… » est le repli accessible du glisser-déposer.
 */
const props = withDefaults(defineProps<{
  meal: PlanningMeal
  draggable?: boolean
}>(), { draggable: true })

const emit = defineEmits<{
  move: [meal: PlanningMeal]
  remove: [meal: PlanningMeal]
  dragstart: [meal: PlanningMeal]
  dragend: []
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const supabase = useSupabaseClient<Database>()

const title = computed(() => mealTitle(props.meal, t('planning.meal.untitled')))

/** URL publique de la photo (bucket `recipe-photos`), `null` sans photo. */
const photoUrl = computed(() => {
  const path = props.meal.recipe?.photoPath
  return path ? supabase.storage.from('recipe-photos').getPublicUrl(path).data.publicUrl : null
})

const menuItems = computed(() => [
  [
    ...(props.meal.recipe
      ? [{ label: t('planning.meal.open'), icon: 'i-lucide-book-open', to: localePath(`/recettes/${props.meal.recipe.id}`) }]
      : []),
    { label: t('planning.meal.move'), icon: 'i-lucide-arrow-right-left', onSelect: () => emit('move', props.meal) }
  ],
  [
    { label: t('planning.meal.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('remove', props.meal) }
  ]
])

const onDragStart = (event: DragEvent) => {
  if (!props.draggable) return
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', props.meal.id)
  }
  emit('dragstart', props.meal)
}
</script>
