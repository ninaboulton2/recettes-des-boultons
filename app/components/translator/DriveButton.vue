<template>
  <!-- Masqué tant que la config Google (3 variables publiques) est incomplète. -->
  <div v-if="enabled" class="flex flex-wrap items-center gap-3">
    <UButton
      color="neutral"
      variant="outline"
      icon="i-lucide-hard-drive-download"
      :loading="loading"
      :disabled="disabled"
      :aria-busy="loading"
      :label="loading ? $t('translator.drive.loading') : $t('translator.drive.button')"
      @click="importFile"
    />
    <p class="text-sm text-muted">{{ $t('translator.drive.hint') }}</p>
    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
  </div>
</template>

<script setup lang="ts">
import { RECIPE_FILE_MAX_BYTES } from '#shared/schemas/media'
import { useGoogleDrivePicker } from '~/composables/useGoogleDrivePicker'

/**
 * Bouton « Importer depuis Google Drive » du traducteur. Le fichier choisi est
 * remis tel quel au flux « fichier » existant (`add`, comme un dépôt) ; une
 * erreur remonte sous forme de message traduit (`error`), `null` au départ
 * d'un nouvel essai.
 */
defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  add: [files: File[]]
  error: [message: string | null]
}>()

const { t } = useI18n()
const { enabled, loading, error, pick } = useGoogleDrivePicker()

const maxMb = Math.round(RECIPE_FILE_MAX_BYTES / (1024 * 1024))
const announcement = ref('')

async function importFile(): Promise<void> {
  emit('error', null)
  announcement.value = t('translator.drive.opening')
  const file = await pick()
  if (file) {
    announcement.value = t('translator.drive.imported', { name: file.name })
    emit('add', [file])
  } else if (error.value) {
    const message = t(`translator.drive.errors.${error.value.code}`, { name: error.value.fileName ?? '', max: maxMb })
    announcement.value = ''
    emit('error', message)
  } else {
    announcement.value = ''
  }
}
</script>
