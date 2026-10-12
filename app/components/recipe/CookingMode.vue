<template>
  <div>
  <UModal v-model:open="modalOpen" fullscreen :close="false" :ui="{ content: 'bg-default' }">
    <template #content>
      <div class="flex h-full min-h-0 flex-col" data-cooking-mode @pointerdown="timers.alarm.unlock()" @keydown="timers.alarm.unlock()">
        <!-- En-tête -->
        <header class="flex items-center gap-3 border-b border-default px-4 py-3 sm:px-6">
          <div class="min-w-0 flex-1">
            <p class="truncate font-serif text-lg font-semibold text-highlighted sm:text-xl">
              {{ recipe?.title }}
            </p>
            <p class="text-sm text-muted tabular-nums">
              <template v-if="mode.stepCount.value > 0">
                {{ $t('recipeDetail.cooking.stepOf', { current: mode.currentIndex.value + 1, total: mode.stepCount.value }) }}
              </template>
              <template v-else>{{ $t('recipeDetail.cooking.title') }}</template>
            </p>
          </div>
          <UBadge v-if="mode.wakeLockActive.value" color="primary" variant="subtle" icon="i-lucide-sun" class="hidden sm:inline-flex">
            {{ $t('recipeDetail.cooking.wakeLockOn') }}
          </UBadge>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="lg"
            :aria-label="$t('recipeDetail.cooking.exit')"
            @click="requestClose"
          />
        </header>
        <UProgress :model-value="mode.progress.value" size="xs" class="rounded-none" />

        <!-- Étape courante + ingrédients de la section -->
        <div
          class="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-4 py-6 sm:px-6 lg:flex-row lg:gap-12 lg:px-12 lg:py-10"
          :style="timersPadding"
        >
          <section v-if="mode.current.value" class="flex-1 space-y-5" aria-live="polite">
            <p v-if="mode.current.value.sectionName.trim()" class="text-xs font-semibold uppercase tracking-wide text-primary">
              {{ mode.current.value.sectionName }}
            </p>
            <div class="flex items-start gap-4 sm:gap-6">
              <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-inverted tabular-nums sm:size-14 sm:text-2xl">
                {{ mode.current.value.stepNumber }}
              </span>
              <p class="text-2xl leading-relaxed text-highlighted whitespace-pre-line sm:text-3xl sm:leading-relaxed lg:text-4xl lg:leading-snug">
                {{ mode.current.value.content }}
              </p>
            </div>

            <!-- Durées de l'étape : lancer le minuteur à la main (il démarre aussi tout seul en passant à l'étape suivante). -->
            <div v-if="stepDurations.length > 0" class="flex flex-wrap gap-2 pl-16 sm:pl-20">
              <UButton
                v-for="duration in stepDurations"
                :key="duration.key"
                :icon="timers.isActive(duration.key) ? 'i-lucide-timer' : 'i-lucide-timer-reset'"
                color="neutral"
                variant="outline"
                size="md"
                :disabled="timers.isActive(duration.key)"
                :label="timers.isActive(duration.key)
                  ? $t('recipeDetail.cooking.timers.running', { duration: duration.label })
                  : $t('recipeDetail.cooking.timers.start', { duration: duration.label })"
                data-start-timer
                @click="startTimer(duration)"
              />
            </div>
          </section>
          <section v-else class="flex flex-1 items-center justify-center text-muted">
            {{ $t('recipeDetail.cooking.noSteps') }}
          </section>

          <aside v-if="ingredients.length > 0" class="shrink-0 space-y-3 border-t border-default pt-6 lg:w-80 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <h3 class="font-serif text-lg font-semibold text-highlighted">
              {{ $t('recipeDetail.cooking.ingredients') }}
              <span v-if="sectionName" class="block text-sm font-normal text-muted">{{ sectionName }}</span>
            </h3>
            <ul class="space-y-2 text-lg text-default">
              <li v-for="ingredient in ingredients" :key="ingredient.id" class="flex gap-2">
                <UIcon name="i-lucide-dot" class="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span v-if="amountLabel(ingredient, factor)" class="font-medium tabular-nums">{{ amountLabel(ingredient, factor) }}</span>{{ amountLabel(ingredient, factor) ? ' ' : '' }}{{ ingredient.name }}
                  <span v-if="ingredient.optional" class="text-sm text-muted">({{ $t('recipeDetail.ingredients.optional') }})</span>
                </span>
              </li>
            </ul>
          </aside>
        </div>

        <!-- Navigation -->
        <footer class="flex items-center justify-between gap-3 border-t border-default px-4 py-3 sm:px-6">
          <UButton
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="outline"
            size="xl"
            :label="$t('recipeDetail.cooking.prev')"
            :disabled="!mode.hasPrev.value"
            @click="mode.prev()"
          />
          <p class="hidden text-xs text-muted md:block">
            <UKbd value="arrowleft" /> <UKbd value="arrowright" /> · <UKbd value="escape" />
            <span class="ml-1">{{ $t('recipeDetail.cooking.keyboardHint') }}</span>
          </p>
          <UButton
            v-if="mode.hasNext.value"
            trailing-icon="i-lucide-chevron-right"
            size="xl"
            :label="$t('recipeDetail.cooking.next')"
            @click="mode.next()"
          />
          <UButton
            v-else
            icon="i-lucide-check"
            color="primary"
            size="xl"
            :label="$t('recipeDetail.cooking.finish')"
            @click="requestClose"
          />
        </footer>

        <RecipeCookingTimers :timers="timers" />
      </div>
    </template>
  </UModal>

  <!-- Sortie avec des minuteurs en cours : confirmation (Échap l'annule et laisse le mode cuisine ouvert). -->
  <UModal
    v-model:open="confirmLeave"
    :title="$t('recipeDetail.cooking.leave.title')"
    :description="$t('recipeDetail.cooking.leave.message', { count: timers.timers.value.length }, timers.timers.value.length)"
    :ui="{ footer: 'justify-end' }"
  >
    <template #footer>
      <UButton :label="$t('recipeDetail.cooking.leave.stay')" color="neutral" variant="ghost" @click="confirmLeave = false" />
      <UButton :label="$t('recipeDetail.cooking.leave.confirm')" color="error" icon="i-lucide-log-out" @click="leave" />
    </template>
  </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Recipe } from '#shared/types'
import { parseDurations, type StepDuration } from '#shared/utils/duration'
import { showTimerNotification } from '~/utils/cookingAlarm'

/**
 * Mode cuisine plein écran : une étape à la fois, ingrédients de la section,
 * navigation clavier (←/→/Échap) et Wake Lock via `useCookingMode`.
 *
 * Minuteurs : quand une étape contient une durée (`parseDurations`), passer à la
 * suivante lance son minuteur (le premier si plusieurs, une seule fois par étape) ;
 * un bouton permet de lancer chaque durée à la main. Les minuteurs flottent au-dessus
 * des étapes (`RecipeCookingTimers`) et vivent tant que le mode cuisine est ouvert :
 * le quitter avec des minuteurs demande confirmation.
 */
const props = withDefaults(defineProps<{
  recipe: Recipe | null
  factor?: number
}>(), {
  factor: 1
})

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const mode = useCookingMode(() => props.recipe)
const { amountLabel } = useIngredientLabel()

const timers = useCookingTimers({
  onRing: (timer) => {
    void showTimerNotification(
      t('recipeDetail.cooking.timers.notificationTitle'),
      t('recipeDetail.cooking.timers.notificationBody', {
        step: timer.stepNumber,
        duration: timer.durationLabel,
        recipe: props.recipe?.title ?? ''
      }),
      timer.id
    )
  }
})

// --- Fermeture : confirmation s'il reste des minuteurs -----------------------
const confirmLeave = ref(false)
const requestClose = () => {
  if (timers.hasTimers.value) confirmLeave.value = true
  else open.value = false
}
const leave = () => {
  confirmLeave.value = false
  timers.clearAll()
  open.value = false
}
// Échap, clic extérieur et boutons passent tous par ce setter.
const modalOpen = computed({
  get: () => open.value,
  set: (value) => {
    if (value) open.value = true
    else requestClose()
  }
})
watch(confirmLeave, (isOpen) => {
  mode.keysEnabled.value = !isOpen
})

// La modale et le composable partagent le même état d'ouverture.
watch(open, (isOpen) => {
  if (isOpen && !mode.isOpen.value) mode.open(0)
  if (!isOpen && mode.isOpen.value) mode.close()
  if (!isOpen) {
    timers.clearAll()
    autoStarted.clear()
    confirmLeave.value = false
  }
})
watch(mode.isOpen, (isOpen) => {
  open.value = isOpen
})

// --- Minuteurs liés aux étapes ----------------------------------------------
interface StepTimerOffer extends StepDuration {
  /** `<idÉtape>:<secondes>` : un seul minuteur par étape et par durée. */
  key: string
  stepNumber: number
}

const offersFor = (index: number): StepTimerOffer[] => {
  const step = mode.steps.value[index]
  if (!step) return []
  return parseDurations(step.content).map(duration => ({
    ...duration,
    key: `${step.id}:${duration.seconds}`,
    stepNumber: index + 1
  }))
}

const stepDurations = computed(() => offersFor(mode.currentIndex.value))

const startTimer = (offer: StepTimerOffer) => {
  timers.start({
    key: offer.key,
    stepNumber: offer.stepNumber,
    seconds: offer.seconds,
    durationLabel: offer.label
  })
}

// Étapes dont le minuteur a déjà été lancé automatiquement : revenir en arrière puis
// avancer à nouveau ne le relance pas (même après annulation).
const autoStarted = new Set<string>()

// Avancer d'une étape lance le minuteur de l'étape quittée (la première durée : les
// suivantes se lancent à la main, car les durées d'une même étape s'enchaînent).
watch(mode.currentIndex, (to, from) => {
  if (!open.value || to <= from) return
  const [first] = offersFor(from)
  if (!first || autoStarted.has(first.key)) return
  autoStarted.add(first.key)
  startTimer(first)
})

// Les minuteurs ne doivent pas être masqués par la pile : on réserve de la place sous le contenu.
const timersPadding = computed(() => {
  const count = timers.timers.value.length
  return count > 0 ? { paddingBottom: `${count * 5.5 + 2}rem` } : undefined
})

const ingredients = computed(() => mode.currentIngredientSection.value?.ingredients ?? [])
const sectionName = computed(() => {
  const section = mode.currentIngredientSection.value
  if (!section || section.id === mode.current.value?.sectionId) return ''
  return section.name.trim()
})
</script>
