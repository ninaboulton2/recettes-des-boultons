import { AI_CODES, formatResetsAt, isServiceWide, type AiStatus } from '#shared/utils/aiStatus'

/**
 * État de l'IA pour la personne connectée (v2, phase 7) : `GET /api/ai/status`. Sert à désactiver les boutons IA et à dire
 * POURQUOI : `credit` / `budget` (service coupé pour tous, même message) ou `quota` (plafond du jour de ce compte, avec l'heure
 * de remise à zéro). Sans v2, ou si la requête échoue, l'IA est considérée disponible (le serveur reste le juge).
 */
export function useAiStatus() {
  const v2 = useV2()
  const { t, locale } = useI18n()
  const authStore = useAuthStore()

  const status = useState<AiStatus | null>('ai-status', () => null)
  const loading = ref(false)

  async function refresh(): Promise<void> {
    if (!v2 || !authStore.isAuthenticated) return
    loading.value = true
    try {
      status.value = await $fetch<AiStatus>('/api/ai/status', { credentials: 'same-origin' })
    } catch {
      status.value = null
    } finally {
      loading.value = false
    }
  }

  /** Après une erreur du serveur portant un code IA : met à jour l'état sans attendre la prochaine lecture. */
  function noteError(code: string | undefined): void {
    if (code === AI_CODES.unavailable || code === AI_CODES.quotaReached) void refresh()
  }

  const blocked = computed(() => status.value?.available === false)
  const serviceWide = computed(() => isServiceWide(status.value?.reason ?? null))
  const resetsAtLabel = computed(() => (status.value?.quota ? formatResetsAt(status.value.quota.resetsAt, locale.value) : ''))
  const title = computed(() => {
    if (!status.value || status.value.available) return ''
    return serviceWide.value ? t('ai.unavailable.title') : t('ai.quota.title')
  })
  const message = computed(() => {
    const current = status.value
    if (!current || current.available) return ''
    if (isServiceWide(current.reason)) return t('ai.unavailable.message')
    return t('ai.quota.message', { quota: current.quota?.quota ?? 0, time: resetsAtLabel.value })
  })
  const remainingLabel = computed(() => {
    const quota = status.value?.quota
    if (!quota || !status.value?.available) return ''
    return t('ai.quota.remaining', { remaining: quota.remaining, quota: quota.quota }, quota.remaining)
  })

  return { status, loading, refresh, noteError, blocked, serviceWide, title, message, remainingLabel, resetsAtLabel }
}
