<template>
  <UModal
    :open="open"
    :title="$t('report.title')"
    :description="$t('report.description')"
    :ui="{ footer: 'justify-end' }"
    @update:open="onUpdateOpen"
  >
    <template #body>
      <form v-if="!sent" id="report-form" class="space-y-5" novalidate @submit.prevent="submit">
        <fieldset class="space-y-2">
          <legend class="text-sm font-medium text-default">{{ $t('report.reason') }}</legend>
          <label v-for="value in REPORT_REASONS" :key="value" class="flex cursor-pointer items-start gap-2 rounded-lg border border-default p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input v-model="reason" type="radio" name="report-reason" :value="value" class="mt-0.5" :data-testid="`report-reason-${value}`">
            <span>
              <span class="block font-medium text-highlighted">{{ $t(`report.reasons.${value}.label`) }}</span>
              <span class="block text-muted">{{ $t(`report.reasons.${value}.hint`) }}</span>
            </span>
          </label>
        </fieldset>
        <div class="space-y-1.5">
          <label for="report-details" class="block text-sm font-medium text-default">{{ $t('report.details') }}</label>
          <UTextarea id="report-details" v-model="details" :rows="4" :maxlength="REPORT_DETAILS_MAX" class="w-full" :placeholder="$t('report.detailsPlaceholder')" data-testid="report-details" />
          <p class="text-right text-xs text-muted" data-testid="report-counter">{{ details.length }} / {{ REPORT_DETAILS_MAX }}</p>
        </div>
        <p v-if="error" class="text-sm text-error" role="alert" data-testid="report-error">{{ error }}</p>
      </form>
      <div v-else class="flex items-start gap-3" role="status" data-testid="report-sent">
        <UIcon name="i-lucide-circle-check" class="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        <p class="text-sm text-default">{{ $t('report.sent') }}</p>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" :label="sent ? $t('ui.common.close') : $t('ui.common.cancel')" data-testid="report-cancel" @click="emit('update:open', false)" />
      <UButton v-if="!sent" type="submit" form="report-form" icon="i-lucide-flag" :label="$t('report.submit')" :loading="busy" :disabled="reason === null" data-testid="report-submit" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { REPORT_DETAILS_MAX, REPORT_REASONS, type ReportReason } from '#shared/schemas/reports'
import { REPORT_DAILY_LIMIT, reportErrorKey } from '#shared/utils/reports'

/**
 * Fenêtre « Signaler » : motif (contenu illicite, droit d'auteur, spam, autre) et détails facultatifs (2000 caractères).
 *  - `recipeId` : recette lisible (fiche) → insertion dans `reports` ;
 *  - `shareToken` : lien public → RPC `report_shared_recipe` (0027).
 * Échap ou « Annuler » ferment. La limite de 10 signalements par jour (54000) est annoncée en clair.
 */
const props = defineProps<{ open: boolean, recipeId?: string, shareToken?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { t } = useI18n()
const { createReport, reportSharedRecipe } = useReports()

const reason = ref<ReportReason | null>(null)
const details = ref('')
const busy = ref(false)
const error = ref('')
const sent = ref(false)

// Toujours rouvrir sur un formulaire vierge
watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  reason.value = null
  details.value = ''
  error.value = ''
  sent.value = false
})

const onUpdateOpen = (value: boolean) => emit('update:open', value)

async function submit(): Promise<void> {
  if (reason.value === null || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const payload = { reason: reason.value, details: details.value }
    if (props.shareToken) await reportSharedRecipe({ token: props.shareToken, ...payload })
    else if (props.recipeId) await createReport({ recipeId: props.recipeId, ...payload })
    else throw new Error('Aucune recette à signaler')
    sent.value = true
  } catch (cause) {
    const key = reportErrorKey(cause)
    error.value = key === 'errors.report.rate' ? t(key, { n: REPORT_DAILY_LIMIT }) : t(key)
  } finally {
    busy.value = false
  }
}
</script>
