<template>
  <div class="mx-auto max-w-3xl">
    <div class="mb-6">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-arrow-left"
        :label="$t('translationsAdmin.back')"
        @click="goBack"
      />
    </div>

    <header class="mb-8 text-center">
      <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl">{{ $t('translationsAdmin.title') }}</h1>
      <p class="mx-auto mt-3 max-w-2xl text-muted">{{ $t('translationsAdmin.subtitle') }}</p>
    </header>

    <LoadingState v-if="loading && !status" :message="$t('recipes.detail.loading')" />

    <ErrorState
      v-else-if="error && !status"
      :message="error"
      :retry-action="() => load()"
      :title="$t('translationsAdmin.errors.load')"
      :retry-text="$t('translationsAdmin.retry')"
    />

    <div v-else-if="status" class="space-y-6">
      <!-- Compteurs -->
      <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="translations-counts">
        <div v-for="item in counters" :key="item.key" class="rounded-xl border border-default bg-default p-4 text-center">
          <dt class="text-xs uppercase tracking-wide text-muted">{{ item.label }}</dt>
          <dd class="mt-1 font-serif text-3xl font-semibold text-highlighted" :data-testid="`translations-count-${item.key}`">{{ item.value }}</dd>
        </div>
      </dl>

      <UProgress :model-value="progressPercent" :aria-label="$t('translationsAdmin.counts.translated')" />

      <!-- Actions -->
      <div class="flex flex-wrap items-center gap-3">
        <UButton
          v-if="!running"
          size="lg"
          icon="i-lucide-languages"
          data-testid="translations-start"
          :disabled="pendingCount === 0"
          :label="processed > 0 && pendingCount > 0 ? $t('translationsAdmin.resume') : $t('translationsAdmin.start')"
          @click="run"
        />
        <UButton
          v-else
          size="lg"
          color="neutral"
          variant="outline"
          icon="i-lucide-square"
          data-testid="translations-stop"
          :disabled="stopRequested"
          :label="$t('translationsAdmin.stop')"
          @click="stop"
        />
        <p v-if="running" class="text-sm text-muted" role="status" aria-live="polite">
          {{ stopRequested ? $t('translationsAdmin.stopping') : $t('translationsAdmin.running') }}
          · {{ $t('translationsAdmin.progress', { done: processed }) }}
        </p>
        <p v-else-if="processed > 0" class="text-sm text-muted" role="status" aria-live="polite">
          {{ $t('translationsAdmin.progress', { done: processed }) }}
        </p>
        <p v-if="pendingCount === 0 && !running" class="text-sm text-success" data-testid="translations-done">
          {{ finished ? $t('translationsAdmin.finished') : $t('translationsAdmin.nothing') }}
        </p>
      </div>

      <UAlert
        v-if="stopped"
        color="warning"
        variant="subtle"
        icon="i-lucide-circle-alert"
        data-testid="translations-stopped"
        :description="$t('translationsAdmin.errors.stopped', { message: stopped })"
      />

      <UAlert
        v-if="failed.length > 0"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        data-testid="translations-failed"
        :title="$t('translationsAdmin.errors.failedRecipes')"
      >
        <template #description>
          <ul class="mt-1 list-disc pl-5">
            <li v-for="entry in failed" :key="entry.id">{{ entry.title }}<span v-if="entry.message"> — {{ entry.message }}</span></li>
          </ul>
        </template>
      </UAlert>

      <!-- Journal de l'exécution -->
      <ul v-if="log.length > 0" class="divide-y divide-default rounded-xl border border-default text-sm" data-testid="translations-log">
        <li v-for="entry in log" :key="entry.id + entry.status" class="flex items-baseline justify-between gap-3 px-4 py-2">
          <NuxtLink :to="localePath(`/recettes/${entry.id}`)" class="truncate font-medium text-highlighted hover:underline">{{ entry.title }}</NuxtLink>
          <span class="shrink-0 text-muted" :class="entry.status === 'failed' && 'text-error'">{{ logLabel(entry) }}</span>
        </li>
      </ul>

      <!-- Coût -->
      <section class="space-y-1 rounded-xl border border-default bg-muted p-4 text-sm text-default" data-testid="translations-costs">
        <h2 class="font-semibold text-highlighted">{{ $t('translationsAdmin.costs.title') }}</h2>
        <p>{{ $t('translationsAdmin.costs.spent', { cost: usd(status.costUsd), calls: status.calls, failed: status.failedCalls }) }}</p>
        <p>{{ $t('translationsAdmin.costs.remaining', { cost: usd(status.estimatedRemainingUsd), average: usd(status.averageCostUsd) }) }}</p>
        <p class="text-muted">{{ $t('translationsAdmin.costs.model', { model: status.model, provider: status.provider }) }}</p>
        <p class="text-muted">{{ $t('translationsAdmin.costs.quota', { quota: status.dailyQuota }) }}</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TranslationLogEntry } from '~/composables/useTranslationsAdmin'

/**
 * Page /traductions (administrateurs) : état des traductions des recettes et
 * traduction des recettes manquantes (voir `useTranslationsAdmin`). La garde
 * `requiresAdmin` n'est qu'un confort d'affichage : le serveur revérifie.
 */
definePageMeta({ requiresAdmin: true })

const { t, locale } = useI18n()
const router = useRouter()
const localePath = useLocalePath()

useHead({
  title: () => t('translationsAdmin.title'),
  meta: [{ name: 'description', content: () => t('translationsAdmin.subtitle') }]
})

const { status, loading, running, stopRequested, processed, log, failed, stopped, error, finished, pendingCount, progressPercent, load, run, stop }
  = useTranslationsAdmin()

onMounted(() => { void load() })

const counters = computed(() => [
  { key: 'total', label: t('translationsAdmin.counts.total'), value: status.value?.total ?? 0 },
  { key: 'translated', label: t('translationsAdmin.counts.translated'), value: status.value?.translated ?? 0 },
  { key: 'stale', label: t('translationsAdmin.counts.stale'), value: status.value?.stale ?? 0 },
  { key: 'missing', label: t('translationsAdmin.counts.missing'), value: status.value?.missing ?? 0 }
])

/** Montant en dollars avec la décimale utile (≈ 0,0025 $ par recette). */
const usd = (value: number) => value.toLocaleString(locale.value === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: value < 1 ? 4 : 2 })

function logLabel(entry: TranslationLogEntry): string {
  if (entry.status === 'translated') return t('translationsAdmin.log.translated', { lang: entry.lang === 'en' ? 'EN → FR' : 'FR → EN' })
  if (entry.status === 'unchanged') return t('translationsAdmin.log.unchanged')
  return t('translationsAdmin.log.failed', { message: entry.message ?? '' })
}

function goBack(): void {
  if (window.history.length > 1) router.back()
  else void navigateTo(localePath('/recettes'))
}
</script>
