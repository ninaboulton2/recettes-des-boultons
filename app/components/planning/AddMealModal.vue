<template>
  <UModal
    :open="open"
    :title="$t('planning.addModal.title')"
    :description="description"
    :ui="{ content: 'sm:max-w-2xl' }"
    @update:open="value => !value && emit('close')"
  >
    <template #body>
      <div class="space-y-4">
        <PlanningDaySlotPicker
          v-model:date-string="targetDate"
          v-model:meal-type="targetSlot"
          :days="days"
        />

        <UTabs v-model="tab" :items="tabs" :content="false" size="sm" />

        <!-- Recette existante -->
        <div v-if="tab === 'recipe'" class="space-y-3">
          <UInput
            ref="searchInput"
            v-model="query"
            icon="i-lucide-search"
            :placeholder="$t('planning.addModal.search')"
            class="w-full"
            autofocus
          />

          <div v-if="selector.status.value === 'pending' && selector.recipes.value.length === 0" class="space-y-2">
            <USkeleton v-for="index in 4" :key="index" class="h-12 w-full" />
          </div>

          <UEmpty
            v-else-if="selector.recipes.value.length === 0"
            icon="i-lucide-search-x"
            :title="query ? $t('planning.addModal.noResults', { query }) : $t('planning.addModal.noResults', { query: '' })"
            variant="naked"
            size="sm"
            :actions="query ? [{ label: $t('planning.addModal.addAsCustom', { query }), icon: 'i-lucide-pencil-line', color: 'primary', variant: 'soft', onClick: addQueryAsCustom }] : []"
          />

          <ul v-else class="max-h-80 divide-y divide-default overflow-y-auto rounded-lg border border-default">
            <li v-for="recipe in selector.recipes.value" :key="recipe.id">
              <button
                type="button"
                class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-elevated disabled:opacity-60"
                :disabled="submitting"
                @click="pickRecipe(recipe)"
              >
                <span class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  <NuxtImg
                    v-if="recipe.photoPath"
                    :src="publicUrl(recipe.photoPath) ?? undefined"
                    alt=""
                    :width="40"
                    :height="40"
                    densities="x1 x2"
                    fit="cover"
                    format="webp"
                    loading="lazy"
                    class="size-full object-cover"
                  />
                  <UIcon v-else :name="categoryIcon(recipe.category)" class="size-5 text-dimmed" aria-hidden="true" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-highlighted">{{ recipe.title }}</span>
                  <span class="block truncate text-xs text-muted">
                    {{ categoryName(recipe.category) }}<template v-if="totalTime(recipe) !== null"> · {{ $t('ui.card.minutes', { n: totalTime(recipe) }) }}</template>
                  </span>
                </span>
                <UIcon name="i-lucide-plus" class="size-4 shrink-0 text-muted" aria-hidden="true" />
              </button>
            </li>
          </ul>

          <div v-if="selector.totalPages.value > 1" class="flex items-center justify-between text-xs text-muted">
            <UButton :label="$t('planning.addModal.previous')" color="neutral" variant="ghost" size="xs" :disabled="page <= 1" @click="page--" />
            <span>{{ $t('planning.addModal.page', { page, total: selector.totalPages.value }) }}</span>
            <UButton :label="$t('planning.addModal.next')" color="neutral" variant="ghost" size="xs" :disabled="page >= selector.totalPages.value" @click="page++" />
          </div>
        </div>

        <!-- Repas personnalisé -->
        <form v-else class="space-y-3" @submit.prevent="submitCustom">
          <UFormField :label="$t('planning.addModal.customLabel')" required>
            <UInput
              v-model="customTitle"
              :placeholder="$t('planning.addModal.customPlaceholder')"
              class="w-full"
              autofocus
              maxlength="200"
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton :label="$t('planning.addModal.cancel')" color="neutral" variant="ghost" @click="emit('close')" />
            <UButton :label="$t('planning.addModal.confirm')" type="submit" icon="i-lucide-plus" :loading="submitting" :disabled="!customTitle.trim()" />
          </div>
        </form>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { MealType, RecipeSummary } from '#shared/types'
import { totalTime } from '#shared/utils/recipes'
import type { PlanningDay } from '~/composables/usePlanningWeek'

/**
 * Ajout d'un repas à un créneau : recette existante (recherche paginée via
 * `useRecipeSearch`, côté client uniquement) ou repas personnalisé.
 */
const props = defineProps<{
  open: boolean
  dateString: string | null
  mealType: MealType | null
  days: PlanningDay[]
  /** Pré-remplit la recherche (ex. depuis `?addRecipe=&recipeTitle=`). */
  initialQuery?: string
}>()

const emit = defineEmits<{
  close: []
  'add-recipe': [dateString: string, mealType: MealType, recipe: RecipeSummary, done: () => void]
  'add-custom': [dateString: string, mealType: MealType, title: string, done: () => void]
}>()

const { t, locale } = useI18n()
const { categoryName, categoryIcon } = useCategories()
const { publicUrl } = useRecipePhoto()

const tab = ref<'recipe' | 'custom'>('recipe')
const tabs = computed(() => [
  { label: t('planning.addModal.recipeTab'), value: 'recipe', icon: 'i-lucide-book-open' },
  { label: t('planning.addModal.customTab'), value: 'custom', icon: 'i-lucide-pencil-line' }
])

const targetDate = ref('')
const targetSlot = ref<MealType>('lunch')
const customTitle = ref('')
const submitting = ref(false)

const description = computed(() => {
  const day = props.days.find(candidate => candidate.dateString === targetDate.value)
  if (!day) return undefined
  const date = new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }).format(day.date)
  return t('planning.addModal.description', { date, slot: t(`planning.meals.${targetSlot.value}`) })
})

// Recherche de recettes avec anti-rebond, relancée à chaque frappe
const query = ref('')
const debouncedQuery = ref('')
const page = ref(1)
let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch(query, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedQuery.value = value
    page.value = 1
  }, 250)
})
onUnmounted(() => clearTimeout(debounceTimer))

const selector = useRecipeSearch('planning-add-meal', { query: debouncedQuery, page }, { server: false, lazy: true, immediate: false })

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  targetDate.value = props.dateString ?? props.days[0]?.dateString ?? ''
  targetSlot.value = props.mealType ?? 'lunch'
  tab.value = 'recipe'
  customTitle.value = ''
  submitting.value = false
  query.value = props.initialQuery ?? ''
  debouncedQuery.value = query.value
  page.value = 1
  void selector.execute()
}, { immediate: true })

const finish = () => {
  submitting.value = false
}

const pickRecipe = (recipe: RecipeSummary) => {
  if (!targetDate.value) return
  submitting.value = true
  emit('add-recipe', targetDate.value, targetSlot.value, recipe, finish)
}

const submitCustom = () => {
  const title = customTitle.value.trim()
  if (!title || !targetDate.value) return
  submitting.value = true
  emit('add-custom', targetDate.value, targetSlot.value, title, finish)
}

const addQueryAsCustom = () => {
  customTitle.value = query.value.trim()
  submitCustom()
}
</script>
