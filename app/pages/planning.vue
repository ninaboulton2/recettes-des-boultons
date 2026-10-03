<template>
  <div>
    <div v-if="!authStore.isAuthenticated">
      <AuthRequired @login="showLoginModal = true" />
      <AuthModal
        :is-open="showLoginModal"
        @close="showLoginModal = false"
        @success="showLoginModal = false"
      />
    </div>

    <div v-else class="planning-page space-y-4">
      <!-- En-tête -->
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="font-serif text-3xl text-highlighted sm:text-4xl">
            {{ $t('planning.title') }}
          </h1>
          <p class="mt-1 text-sm text-muted print:hidden">
            {{ $t('planning.subtitle') }}
          </p>
          <p class="hidden text-sm text-muted print:block">
            {{ week.weekLabel.value }}
          </p>
        </div>
        <UButton
          :label="$t('planning.print')"
          icon="i-lucide-printer"
          color="neutral"
          variant="outline"
          class="print:hidden"
          @click="print"
        />
      </header>

      <PlanningWeekNavigator
        :label="week.weekLabel.value"
        :is-current-week="week.isCurrentWeek.value"
        @previous="week.previousWeek"
        @next="week.nextWeek"
        @today="week.goToToday"
      />

      <!-- Chargement initial -->
      <div v-if="status === 'pending' && !hasData" class="grid grid-cols-1 gap-3 lg:grid-cols-7" aria-busy="true">
        <USkeleton v-for="index in 7" :key="index" class="h-40 w-full rounded-xl lg:h-80" />
      </div>

      <ErrorState
        v-else-if="error"
        :message="error.message"
        :retry-action="() => refresh()"
        :title="$t('planning.loadError')"
        :retry-text="$t('planning.retry')"
      />

      <template v-else>
        <p v-if="week.isEmptyWeek.value" class="text-center text-sm text-muted print:hidden">
          {{ $t('planning.empty.title') }} — {{ $t('planning.empty.description') }}
        </p>
        <p v-else class="hidden text-center text-xs text-dimmed lg:block print:hidden">
          {{ $t('planning.dnd.hint') }}
        </p>

        <div class="planning-grid grid grid-cols-1 gap-3 lg:grid-cols-7">
          <PlanningDayColumn
            v-for="day in week.days.value"
            :key="day.dateString"
            :day="day"
            :day-name="week.dayName(day.date)"
            :date-label="week.shortDate(day.date)"
            @add="openAddModal"
            @move="openMoveModal"
            @remove="askRemove"
            @drop="onDrop"
            @save-note="saveNote"
          />
        </div>
      </template>
    </div>

    <!-- Ajout d'un repas -->
    <PlanningAddMealModal
      :open="addModal.open"
      :date-string="addModal.dateString"
      :meal-type="addModal.mealType"
      :days="week.days.value"
      :initial-query="addModal.initialQuery"
      @close="addModal.open = false"
      @add-recipe="onAddRecipe"
      @add-custom="onAddCustom"
    />

    <!-- Déplacement (repli accessible du glisser-déposer) -->
    <PlanningMoveMealModal
      :open="moveModal.open"
      :meal="moveModal.meal"
      :days="week.days.value"
      @close="moveModal.open = false"
      @confirm="onMoveConfirm"
    />

    <!-- Confirmation de retrait -->
    <UModal
      :open="removeModal.open"
      :title="$t('planning.remove.title')"
      :description="removeModal.meal ? $t('planning.remove.message', {
        title: mealTitle(removeModal.meal, $t('planning.meal.untitled')),
        date: week.longDateString(removeModal.meal.dateString),
        slot: week.slotLabel(removeModal.meal.mealType)
      }) : undefined"
      @update:open="value => !value && (removeModal.open = false)"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="$t('planning.remove.cancel')" color="neutral" variant="ghost" @click="removeModal.open = false" />
          <UButton :label="$t('planning.remove.confirm')" color="error" icon="i-lucide-trash-2" :loading="removeModal.busy" @click="confirmRemove" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { MealType, PlanningMeal, RecipeSummary } from '#shared/types'
import type { NoteType } from '#shared/schemas/planning'
import { mealTitle, usePlanningWeek } from '~/composables/usePlanningWeek'
import { fromDateString, toDateString } from '~/utils/week'

const authStore = useAuthStore()
const route = useRoute()
const { t } = useI18n()
// `?week=AAAA-MM-JJ` : ouvre directement la semaine contenant cette date
const initialWeek = typeof route.query.week === 'string' ? fromDateString(route.query.week) : null
const week = usePlanningWeek(initialWeek ?? new Date())

const showLoginModal = ref(false)

// Planning de la semaine affichée : lecture directe sous RLS (store), rendue côté serveur
const { status, error, refresh } = await useAsyncData(
  'planning',
  () => week.store.loadWeek(week.currentWeek.value),
  { watch: [week.weekKey, () => authStore.isAuthenticated] }
)
const hasData = computed(() => week.store.loadedRange !== null)

// Après une connexion dans la page (ou un rechargement du store par le layout sur une
// autre semaine), s'assurer que la semaine affichée est bien chargée.
watch(
  () => [authStore.currentUser?.id, week.store.loadedRange?.from, week.store.loadedRange?.to] as const,
  ([userId]) => {
    if (userId) void week.store.ensureWeekLoaded(week.currentWeek.value)
  }
)

// --- Ajout ---
const addModal = reactive<{ open: boolean, dateString: string | null, mealType: MealType | null, initialQuery: string }>({
  open: false, dateString: null, mealType: null, initialQuery: ''
})

const openAddModal = (dateString: string, mealType: MealType, initialQuery = '') => {
  addModal.dateString = dateString
  addModal.mealType = mealType
  addModal.initialQuery = initialQuery
  addModal.open = true
}

const onAddRecipe = async (dateString: string, mealType: MealType, recipe: RecipeSummary, done: () => void) => {
  const ok = await week.addRecipe(dateString, mealType, recipe)
  done()
  if (ok) addModal.open = false
}

const onAddCustom = async (dateString: string, mealType: MealType, title: string, done: () => void) => {
  const ok = await week.addCustom(dateString, mealType, title)
  done()
  if (ok) addModal.open = false
}

// --- Déplacement ---
const moveModal = reactive<{ open: boolean, meal: PlanningMeal | null }>({ open: false, meal: null })

const openMoveModal = (meal: PlanningMeal) => {
  moveModal.meal = meal
  moveModal.open = true
}

const onMoveConfirm = async (meal: PlanningMeal, dateString: string, mealType: MealType, done: () => void) => {
  const ok = await week.move(meal, dateString, mealType)
  done()
  if (ok) moveModal.open = false
}

const onDrop = (mealId: string, dateString: string, mealType: MealType) => {
  const meal = week.store.findMeal(mealId)
  if (meal) void week.move(meal, dateString, mealType)
}

// --- Retrait ---
const removeModal = reactive<{ open: boolean, meal: PlanningMeal | null, busy: boolean }>({ open: false, meal: null, busy: false })

const askRemove = (meal: PlanningMeal) => {
  removeModal.meal = meal
  removeModal.busy = false
  removeModal.open = true
}

const confirmRemove = async () => {
  if (!removeModal.meal) return
  removeModal.busy = true
  await week.remove(removeModal.meal)
  removeModal.busy = false
  removeModal.open = false
}

// --- Notes ---
const saveNote = async (dateString: string, noteType: NoteType, content: string | null, done: () => void) => {
  await week.saveNote(dateString, noteType, content)
  done()
}

// --- Impression : la page elle-même, mise en forme par @media print ---
const print = () => {
  if (import.meta.client) window.print()
}

// `?addRecipe=1&recipeTitle=…` (lien depuis une recette) : ouvre l'ajout sur aujourd'hui, recherche pré-remplie
watch(() => route.query, (query) => {
  if (query.addRecipe && typeof query.recipeTitle === 'string') {
    week.goToToday()
    openAddModal(toDateString(new Date()), 'lunch', query.recipeTitle)
    void navigateTo({ path: '/planning', query: {} }, { replace: true })
  }
}, { immediate: true })

useHead({
  title: `${t('planning.title')} - Recettes des Boultons`,
  meta: [{ name: 'description', content: t('planning.subtitle') }]
})
</script>

<style>
/* Impression de la semaine : grille 7 colonnes, sans la navigation de l'application. */
@media print {
  @page {
    size: landscape;
    margin: 12mm;
  }

  body > #__nuxt header,
  body > #__nuxt footer,
  body > #__nuxt nav {
    display: none !important;
  }

  .planning-page .planning-grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.25rem;
  }

  .planning-page {
    font-size: 11px;
  }
}
</style>
