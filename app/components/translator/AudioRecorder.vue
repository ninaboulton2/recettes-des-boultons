<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-3">
      <template v-if="status === 'recording'">
        <span
          class="flex items-center gap-2 text-sm font-medium tabular-nums text-highlighted"
          role="timer"
          :aria-label="$t('translator.audio.timer')"
        >
          <span class="size-2.5 animate-pulse rounded-full bg-error" aria-hidden="true" />
          {{ formatElapsed(elapsed) }} / {{ formatElapsed(maxSeconds) }}
        </span>
        <UButton
          color="error"
          icon="i-lucide-square"
          :label="$t('translator.audio.stop')"
          @click="stop"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :label="$t('translator.audio.cancel')"
          @click="cancel"
        />
      </template>
      <UButton
        v-else
        color="neutral"
        variant="outline"
        icon="i-lucide-mic"
        :loading="status === 'requesting' || transcribing"
        :disabled="disabled || !supported"
        :label="transcribing ? $t('translator.audio.transcribing') : $t('translator.audio.start')"
        @click="start"
      />
      <p v-if="status === 'idle' && !transcribing && supported" class="text-sm text-muted">
        {{ $t('translator.audio.hint', { minutes: maxMinutes }) }}
      </p>
    </div>

    <!-- Annonce des changements d'état pour les lecteurs d'écran (le chronomètre n'est pas annoncé). -->
    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>

    <UAlert
      v-if="!supported"
      color="warning"
      variant="subtle"
      icon="i-lucide-mic-off"
      :description="$t('translator.audio.errors.unsupported')"
    />
    <UAlert
      v-else-if="errorCode"
      color="error"
      variant="subtle"
      icon="i-lucide-mic-off"
      :description="errorMessage"
    />
  </div>
</template>

<script setup lang="ts">
import { formatElapsed, useAudioRecorder, type RecordedAudio } from '~/composables/useAudioRecorder'

/**
 * Dictaphone du traducteur : démarrer / arrêter, durée écoulée, arrêt
 * automatique à 5 minutes. À l'arrêt, remonte l'enregistrement (`recorded`) ;
 * l'envoi et la transcription sont gérés par `useTranslator().transcribe`.
 */
defineProps<{
  disabled?: boolean
  /** Transcription en cours côté serveur (bouton en chargement). */
  transcribing?: boolean
}>()

const emit = defineEmits<{
  recorded: [audio: RecordedAudio]
}>()

const { t } = useI18n()

const { supported, status, elapsed, errorCode, reachedLimit, maxSeconds, start, stop, cancel } =
  useAudioRecorder(audio => emit('recorded', audio))

const maxMinutes = Math.round(maxSeconds / 60)

const errorMessage = computed(() => (errorCode.value ? t(`translator.audio.errors.${errorCode.value}`) : ''))

const announcement = ref('')
watch(status, (now, before) => {
  if (now === 'recording') {
    announcement.value = t('translator.audio.announce.started')
  } else if (before === 'recording' && now === 'idle') {
    announcement.value = reachedLimit.value ? t('translator.audio.announce.limit') : t('translator.audio.announce.stopped')
  }
})
</script>
