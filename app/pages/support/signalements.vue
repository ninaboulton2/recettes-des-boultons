<template>
  <div class="mx-auto max-w-3xl space-y-6" data-testid="support-reports">
    <header>
      <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl">{{ $t('support.title') }}</h1>
      <p class="mt-2 text-muted">{{ $t('support.subtitle') }}</p>
    </header>

    <!-- Phase 7 : état de l'IA et bouton « Réactiver l'IA » -->
    <SupportAiStatus />

    <LoadingState v-if="status === 'pending' && !reports.length" :message="$t('ui.common.loading')" />
    <ErrorState v-else-if="error" :message="$t('errors.generic')" :retry-action="() => refresh()" :title="$t('support.loadError')" :retry-text="$t('recipes.loadError.retry')" />
    <EmptyState v-else-if="reports.length === 0" icon="i-lucide-flag-off" :title="$t('support.empty.title')" :message="$t('support.empty.description')" data-testid="support-empty" />

    <ul v-else class="space-y-4">
      <li v-for="report in reports" :key="report.id" class="space-y-3 rounded-xl border border-default p-4" :data-testid="`support-report-${report.id}`">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge :color="report.status === 'open' ? 'warning' : 'neutral'" variant="soft" data-testid="support-status">{{ $t(`support.status.${report.status}`) }}</UBadge>
          <UBadge color="neutral" variant="outline" data-testid="support-reason">{{ $t(`report.reasons.${report.reason}.label`) }}</UBadge>
          <time class="text-xs text-muted" :datetime="report.createdAt">{{ formatDate(report.createdAt) }}</time>
        </div>

        <p class="font-medium text-highlighted" data-testid="support-recipe-title">
          <template v-if="report.recipeId">{{ report.recipeTitle ?? $t('support.recipeUnreadable') }}</template>
          <template v-else>{{ $t('support.recipeDeleted') }}</template>
        </p>
        <p v-if="report.details" class="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm text-default" data-testid="support-details">{{ report.details }}</p>

        <div class="flex flex-wrap items-center gap-2">
          <UButton v-if="report.recipeId" :to="localePath(`/recettes/${report.recipeId}`)" color="neutral" variant="outline" size="sm" icon="i-lucide-external-link" :label="$t('support.open')" data-testid="support-open" />
          <UButton v-for="action in supportActions(report.status)" :key="action" color="neutral" variant="soft" size="sm" :label="$t(`support.actions.${action}`)" :loading="busyId === report.id" :disabled="busyId !== null" :data-testid="`support-${action}`" @click="setStatus(report, action)" />
          <UButton v-if="report.recipeId" color="error" variant="outline" size="sm" icon="i-lucide-trash-2" :label="$t('support.delete')" :disabled="busyId !== null" data-testid="support-delete" @click="askDelete(report)" />
        </div>
      </li>
    </ul>

    <ConfirmDialog
      v-model:open="deleteOpen"
      :title="$t('support.deleteConfirm.title')"
      :description="$t('support.deleteConfirm.description', { title: toDelete?.recipeTitle ?? '' })"
      :confirm-label="$t('support.deleteConfirm.confirm')"
      :loading="busyId !== null"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { supportActions, sortSupportReports, type SupportAction, type SupportReport } from '#shared/utils/reports'

/**
 * Écran du support (Nina) : signalements ouverts et examinés. Passer à « examiné », « traité » ou « rejeté », ouvrir la recette
 * (lisible par le support tant que le signalement est ouvert ou examiné, 0019) ou la supprimer (politique de suppression
 * du support, v2/0020). Réservé au rôle support/admin (middleware `v2-support`) ; la base décide (RLS).
 */
definePageMeta({ middleware: 'v2-support' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const { listOpenReports, setReportStatus, deleteReportedRecipe } = useReports()

useHead({ title: () => t('support.title'), meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const { data, status, error, refresh } = await useAsyncData<SupportReport[]>('support-reports', async () => sortSupportReports(await listOpenReports()), { default: () => [] })
const reports = computed(() => data.value ?? [])

const formatDate = (iso: string) => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

const busyId = ref<string | null>(null)

async function setStatus(report: SupportReport, action: SupportAction): Promise<void> {
  busyId.value = report.id
  try {
    await setReportStatus({ reportId: report.id, status: action })
    toast.add({ title: t('support.updated'), color: 'success', icon: 'i-lucide-check' })
    await refresh()
  } catch {
    toast.add({ title: t('errors.generic'), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busyId.value = null
  }
}

const deleteOpen = ref(false)
const toDelete = ref<SupportReport | null>(null)
function askDelete(report: SupportReport): void {
  toDelete.value = report
  deleteOpen.value = true
}

async function confirmDelete(): Promise<void> {
  const report = toDelete.value
  if (!report?.recipeId) return
  busyId.value = report.id
  try {
    // « traité » d'abord, tant que le signalement est encore relié à la recette ; puis la recette
    await setReportStatus({ reportId: report.id, status: 'actioned' })
    await deleteReportedRecipe(report.recipeId)
    deleteOpen.value = false
    toast.add({ title: t('support.deleted'), color: 'success', icon: 'i-lucide-check' })
    await refresh()
  } catch {
    toast.add({ title: t('errors.generic'), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busyId.value = null
  }
}
</script>
