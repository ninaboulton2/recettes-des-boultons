<template>
  <div>
    <!-- Annonces pour lecteurs d'écran : toujours présentes pour être lues au changement de texte. -->
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ startedText }}</p>
    <p class="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{{ endedText }}</p>

    <!-- Pile de minuteurs : en bas de l'écran sur mobile, à droite (au-dessus de la navigation) sur grand écran. -->
    <ul
      v-if="timers.timers.value.length > 0"
      class="pointer-events-none fixed inset-x-3 bottom-24 z-10 m-0 flex list-none flex-col gap-2 p-0 sm:left-auto sm:right-4 sm:w-80 lg:right-6"
      :aria-label="$t('recipeDetail.cooking.timers.region')"
      data-cooking-timers
    >
      <li
        v-for="timer in timers.timers.value"
        :key="timer.id"
        class="pointer-events-auto rounded-xl border bg-elevated p-3 shadow-lg"
        :class="timer.status === 'ringing'
          ? 'timer-ringing border-error bg-error/10 ring-2 ring-error'
          : 'border-default'"
        :data-status="timer.status"
        data-cooking-timer
      >
        <div class="flex items-center justify-between gap-2">
          <p class="min-w-0 truncate text-sm font-medium text-muted">
            <UIcon
              :name="timer.status === 'ringing' ? 'i-lucide-bell-ring' : 'i-lucide-timer'"
              class="mr-1 inline size-4 align-text-bottom"
              :class="timer.status === 'ringing' ? 'text-error' : 'text-primary'"
              aria-hidden="true"
            />{{ $t('recipeDetail.cooking.timers.label', { step: timer.stepNumber, duration: timer.durationLabel }) }}
          </p>
          <UBadge v-if="timer.status === 'paused'" color="neutral" variant="subtle" size="sm">
            {{ $t('recipeDetail.cooking.timers.paused') }}
          </UBadge>
        </div>

        <div class="mt-1 flex items-center justify-between gap-2">
          <p
            class="text-3xl font-bold tabular-nums leading-none"
            :class="timer.status === 'ringing' ? 'text-error' : 'text-highlighted'"
            data-timer-clock
          >
            <template v-if="timer.status === 'ringing'">{{ $t('recipeDetail.cooking.timers.ended') }}</template>
            <template v-else>{{ timer.clock }}</template>
          </p>

          <div class="flex shrink-0 items-center gap-1">
            <UButton
              v-if="timer.status !== 'ringing'"
              :icon="timer.status === 'paused' ? 'i-lucide-play' : 'i-lucide-pause'"
              color="neutral"
              variant="outline"
              size="lg"
              :aria-label="timer.status === 'paused'
                ? $t('recipeDetail.cooking.timers.resume', { step: timer.stepNumber })
                : $t('recipeDetail.cooking.timers.pause', { step: timer.stepNumber })"
              @click="timer.status === 'paused' ? timers.resume(timer.id) : timers.pause(timer.id)"
            />
            <UButton
              color="neutral"
              variant="outline"
              size="lg"
              :label="$t('recipeDetail.cooking.timers.addMinute')"
              :aria-label="$t('recipeDetail.cooking.timers.addMinuteAria', { step: timer.stepNumber })"
              @click="timers.addMinute(timer.id)"
            />
            <UButton
              v-if="timer.status === 'ringing'"
              color="error"
              size="lg"
              icon="i-lucide-bell-off"
              :label="$t('recipeDetail.cooking.timers.dismiss')"
              :aria-label="$t('recipeDetail.cooking.timers.dismissAria', { step: timer.stepNumber })"
              @click="timers.remove(timer.id)"
            />
            <UButton
              v-else
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="lg"
              :aria-label="$t('recipeDetail.cooking.timers.cancel', { step: timer.stepNumber })"
              @click="timers.remove(timer.id)"
            />
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * Pile flottante des minuteurs du mode cuisine (compacte, reste visible quand on
 * avance dans les étapes). Le décompte et les états viennent de `useCookingTimers`.
 * Surbrillance d'une alarme : bordure + fond d'erreur, halo pulsé uniquement si
 * l'utilisateur n'a pas demandé de mouvement réduit.
 */
const props = defineProps<{
  timers: ReturnType<typeof useCookingTimers>
}>()

const { t } = useI18n()

const startedText = computed(() => {
  const announcement = props.timers.startedAnnouncement.value
  return announcement
    ? t('recipeDetail.cooking.timers.announceStarted', { step: announcement.stepNumber, duration: announcement.durationLabel })
    : ''
})
const endedText = computed(() => {
  const announcement = props.timers.endedAnnouncement.value
  return announcement
    ? t('recipeDetail.cooking.timers.announceEnded', { step: announcement.stepNumber, duration: announcement.durationLabel })
    : ''
})
</script>

<style scoped>
/* Pulsation d'une alarme : halo seulement (le contenu reste lisible), et rien si le mouvement réduit est demandé. */
@media (prefers-reduced-motion: no-preference) {
  .timer-ringing {
    animation: timer-ring 1.2s ease-in-out infinite;
  }
}

@keyframes timer-ring {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in oklab, var(--ui-error) 55%, transparent);
  }
  50% {
    box-shadow: 0 0 0 10px transparent;
  }
}
</style>
