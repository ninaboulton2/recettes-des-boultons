<template>
  <UChip :show="count > 0" :text="countLabel" size="2xl" color="error" inset>
    <UButton
      :to="localePath('/notifications')"
      color="neutral"
      variant="ghost"
      icon="i-lucide-bell"
      :aria-label="ariaLabel"
      data-testid="notification-bell"
    />
  </UChip>
</template>

<script setup lang="ts">
/**
 * Cloche de notifications (v2) : compteur (`unread_notifications_count`, 0023) ; le bouton mène à `/notifications`.
 * Compteur relu à l'ouverture, à chaque navigation, au retour sur l'onglet et toutes les 60 secondes (pas de temps réel).
 * L'état est partagé avec la page des notifications (`useUnreadNotifications`) : marquer comme lu met la cloche à jour.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { count, refresh } = useUnreadNotifications()

const countLabel = computed(() => (count.value > 99 ? '99+' : String(count.value)))
const ariaLabel = computed(() => count.value > 0 ? t('notifications.bellUnread', count.value) : t('notifications.bell'))

let timer: ReturnType<typeof setInterval> | undefined
const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
onMounted(() => {
  void refresh()
  timer = setInterval(() => { void refresh() }, 60_000)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
})
onUnmounted(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('focus', onVisible)
})
watch(() => route.fullPath, () => { void refresh() })
</script>
