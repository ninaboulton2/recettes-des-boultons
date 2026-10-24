<template>
  <div class="mx-auto max-w-3xl space-y-10" data-testid="friends-page">
    <header>
      <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl">{{ $t('friends.title') }}</h1>
      <p class="mt-2 text-muted">{{ $t('friends.subtitle') }}</p>
    </header>

    <UAlert v-if="message" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="message" data-testid="friends-error" role="alert" />

    <!-- Demandes reçues -->
    <section v-if="incoming.length > 0" class="space-y-3" aria-labelledby="friends-incoming-title" data-testid="friends-incoming">
      <h2 id="friends-incoming-title" class="font-serif text-xl font-semibold text-highlighted">{{ $t('friends.incoming.title') }}</h2>
      <ul class="divide-y divide-default rounded-xl border border-default">
        <li v-for="request in incoming" :key="request.friendshipId" class="flex flex-wrap items-center gap-3 p-3" data-testid="friend-request-in">
          <UIcon name="i-lucide-user-plus" class="size-5 shrink-0 text-primary" aria-hidden="true" />
          <NuxtLink :to="localePath(`/personnes/${request.userId}`)" class="min-w-0 flex-1 truncate font-medium text-highlighted hover:text-primary">{{ nameOf(request.displayName) }}</NuxtLink>
          <div class="flex gap-2">
            <UButton size="sm" icon="i-lucide-check" :label="$t('friends.incoming.accept')" :loading="busy === request.friendshipId + ':accept'" :disabled="busy !== null" data-testid="friend-accept" @click="respond(request, true)" />
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-x" :label="$t('friends.incoming.decline')" :loading="busy === request.friendshipId + ':decline'" :disabled="busy !== null" data-testid="friend-decline" @click="respond(request, false)" />
          </div>
        </li>
      </ul>
    </section>

    <!-- Chercher -->
    <section class="space-y-3" aria-labelledby="friends-search-title">
      <h2 id="friends-search-title" class="font-serif text-xl font-semibold text-highlighted">{{ $t('friends.search.title') }}</h2>
      <UserSearch :label="$t('friends.search.label')">
        <template #action="{ user }">
          <span v-if="statusOf(user.id) === 'friends'" class="text-sm text-muted" data-testid="search-status">{{ $t('friends.search.alreadyFriend') }}</span>
          <span v-else-if="statusOf(user.id) === 'sent'" class="text-sm text-muted" data-testid="search-status">{{ $t('friends.search.requestSent') }}</span>
          <UButton
            v-else-if="statusOf(user.id) === 'received'"
            size="sm"
            icon="i-lucide-check"
            :label="$t('friends.incoming.accept')"
            :loading="busy === user.id"
            :disabled="busy !== null"
            @click="acceptFrom(user.id)"
          />
          <UButton
            v-else
            size="sm"
            icon="i-lucide-user-plus"
            :label="$t('friends.search.ask')"
            :loading="busy === user.id"
            :disabled="busy !== null"
            data-testid="friend-ask"
            @click="ask(user.id)"
          />
        </template>
      </UserSearch>
    </section>

    <!-- Mes amis -->
    <section class="space-y-3" aria-labelledby="friends-list-title">
      <h2 id="friends-list-title" class="font-serif text-xl font-semibold text-highlighted">{{ $t('friends.list.title') }}</h2>
      <EmptyState v-if="friends.length === 0" icon="i-lucide-users" :title="$t('friends.list.emptyTitle')" :message="$t('friends.list.empty')" data-testid="friends-empty" />
      <ul v-else class="divide-y divide-default rounded-xl border border-default" data-testid="friends-list">
        <li v-for="friend in friends" :key="friend.userId" class="flex flex-wrap items-center gap-3 p-3" data-testid="friend-row">
          <UIcon name="i-lucide-user-round" class="size-5 shrink-0 text-dimmed" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <NuxtLink :to="localePath(`/personnes/${friend.userId}`)" class="block truncate font-medium text-highlighted hover:text-primary" data-testid="friend-profile-link">{{ nameOf(friend.displayName) }}</NuxtLink>
            <p v-if="friend.cookbookTitle" class="truncate text-xs text-muted">{{ friend.cookbookTitle }}</p>
          </div>
          <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-user-minus" :label="$t('friends.list.remove')" data-testid="friend-remove" @click="toRemove = friend" />
        </li>
      </ul>
    </section>

    <!-- Demandes envoyées -->
    <section v-if="outgoing.length > 0" class="space-y-3" aria-labelledby="friends-outgoing-title" data-testid="friends-outgoing">
      <h2 id="friends-outgoing-title" class="font-serif text-xl font-semibold text-highlighted">{{ $t('friends.outgoing.title') }}</h2>
      <ul class="divide-y divide-default rounded-xl border border-default">
        <li v-for="request in outgoing" :key="request.friendshipId" class="flex flex-wrap items-center gap-3 p-3" data-testid="friend-request-out">
          <UIcon name="i-lucide-send" class="size-5 shrink-0 text-dimmed" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <NuxtLink :to="localePath(`/personnes/${request.userId}`)" class="block truncate font-medium text-highlighted hover:text-primary">{{ nameOf(request.displayName) }}</NuxtLink>
            <p class="text-xs text-muted" data-testid="request-state">
              <template v-if="request.status === 'pending'">{{ $t('friends.outgoing.pending') }}</template>
              <template v-else-if="canRetryRequest(request)">{{ $t('friends.outgoing.declinedRetry') }}</template>
              <template v-else>{{ $t('friends.outgoing.declinedWait', { date: formatDate(request.retryAfter) }) }}</template>
            </p>
          </div>
          <UButton
            v-if="request.status === 'pending'"
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-undo-2"
            :label="$t('friends.outgoing.cancel')"
            :loading="busy === request.friendshipId + ':cancel'"
            :disabled="busy !== null"
            data-testid="friend-cancel"
            @click="cancel(request)"
          />
          <UButton
            v-else
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-rotate-cw"
            :label="$t('friends.outgoing.resend')"
            :disabled="busy !== null || !canRetryRequest(request)"
            data-testid="friend-resend"
            @click="ask(request.userId)"
          />
        </li>
      </ul>
    </section>

    <ConfirmDialog
      :open="toRemove !== null"
      :title="$t('friends.remove.title', { name: nameOf(toRemove?.displayName ?? null) })"
      :description="$t('friends.remove.description')"
      :confirm-label="$t('friends.remove.confirm')"
      :loading="busy === 'remove'"
      @update:open="value => { if (!value) toRemove = null }"
      @confirm="remove"
    />
  </div>
</template>

<script setup lang="ts">
import { canRetryRequest } from '#shared/utils/socialUi'
import type { Friend, FriendRequest } from '#shared/utils/social'

/**
 * Amis (v2) : mes amis (profil, retrait confirmé), demandes reçues (accepter / refuser) et envoyées (annuler, relancer
 * après un refus : 7 jours), recherche par pseudonyme (≥ 3 lettres) et « Demander en ami ». Règles et limites (20 demandes
 * par jour) appliquées en base ; ici seulement des messages clairs (`useSocialError`).
 */
definePageMeta({ middleware: 'v2-only' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { $toast } = useNuxtApp()
const { errorText } = useSocialError()
const api = useFriends()
const { refresh: refreshBell } = useUnreadNotifications()

useHead({ title: () => t('friends.title') })

const { data, refresh } = await useAsyncData('friends-page', async () => {
  const [friends, requests] = await Promise.all([api.listFriends(), api.listFriendRequests()])
  return { friends, requests }
}, { default: () => ({ friends: [] as Friend[], requests: [] as FriendRequest[] }) })

const friends = computed(() => data.value.friends)
const incoming = computed(() => data.value.requests.filter(request => request.direction === 'incoming'))
const outgoing = computed(() => data.value.requests.filter(request => request.direction === 'outgoing'))

const nameOf = (name: string | null) => name ?? t('prompts.someone')
const formatDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(iso)) : '')

/** Relation avec une personne trouvée par la recherche. */
function statusOf(userId: string): 'friends' | 'sent' | 'received' | 'none' {
  if (friends.value.some(friend => friend.userId === userId)) return 'friends'
  const request = data.value.requests.find(candidate => candidate.userId === userId)
  if (request?.direction === 'incoming') return 'received'
  if (request?.direction === 'outgoing' && request.status === 'pending') return 'sent'
  return 'none'
}

const busy = ref<string | null>(null)
const message = ref<string | null>(null)

async function run(key: string, action: () => Promise<void>): Promise<void> {
  busy.value = key
  message.value = null
  try {
    await action()
    await refresh()
    void refreshBell()
  } catch (cause) {
    message.value = errorText(cause)
  } finally {
    busy.value = null
  }
}

const ask = (userId: string) => run(userId, async () => {
  await api.sendFriendRequest({ userId })
  $toast.success(t('friends.toast.requested'))
})

const respond = (request: FriendRequest, accept: boolean) => run(`${request.friendshipId}:${accept ? 'accept' : 'decline'}`, async () => {
  await api.respondFriendRequest({ friendshipId: request.friendshipId, accept })
  $toast.success(t(accept ? 'friends.toast.accepted' : 'friends.toast.declined'))
})

const acceptFrom = (userId: string) => {
  const request = incoming.value.find(candidate => candidate.userId === userId)
  return request ? respond(request, true) : Promise.resolve()
}

const cancel = (request: FriendRequest) => run(`${request.friendshipId}:cancel`, async () => {
  await api.cancelFriendRequest({ friendshipId: request.friendshipId })
  $toast.success(t('friends.toast.cancelled'))
})

const toRemove = ref<Friend | null>(null)
async function remove(): Promise<void> {
  const target = toRemove.value
  if (!target) return
  await run('remove', async () => {
    await api.removeFriend({ userId: target.userId })
    $toast.success(t('friends.toast.removed'))
  })
  toRemove.value = null
}
</script>
