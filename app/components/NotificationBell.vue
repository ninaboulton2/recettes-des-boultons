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
 * Cloche de notifications (v2) : seulement le compteur (`unread_notifications_count`, 0023). La liste détaillée
 * (demandes d'amis, invitations, recettes partagées) relève de la phase 6C : le bouton mène à `/notifications`,
 * dont l'emplacement est déjà posé. Compteur relu à l'ouverture, à chaque navigation et toutes les 60 secondes.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { unreadNotificationsCount } = useNotifications()

const count = ref(0)
const countLabel = computed(() => (count.value > 99 ? '99+' : String(count.value)))
const ariaLabel = computed(() => count.value > 0 ? t('notifications.bellUnread', count.value) : t('notifications.bell'))

async function refresh(): Promise<void> {
  try {
    count.value = await unreadNotificationsCount()
  } catch {
    // Compteur indisponible (hors ligne, base v1) : la cloche reste sans pastille.
  }
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void refresh()
  timer = setInterval(() => { void refresh() }, 60_000)
})
onUnmounted(() => clearInterval(timer))
watch(() => route.fullPath, () => { void refresh() })
</script>
