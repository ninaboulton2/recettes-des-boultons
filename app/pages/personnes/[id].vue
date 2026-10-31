<template>
  <div class="mx-auto max-w-2xl space-y-6" data-testid="person-page">
    <LoadingState v-if="pending && !profile" :message="$t('person.loading')" />

    <!-- Inconnue, invisible ou lien erroné : même page neutre, sans rien révéler -->
    <EmptyState v-else-if="!profile" icon="i-lucide-user-x" :title="$t('person.notFound.title')" :message="$t('person.notFound.description')" data-testid="person-not-found">
      <template #action>
        <UButton :to="localePath('/amis')" color="neutral" variant="outline" :label="$t('person.notFound.action')" />
      </template>
    </EmptyState>

    <template v-else>
      <header class="flex items-start gap-4">
        <div class="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <UIcon name="i-lucide-user-round" class="size-7 text-primary" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <h1 class="truncate font-serif text-3xl font-semibold text-highlighted" data-testid="person-name">{{ name }}</h1>
          <p v-if="cookbookTitle" class="text-muted" data-testid="person-cookbook">{{ cookbookTitle }}</p>
          <p v-if="profile.isSelf" class="mt-1 text-sm text-muted">{{ $t('person.itsYou') }}</p>
        </div>
      </header>

      <UAlert v-if="message" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="message" role="alert" data-testid="person-error" />

      <!-- Amitié -->
      <section v-if="action !== 'none'" class="space-y-3 rounded-xl border border-default p-4" aria-labelledby="person-friendship-title" data-testid="person-friendship">
        <h2 id="person-friendship-title" class="font-semibold text-highlighted">{{ $t('person.friendship.title') }}</h2>
        <p class="text-sm text-muted" data-testid="person-friend-status">{{ $t(`person.friendship.status.${profile.friendshipStatus}`) }}</p>
        <div class="flex flex-wrap gap-2">
          <UButton v-if="action === 'send' || action === 'resend'" icon="i-lucide-user-plus" :label="$t(action === 'send' ? 'person.friendship.ask' : 'person.friendship.askAgain')" :loading="busy" data-testid="person-ask" @click="ask" />
          <UButton v-if="action === 'cancel'" color="neutral" variant="outline" icon="i-lucide-undo-2" :label="$t('friends.outgoing.cancel')" :loading="busy" data-testid="person-cancel" @click="cancel" />
          <template v-if="action === 'respond'">
            <UButton icon="i-lucide-check" :label="$t('friends.incoming.accept')" :loading="busy" data-testid="person-accept" @click="respond(true)" />
            <UButton color="neutral" variant="outline" icon="i-lucide-x" :label="$t('friends.incoming.decline')" :disabled="busy" @click="respond(false)" />
          </template>
          <UButton v-if="action === 'remove'" color="neutral" variant="outline" icon="i-lucide-user-minus" :label="$t('friends.list.remove')" data-testid="person-remove" @click="confirmRemove = true" />
        </div>
      </section>

      <!-- Groupes en commun -->
      <section v-if="!profile.isSelf" class="space-y-2" aria-labelledby="person-groups-title">
        <h2 id="person-groups-title" class="font-semibold text-highlighted">{{ $t('person.groups.title') }}</h2>
        <p v-if="profile.commonGroups.length === 0" class="text-sm text-muted" data-testid="person-no-groups">{{ $t('person.groups.none') }}</p>
        <ul v-else class="flex flex-wrap gap-2" data-testid="person-groups">
          <li v-for="group in profile.commonGroups" :key="group.id">
            <UButton :to="localePath(`/groupes/${group.id}`)" size="sm" color="neutral" variant="outline" icon="i-lucide-users-round" :label="group.name" />
          </li>
        </ul>
      </section>

      <!-- Ses recettes -->
      <section v-if="!profile.isSelf" class="space-y-2" aria-labelledby="person-recipes-title">
        <h2 id="person-recipes-title" class="font-semibold text-highlighted">{{ $t('person.recipes.title') }}</h2>
        <p class="text-sm text-muted">{{ $t('person.recipes.count', { n: profile.readableRecipeCount }, profile.readableRecipeCount) }}</p>
        <UButton :to="localePath(`/explorer/${profile.userId}`)" icon="i-lucide-compass" :label="$t('person.recipes.link')" data-testid="person-recipes-link" />
      </section>
      <section v-else class="text-sm">
        <UButton :to="localePath('/recettes')" color="neutral" variant="outline" icon="i-lucide-book-open" :label="$t('navigation.myCookbook')" />
      </section>

      <ConfirmDialog
        v-model:open="confirmRemove"
        :title="$t('friends.remove.title', { name })"
        :description="$t('friends.remove.description')"
        :confirm-label="$t('friends.remove.confirm')"
        :loading="busy"
        @confirm="remove"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { localizedCookbookTitle } from '#shared/utils/cookbookTitle'
import { uuidSchema } from '#shared/schemas/common'
import { profileFriendAction } from '#shared/utils/socialUi'

/**
 * Profil d'une personne (v2, `/personnes/[id]`) : pseudonyme, titre du carnet, groupes en commun, statut d'amitié et
 * action correspondante (`get_user_profile`), lien « Ses recettes » vers Explorer (`/explorer/[authorId]`, qui renvoie ici).
 * Une personne qui ne m'est pas déjà visible donne une page neutre : la base ne renvoie aucune ligne.
 */
definePageMeta({ middleware: 'v2-only' })

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { $toast } = useNuxtApp()
const { errorText } = useSocialError()
const api = useFriends()
const { refresh: refreshBell } = useUnreadNotifications()

const userId = computed(() => {
  const value = route.params.id
  const id = Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
  return uuidSchema.safeParse(id).success ? id : null
})

const { data: profile, pending, refresh } = await useAsyncData(
  () => `person:${userId.value}`,
  async () => (userId.value ? await api.getUserProfile({ userId: userId.value }).catch(() => null) : null),
  { watch: [userId], default: () => null }
)

/** Titre du carnet dans la langue de l'interface (traduction si elle existe, sinon l'original). */
const cookbookTitle = computed(() => (profile.value ? localizedCookbookTitle(profile.value.cookbookTitle, profile.value.cookbookTitleI18n, locale.value) : null))
const name = computed(() => profile.value?.displayName ?? t('prompts.someone'))
const action = computed(() => (profile.value ? profileFriendAction(profile.value.friendshipStatus, profile.value.isSelf) : 'none'))

const busy = ref(false)
const message = ref<string | null>(null)
const confirmRemove = ref(false)

async function run(task: () => Promise<void>): Promise<void> {
  busy.value = true
  message.value = null
  try {
    await task()
    await refresh()
    void refreshBell()
  } catch (cause) {
    message.value = errorText(cause)
  } finally {
    busy.value = false
  }
}

const ask = () => run(async () => {
  await api.sendFriendRequest({ userId: userId.value! })
  $toast.success(t('friends.toast.requested'))
})
const cancel = () => run(async () => {
  if (profile.value?.friendshipId) await api.cancelFriendRequest({ friendshipId: profile.value.friendshipId })
  $toast.success(t('friends.toast.cancelled'))
})
const respond = (accept: boolean) => run(async () => {
  if (profile.value?.friendshipId) await api.respondFriendRequest({ friendshipId: profile.value.friendshipId, accept })
  $toast.success(t(accept ? 'friends.toast.accepted' : 'friends.toast.declined'))
})
/** Retirer un ami : sans amitié (ni groupe) la personne ne m'est plus visible : retour à la liste des amis. */
async function remove(): Promise<void> {
  let removed = false
  await run(async () => {
    await api.removeFriend({ userId: userId.value! })
    removed = true
    $toast.success(t('friends.toast.removed'))
  })
  confirmRemove.value = false
  if (removed) await navigateTo(localePath('/amis'))
}

useHead({ title: () => name.value, meta: [{ name: 'robots', content: 'noindex' }] })
</script>
