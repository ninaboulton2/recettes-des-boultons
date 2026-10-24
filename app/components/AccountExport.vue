<template>
  <section class="space-y-4" aria-labelledby="export-heading" data-testid="settings-export">
    <h2 id="export-heading" class="font-serif text-xl font-semibold text-highlighted">{{ $t('settings.export.title') }}</h2>
    <div class="space-y-3 rounded-xl border border-default p-4 md:p-5">
      <p class="text-sm text-muted">{{ $t('settings.export.description') }}</p>
      <p class="text-sm text-muted">{{ $t('settings.export.note', { n: EXPORT_DAILY_LIMIT }) }}</p>
      <div class="flex flex-wrap items-center gap-3">
        <UButton icon="i-lucide-download" :label="$t('settings.export.button')" :loading="busy" data-testid="export-button" @click="download" />
        <p v-if="error" class="text-sm text-error" role="alert" data-testid="export-error">{{ error }}</p>
        <p v-else-if="done" class="text-sm text-success" role="status" data-testid="export-done">{{ $t('settings.export.done') }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { EXPORT_DAILY_LIMIT, buildExportFile, exportErrorKey } from '#shared/utils/account'
import { downloadTextFile } from '~/utils/download'

/**
 * « Télécharger mes données » : appelle la RPC `export_my_data` (3 par jour, 54000) et télécharge un JSON lisible.
 * Le fichier est fabriqué dans le navigateur, rien n'est conservé côté serveur.
 */
const { t } = useI18n()
const { exportMyData } = useAccount()

const busy = ref(false)
const error = ref('')
const done = ref(false)

async function download(): Promise<void> {
  busy.value = true
  error.value = ''
  done.value = false
  try {
    const data = await exportMyData()
    downloadTextFile(buildExportFile(data))
    done.value = true
  } catch (cause) {
    const key = exportErrorKey(cause)
    error.value = key === 'settings.export.errors.rate' ? t(key, { n: EXPORT_DAILY_LIMIT }) : t(key)
  } finally {
    busy.value = false
  }
}
</script>
