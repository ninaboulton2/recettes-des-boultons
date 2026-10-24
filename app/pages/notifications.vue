<template>
  <div class="mx-auto max-w-3xl space-y-6" data-testid="notifications-page">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl">{{ $t('notifications.title') }}</h1>
        <p class="mt-2 text-muted">{{ $t('notifications.subtitle') }}</p>
      </div>
      <UButton
        v-if="unread > 0"
        color="neutral"
        variant="outline"
        icon="i-lucide-check-check"
        :label="$t('notifications.markAll')"
        :loading="busy === 'all'"
        :disabled="busy !== null"
        data-testid="notifications-mark-all"
        @click="markAll"
      />
    </header>

    <UAlert v-if="message" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="message" role="alert" data-testid="notifications-error" />

    <LoadingState v-if="status === 'pending' && items.length === 0" :message="$t('notifications.loading')" />

    <EmptyState v-else-if="views.length === 0" icon="i-lucide-bell" :title="$t('notifications.emptyTitle')" :message="$t('notifications.empty')" data-testid="notifications-empty" />

    <template v-else>
      <ul class="divide-y divide-default rounded-xl border border-default" data-testid="notifications-list">
        <li v-for="entry in views" :key="entry.notification.id" class="relative flex items-start gap-3 p-4" :class="entry.notification.read ? '' : 'bg-primary/5'" :data-read="entry.notification.read ? 'true' : 'false'" data-testid="notification">
          <UIcon :name="entry.view.icon" class="mt-0.5 size-5 shrink-0" :class="entry.notification.read ? 'text-dimmed' : 'text-primary'" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="text-sm" :class="entry.notification.read ? 'text-default' : 'font-medium text-highlighted'" data-testid="notification-text">
              <component
                :is="entry.view.to ? 'button' : 'span'"
                :type="entry.view.to ? 'button' : undefined"
                :class="entry.view.to ? 'text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary after:absolute after:inset-0' : ''"
                :data-testid="entry.view.to ? 'notification-open' : undefined"
                @click="entry.view.to ? open(entry) : undefined"
              >{{ $t(entry.view.key, entry.view.params) }}</component>
            </p>
            <p class="mt-0.5 text-xs text-muted">{{ relativeDate(entry.notification.createdAt) }}</p>
          </div>
          <span v-if="!entry.notification.read" class="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" :title="$t('notifications.unread')" role="img" :aria-label="$t('notifications.unread')" />
        </li>
      </ul>

      <div v-if="nextBefore" class="flex justify-center">
        <UButton color="neutral" variant="outline" :label="$t('notifications.more')" :loading="busy === 'more'" :disabled="busy !== null" data-testid="notifications-more" @click="loadMore" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NOTIFICATIONS_PAGE_SIZE } from '#shared/schemas/social'
import type { AppNotification } from '#shared/utils/social'
import { notificationView, unreadIds, type NotificationView } from '#shared/utils/socialUi'

/**
 * Notifications (v2) : liste paginée (`list_notifications`, 30 par page, « Voir plus »), texte lisible FR/EN par genre
 * (`notificationView`), lien vers la ressource, marquage à l'ouverture d'une notification et « Tout marquer comme lu »
 * (`mark_notifications_read`). La cloche se met à jour tout de suite (état partagé) ; pas de temps réel : relecture à la
 * navigation et au retour sur l'onglet. Un genre inconnu est masqué.
 */
definePageMeta({ middleware: 'v2-only' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { errorText } = useSocialError()
const api = useNotifications()
const { count, refresh: refreshBell } = useUnreadNotifications()

useHead({ title: () => t('notifications.title') })

const busy = ref<string | null>(null)
const message = ref<string | null>(null)

// La première page vient de `useAsyncData` (rendue côté serveur, reprise telle quelle par le navigateur) ; la liste affichée
// en est une copie locale, prolongée par « Voir plus » et mise à jour par le marquage.
const { data: firstPage, status, refresh } = await useAsyncData(
  'notifications-page',
  () => api.listNotifications({ limit: NOTIFICATIONS_PAGE_SIZE }),
  { default: () => ({ items: [] as AppNotification[], nextBefore: null as string | null }) }
)
const items = ref<AppNotification[]>(firstPage.value.items)
const nextBefore = ref<string | null>(firstPage.value.nextBefore)
watch(firstPage, (page) => {
  items.value = page.items
  nextBefore.value = page.nextBefore
})

const views = computed(() => items.value.flatMap((notification) => {
  const view = notificationView(notification)
  return view ? [{ notification, view }] : []
}))
const unread = computed(() => Math.max(count.value, unreadIds(items.value).length))

const relativeFormat = computed(() => new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }))
function relativeDate(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [['day', 86_400], ['hour', 3_600], ['minute', 60]]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relativeFormat.value.format(Math.round(seconds / size), unit)
  }
  return relativeFormat.value.format(0, 'second')
}

async function loadMore(): Promise<void> {
  if (!nextBefore.value) return
  busy.value = 'more'
  message.value = null
  try {
    const page = await api.listNotifications({ limit: NOTIFICATIONS_PAGE_SIZE, before: nextBefore.value })
    const known = new Set(items.value.map(item => item.id))
    items.value = [...items.value, ...page.items.filter(item => !known.has(item.id))]
    nextBefore.value = page.nextBefore
  } catch (cause) {
    message.value = errorText(cause)
  } finally {
    busy.value = null
  }
}

async function markAll(): Promise<void> {
  busy.value = 'all'
  message.value = null
  try {
    await api.markNotificationsRead({})
    items.value = items.value.map(item => ({ ...item, read: true }))
    await refreshBell()
  } catch (cause) {
    message.value = errorText(cause)
  } finally {
    busy.value = null
  }
}

/** Ouvrir une notification : la marquer comme lue (sans bloquer la navigation en cas d'échec), puis aller à la ressource. */
async function open(entry: { notification: AppNotification, view: NotificationView }): Promise<void> {
  const { notification, view } = entry
  if (!notification.read) {
    try {
      await api.markNotificationsRead({ ids: [notification.id] })
      items.value = items.value.map(item => (item.id === notification.id ? { ...item, read: true } : item))
      void refreshBell()
    } catch {
      // Le marquage est un confort : on ouvre quand même.
    }
  }
  if (view.to) await navigateTo(localePath(view.to))
}

// Pas de temps réel : relecture au retour sur l'onglet.
const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
onMounted(() => document.addEventListener('visibilitychange', onVisible))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))
</script>
