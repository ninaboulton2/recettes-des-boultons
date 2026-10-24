<template>
  <section class="space-y-3 rounded-xl border border-default p-4" data-testid="support-ai">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="font-semibold text-highlighted">{{ $t('support.ai.title') }}</h2>
      <UBadge v-if="info" :color="blocked ? 'warning' : 'success'" variant="soft" data-testid="support-ai-badge">
        {{ blocked ? $t('ai.unavailable.title') : $t('support.ai.stateOk') }}
      </UBadge>
    </div>
    <p v-if="loadFailed" class="text-sm text-muted">{{ $t('support.ai.error') }}</p>
    <template v-else-if="info">
      <p v-if="info.creditExhausted" class="text-sm text-default" data-testid="support-ai-state">{{ $t('support.ai.stateExhausted', { since: sinceLabel }) }}</p>
      <p v-else-if="info.budgetExceeded" class="text-sm text-default" data-testid="support-ai-state">{{ $t('support.ai.stateBudget') }}</p>
      <p v-if="info.monthCalls !== null" class="text-xs text-muted" data-testid="support-ai-month">
        {{ $t('support.ai.month', { calls: info.monthCalls, cost: (info.monthCostUsd ?? 0).toFixed(2) }) }}
      </p>
      <div v-if="info.creditExhausted" class="flex flex-wrap items-center gap-3">
        <UButton icon="i-lucide-power" :label="$t('support.ai.reactivate')" :loading="busy" data-testid="support-ai-reactivate" @click="reactivate" />
        <p class="text-xs text-muted">{{ $t('support.ai.reactivateHint') }}</p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Écran support : état de l'IA et bouton « Réactiver l'IA » (phase 7). Lit `ai_service_status` (les totaux du mois ne sont
 * rendus qu'au support) et appelle `support_reset_ai_credit` (refusée par la base à tout autre compte, 42501).
 */
interface ServiceInfo { creditExhausted: boolean, since: string | null, budgetExceeded: boolean, monthCalls: number | null, monthCostUsd: number | null }

const { t, locale } = useI18n()
const toast = useToast()
const supabase = useSupabaseClient() as unknown as SupabaseClient

const info = ref<ServiceInfo | null>(null)
const loadFailed = ref(false)
const busy = ref(false)

const blocked = computed(() => !!info.value && (info.value.creditExhausted || info.value.budgetExceeded))
const sinceLabel = computed(() => (info.value?.since
  ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(info.value.since))
  : ''))

async function load(): Promise<void> {
  const { data, error } = await supabase.rpc('ai_service_status', { p_budget_calls: 0, p_budget_usd: 0 })
  if (error || !data) {
    loadFailed.value = true
    return
  }
  loadFailed.value = false
  const raw = data as Record<string, unknown>
  info.value = {
    creditExhausted: raw.credit_exhausted === true,
    since: typeof raw.since === 'string' ? raw.since : null,
    budgetExceeded: raw.budget_exceeded === true,
    monthCalls: typeof raw.month_calls === 'number' ? raw.month_calls : null,
    monthCostUsd: typeof raw.month_cost_usd === 'number' ? raw.month_cost_usd : null
  }
}

async function reactivate(): Promise<void> {
  busy.value = true
  try {
    const { data, error } = await supabase.rpc('support_reset_ai_credit')
    if (error) throw error
    toast.add({ title: data === true ? t('support.ai.reactivated') : t('support.ai.nothingToDo'), color: 'success', icon: 'i-lucide-check' })
    await load()
  } catch {
    toast.add({ title: t('errors.generic'), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = false
  }
}

onMounted(() => { void load() })
</script>
