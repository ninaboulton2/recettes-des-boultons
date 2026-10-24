<template>
  <div class="mx-auto max-w-3xl space-y-10" data-testid="groups-page">
    <header>
      <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl">{{ $t('groups.title') }}</h1>
      <p class="mt-2 text-muted">{{ $t('groups.subtitle') }}</p>
    </header>

    <!-- Bannière « Explorer les recettes de X » : apparaît après avoir rejoint un groupe -->
    <PromptBanners />

    <UAlert v-if="message" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="message" role="alert" data-testid="groups-error" />
    <UAlert
      v-if="joinedGroup"
      color="success"
      variant="subtle"
      icon="i-lucide-circle-check"
      :title="$t('groups.joined.title', { group: joinedGroup })"
      :description="$t('groups.joined.description')"
      data-testid="groups-joined"
    />

    <!-- Invitations reçues -->
    <section v-if="received.length > 0" class="space-y-3" aria-labelledby="groups-invitations-title" data-testid="groups-invitations">
      <h2 id="groups-invitations-title" class="font-serif text-xl font-semibold text-highlighted">{{ $t('groups.invitations.title') }}</h2>
      <p class="text-sm text-muted">{{ $t('groups.invitations.nothingAdded') }}</p>
      <ul class="divide-y divide-default rounded-xl border border-default">
        <li v-for="invitation in received" :key="invitation.invitationId" class="flex flex-wrap items-center gap-3 p-3" data-testid="group-invitation">
          <UIcon name="i-lucide-mail-plus" class="size-5 shrink-0 text-primary" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-highlighted">{{ invitation.groupName }}</p>
            <p class="text-xs text-muted">{{ $t('groups.invitations.from', { name: invitation.displayName ?? $t('prompts.someone') }) }}</p>
          </div>
          <div class="flex gap-2">
            <UButton size="sm" icon="i-lucide-check" :label="$t('groups.invitations.accept')" :loading="busy === invitation.invitationId + ':accept'" :disabled="busy !== null" data-testid="group-invitation-accept" @click="respond(invitation, true)" />
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-x" :label="$t('groups.invitations.decline')" :loading="busy === invitation.invitationId + ':decline'" :disabled="busy !== null" data-testid="group-invitation-decline" @click="respond(invitation, false)" />
          </div>
        </li>
      </ul>
    </section>

    <!-- Créer -->
    <section class="space-y-3" aria-labelledby="groups-create-title">
      <h2 id="groups-create-title" class="font-serif text-xl font-semibold text-highlighted">{{ $t('groups.create.title') }}</h2>
      <form class="flex flex-col gap-3 sm:flex-row sm:items-end" novalidate @submit.prevent="create">
        <div class="flex-1 space-y-1.5">
          <label for="group-create-name" class="block text-sm font-medium text-default">{{ $t('groups.create.label') }}</label>
          <UInput id="group-create-name" v-model="newName" maxlength="60" class="w-full" :placeholder="$t('groups.create.placeholder')" data-testid="group-create-name" />
        </div>
        <UButton type="submit" icon="i-lucide-plus" :label="$t('groups.create.submit')" :loading="busy === 'create'" :disabled="busy !== null || newName.trim() === ''" data-testid="group-create-submit" />
      </form>
    </section>

    <!-- Mes groupes -->
    <section class="space-y-3" aria-labelledby="groups-list-title">
      <h2 id="groups-list-title" class="font-serif text-xl font-semibold text-highlighted">{{ $t('groups.list.title') }}</h2>
      <EmptyState v-if="groups.length === 0" icon="i-lucide-users-round" :title="$t('groups.list.emptyTitle')" :message="$t('groups.list.empty')" data-testid="groups-empty" />
      <ul v-else class="grid gap-3 sm:grid-cols-2" data-testid="groups-list">
        <li v-for="group in groups" :key="group.groupId">
          <NuxtLink
            :to="localePath(`/groupes/${group.groupId}`)"
            class="flex h-full items-center gap-3 rounded-xl border border-default p-4 transition hover:border-accented focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            data-testid="group-card"
          >
            <UIcon name="i-lucide-users-round" class="size-6 shrink-0 text-primary" aria-hidden="true" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-semibold text-highlighted">{{ group.name }}</span>
              <span class="block text-xs text-muted">
                {{ $t('groups.list.members', { n: group.memberCount }, group.memberCount) }}
                · {{ group.isCreator ? $t('groups.role.creator') : $t('groups.role.member') }}
              </span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { GroupInvitation, MyGroup } from '#shared/utils/social'

/**
 * Groupes (v2) : mes groupes, « Créer un groupe », invitations reçues à accepter ou refuser. Rejoindre un groupe n'ajoute
 * AUCUNE recette au carnet (clarification du 2026-10-24) : on le dit, puis la bannière « Explorer les recettes de X »
 * (`pending_prompts`) propose d'aller voir. Les droits (créateur seulement) sont décidés en base.
 */
definePageMeta({ middleware: 'v2-only' })

const { t } = useI18n()
const localePath = useLocalePath()
const { $toast } = useNuxtApp()
const { errorText } = useSocialError()
const api = useGroups()
const themeStore = useThemeStore()
const { refresh: refreshBell } = useUnreadNotifications()

useHead({ title: () => t('groups.title') })

const { data, refresh } = await useAsyncData('groups-page', async () => {
  const [groups, invitations] = await Promise.all([api.listMyGroups(), api.listGroupInvitations()])
  return { groups, invitations }
}, { default: () => ({ groups: [] as MyGroup[], invitations: [] as GroupInvitation[] }) })

const groups = computed(() => data.value.groups)
const received = computed(() => data.value.invitations.filter(invitation => invitation.direction === 'received'))

const busy = ref<string | null>(null)
const message = ref<string | null>(null)
const joinedGroup = ref<string | null>(null)
const newName = ref('')

async function create(): Promise<void> {
  busy.value = 'create'
  message.value = null
  try {
    const groupId = await api.createGroup({ name: newName.value })
    newName.value = ''
    await themeStore.loadGroupThemes(true)
    $toast.success(t('groups.toast.created'))
    await navigateTo(localePath(`/groupes/${groupId}`))
  } catch (cause) {
    message.value = errorText(cause)
  } finally {
    busy.value = null
  }
}

async function respond(invitation: GroupInvitation, accept: boolean): Promise<void> {
  busy.value = `${invitation.invitationId}:${accept ? 'accept' : 'decline'}`
  message.value = null
  joinedGroup.value = null
  try {
    await api.respondGroupInvitation({ invitationId: invitation.invitationId, accept })
    await refresh()
    void refreshBell()
    if (accept) {
      joinedGroup.value = invitation.groupName
      await themeStore.loadGroupThemes(true)
      // La bannière « Explorer les recettes de X » vient d'apparaître côté base : on la relit.
      await refreshNuxtData('pending-prompts')
    } else {
      $toast.success(t('groups.toast.declined'))
    }
  } catch (cause) {
    message.value = errorText(cause)
  } finally {
    busy.value = null
  }
}
</script>
