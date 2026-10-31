<template>
  <div class="mx-auto max-w-3xl space-y-8" data-testid="group-page">
    <div>
      <UButton :to="localePath('/groupes')" variant="link" color="neutral" icon="i-lucide-arrow-left" size="sm" class="-ml-2" :label="$t('groups.back')" />
    </div>

    <LoadingState v-if="pending && !group" :message="$t('groups.loading')" />

    <!-- Groupe inconnu, ou dont je ne suis pas membre : même page neutre -->
    <EmptyState v-else-if="!group" icon="i-lucide-users-round" :title="$t('groups.notFound.title')" :message="$t('groups.notFound.description')" data-testid="group-not-found">
      <template #action>
        <UButton :to="localePath('/groupes')" color="neutral" variant="outline" :label="$t('groups.notFound.action')" />
      </template>
    </EmptyState>

    <template v-else>
      <PromptBanners />

      <header class="space-y-2">
        <p class="text-sm font-medium uppercase tracking-wide text-primary" data-testid="group-role">{{ rights.canDelete ? $t('groups.role.creator') : $t('groups.role.member') }}</p>
        <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl" data-testid="group-name">{{ group.name }}</h1>
        <p class="text-muted">
          {{ $t('groups.list.members', { n: group.memberCount }, group.memberCount) }}
          <template v-if="group.creatorName"> · {{ $t('groups.page.createdBy', { name: group.creatorName }) }}</template>
        </p>
      </header>

      <UAlert v-if="message" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="message" role="alert" data-testid="group-error" />

      <!-- Membres -->
      <section class="space-y-3" aria-labelledby="group-members-title">
        <h2 id="group-members-title" class="font-serif text-xl font-semibold text-highlighted">{{ $t('groups.members.title') }}</h2>
        <ul class="divide-y divide-default rounded-xl border border-default" data-testid="group-members">
          <li v-for="member in members" :key="member.userId" class="flex flex-wrap items-center gap-3 p-3" data-testid="group-member">
            <UIcon :name="member.role === 'creator' ? 'i-lucide-crown' : 'i-lucide-user'" class="size-5 shrink-0" :class="member.role === 'creator' ? 'text-primary' : 'text-dimmed'" aria-hidden="true" />
            <NuxtLink :to="localePath(member.userId === meId ? '/reglages' : `/personnes/${member.userId}`)" class="min-w-0 flex-1 truncate font-medium text-highlighted hover:text-primary" data-testid="member-link">
              {{ member.displayName ?? $t('prompts.someone') }}
              <span v-if="member.userId === meId" class="font-normal text-muted"> ({{ $t('groups.members.you') }})</span>
            </NuxtLink>
            <UBadge v-if="member.role === 'creator'" :label="$t('groups.role.creator')" variant="soft" />
            <template v-if="memberRights(rights.canDelete, meId, member).canRemove">
              <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-crown" :label="$t('groups.members.transfer')" data-testid="member-transfer" @click="toTransfer = member" />
              <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-user-round-x" :label="$t('groups.members.remove')" data-testid="member-remove" @click="toRemove = member" />
            </template>
          </li>
        </ul>
      </section>

      <!-- Thème -->
      <section class="space-y-3" aria-labelledby="group-theme-title" data-testid="group-theme">
        <h2 id="group-theme-title" class="font-serif text-xl font-semibold text-highlighted">{{ $t('groups.theme.title') }}</h2>
        <p class="text-sm text-muted">{{ rights.canEditTheme ? $t('groups.theme.creatorHelp') : $t('groups.theme.memberHelp') }}</p>

        <template v-if="rights.canEditTheme">
          <ThemePicker v-model="theme" mode="group" />
          <div class="flex flex-wrap items-center justify-end gap-3">
            <p v-if="themeMessage" class="text-sm text-error" role="alert">{{ themeMessage }}</p>
            <UButton :loading="busy === 'theme'" :disabled="busy !== null || !theme" :label="$t('groups.theme.save')" data-testid="group-theme-save" @click="saveTheme" />
          </div>
        </template>

        <div class="flex flex-wrap items-center gap-3 rounded-xl border border-default bg-muted/40 p-3">
          <p v-if="isActiveTheme" class="flex-1 text-sm font-medium text-default" data-testid="group-theme-active">
            <UIcon name="i-lucide-check-circle-2" class="mr-1 inline size-4 align-text-bottom text-primary" aria-hidden="true" />
            {{ $t('groups.theme.active') }}
          </p>
          <p v-else-if="!groupThemeUsable" class="flex-1 text-sm text-muted">{{ $t('groups.theme.none') }}</p>
          <p v-else class="flex-1 text-sm text-muted">{{ $t('groups.theme.useHelp') }}</p>
          <UButton v-if="!isActiveTheme" icon="i-lucide-palette" :label="$t('groups.theme.use')" :disabled="!groupThemeUsable || busy !== null" :loading="busy === 'use'" data-testid="group-theme-use" @click="useTheme(group.groupId)" />
          <UButton v-else color="neutral" variant="outline" icon="i-lucide-undo-2" :label="$t('groups.theme.useMine')" :loading="busy === 'use'" :disabled="busy !== null" data-testid="group-theme-mine" @click="useTheme(null)" />
        </div>
      </section>

      <!-- Inviter (créateur) -->
      <section v-if="rights.canInvite" class="space-y-4" aria-labelledby="group-invite-title" data-testid="group-invite">
        <h2 id="group-invite-title" class="font-serif text-xl font-semibold text-highlighted">{{ $t('groups.invite.title') }}</h2>
        <p class="text-sm text-muted">{{ $t('groups.invite.help') }}</p>

        <div v-if="invitableFriends.length > 0" class="space-y-2">
          <h3 class="text-sm font-medium text-default">{{ $t('groups.invite.friends') }}</h3>
          <ul class="divide-y divide-default rounded-lg border border-default">
            <li v-for="friend in invitableFriends" :key="friend.userId" class="flex items-center gap-3 p-3" data-testid="invite-friend">
              <span class="min-w-0 flex-1 truncate font-medium text-highlighted">{{ friend.displayName ?? $t('prompts.someone') }}</span>
              <UButton size="sm" icon="i-lucide-mail-plus" :label="$t('groups.invite.send')" :loading="busy === 'invite:' + friend.userId" :disabled="busy !== null" data-testid="invite-friend-send" @click="invite(friend.userId)" />
            </li>
          </ul>
        </div>

        <UserSearch :label="$t('groups.invite.search')">
          <template #action="{ user }">
            <span v-if="isMember(user.id)" class="text-sm text-muted">{{ $t('groups.invite.alreadyMember') }}</span>
            <span v-else-if="isInvited(user.id)" class="text-sm text-muted">{{ $t('groups.invite.alreadyInvited') }}</span>
            <UButton v-else size="sm" icon="i-lucide-mail-plus" :label="$t('groups.invite.send')" :loading="busy === 'invite:' + user.id" :disabled="busy !== null" data-testid="invite-search-send" @click="invite(user.id)" />
          </template>
        </UserSearch>

        <!-- Invitations en attente (personnes) -->
        <div v-if="pendingPeople.length > 0" class="space-y-2">
          <h3 class="text-sm font-medium text-default">{{ $t('groups.invite.pending') }}</h3>
          <ul class="divide-y divide-default rounded-lg border border-default" data-testid="invite-pending">
            <li v-for="invitation in pendingPeople" :key="invitation.invitationId" class="flex items-center gap-3 p-3">
              <span class="min-w-0 flex-1 truncate">{{ invitation.displayName ?? $t('prompts.someone') }}</span>
              <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-x" :label="$t('groups.invite.cancel')" :loading="busy === 'cancel:' + invitation.invitationId" :disabled="busy !== null" data-testid="invite-cancel" @click="cancelInvitation(invitation)" />
            </li>
          </ul>
        </div>
      </section>

      <!-- Lien d'invitation (créateur) -->
      <section v-if="rights.canCreateLink" class="space-y-3" aria-labelledby="group-link-title" data-testid="group-link">
        <h2 id="group-link-title" class="font-serif text-xl font-semibold text-highlighted">{{ $t('groups.link.title') }}</h2>
        <p class="text-sm text-muted">{{ $t('groups.link.help', { days: INVITE_LINK_VALID_DAYS }) }}</p>
        <UButton icon="i-lucide-link" color="neutral" variant="outline" :label="$t('groups.link.create')" :loading="busy === 'link'" :disabled="busy !== null" data-testid="link-create" @click="createLink" />

        <div v-if="createdLink" class="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3" data-testid="link-created">
          <p class="text-sm font-medium text-highlighted">{{ $t('groups.link.once') }}</p>
          <div class="flex items-center gap-2">
            <UInput :model-value="createdLink.url" readonly class="min-w-0 flex-1 font-mono text-xs" :aria-label="$t('groups.link.field')" data-testid="link-url" @focus="($event.target as HTMLInputElement).select()" />
            <UButton :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" color="neutral" variant="outline" :label="copied ? $t('groups.link.copied') : $t('groups.link.copy')" data-testid="link-copy" @click="copyLink" />
          </div>
          <p class="text-xs text-muted">{{ $t('groups.link.expires', { date: formatDate(createdLink.expiresAt) }) }}</p>
        </div>

        <div v-if="pendingLinks.length > 0" class="space-y-2">
          <h3 class="text-sm font-medium text-default">{{ $t('groups.link.pending') }}</h3>
          <ul class="divide-y divide-default rounded-lg border border-default" data-testid="link-pending">
            <li v-for="invitation in pendingLinks" :key="invitation.invitationId" class="flex items-center gap-3 p-3">
              <span class="min-w-0 flex-1 text-sm">{{ $t('groups.link.pendingItem', { date: formatDate(invitation.expiresAt) }) }}</span>
              <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-x" :label="$t('groups.invite.cancel')" :loading="busy === 'cancel:' + invitation.invitationId" :disabled="busy !== null" data-testid="link-cancel" @click="cancelInvitation(invitation)" />
            </li>
          </ul>
        </div>
      </section>

      <!-- Quitter (membre) / Supprimer (créateur) -->
      <section class="space-y-3 border-t border-default pt-6" aria-labelledby="group-leave-title">
        <template v-if="rights.canLeave">
          <h2 id="group-leave-title" class="font-semibold text-highlighted">{{ $t('groups.leave.title') }}</h2>
          <p class="text-sm text-muted">{{ $t('groups.leave.help') }}</p>
          <UButton color="error" variant="outline" icon="i-lucide-log-out" :label="$t('groups.leave.button')" data-testid="group-leave" @click="confirmLeave = true" />
        </template>
        <template v-if="rights.canDelete">
          <h2 id="group-leave-title" class="font-semibold text-highlighted">{{ $t('groups.delete.title') }}</h2>
          <p class="text-sm text-muted">{{ $t('groups.delete.help') }}</p>
          <UButton color="error" variant="outline" icon="i-lucide-trash-2" :label="$t('groups.delete.button')" data-testid="group-delete" @click="confirmDelete = true" />
        </template>
      </section>

      <!-- Renommer (créateur) : en bas d'en-tête pour ne pas alourdir -->
      <section v-if="rights.canRename" class="space-y-2" aria-labelledby="group-rename-title">
        <h2 id="group-rename-title" class="font-semibold text-highlighted">{{ $t('groups.rename.title') }}</h2>
        <form class="flex flex-col gap-3 sm:flex-row sm:items-end" novalidate @submit.prevent="rename">
          <div class="flex-1 space-y-1.5">
            <label for="group-rename-input" class="block text-sm font-medium text-default">{{ $t('groups.rename.label') }}</label>
            <UInput id="group-rename-input" v-model="newName" maxlength="60" class="w-full" data-testid="group-rename-input" />
          </div>
          <UButton type="submit" :label="$t('groups.rename.submit')" :loading="busy === 'rename'" :disabled="busy !== null || newName.trim() === '' || newName.trim() === group.name" data-testid="group-rename-submit" />
        </form>
      </section>

      <!-- Confirmations -->
      <ConfirmDialog
        :open="toRemove !== null"
        :title="$t('groups.members.removeTitle', { name: toRemove?.displayName ?? $t('prompts.someone') })"
        :description="$t('groups.members.removeDescription')"
        :confirm-label="$t('groups.members.remove')"
        :loading="busy === 'remove'"
        @update:open="value => { if (!value) toRemove = null }"
        @confirm="removeMember"
      />
      <ConfirmDialog
        :open="toTransfer !== null"
        :title="$t('groups.members.transferTitle', { name: toTransfer?.displayName ?? $t('prompts.someone') })"
        :description="$t('groups.members.transferDescription', { name: toTransfer?.displayName ?? $t('prompts.someone') })"
        :confirm-label="$t('groups.members.transferConfirm')"
        :loading="busy === 'transfer'"
        @update:open="value => { if (!value) toTransfer = null }"
        @confirm="transfer"
      />
      <ConfirmDialog
        v-model:open="confirmLeave"
        :title="$t('groups.leave.confirmTitle', { group: group.name })"
        :description="$t('groups.leave.confirmDescription')"
        :confirm-label="$t('groups.leave.button')"
        :loading="busy === 'leave'"
        @confirm="leave"
      />
      <ConfirmDialog
        v-model:open="confirmDelete"
        :title="$t('groups.delete.confirmTitle', { group: group.name })"
        :description="$t('groups.delete.confirmDescription')"
        :confirm-label="$t('groups.delete.button')"
        :loading="busy === 'delete'"
        @confirm="deleteGroup"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { uuidSchema } from '#shared/schemas/common'
import { parseThemeInput, type ThemeInput } from '#shared/themes'
import type { Friend, GroupInvitation, GroupMember, MyGroup } from '#shared/utils/social'
import { groupRights, inviteLinkPath, INVITE_LINK_VALID_DAYS, memberRights } from '#shared/utils/socialUi'
import { publicOrigin } from '#shared/utils/siteUrl'

/**
 * Un groupe (v2) : membres (liens vers leurs profils), thème du groupe (choisir « Utiliser le thème de ce groupe »),
 * « Quitter » pour un membre. Pour le créateur, sur la même page : renommer, thème (sélecteur de la 6A, liste blanche Zod,
 * aperçu), inviter (amis ou recherche), lien d'invitation (jeton montré UNE seule fois, 7 jours), annuler une invitation,
 * retirer un membre, passer le rôle de créateur, supprimer le groupe. Boutons selon `groupRights` ; la base décide (42501).
 */
definePageMeta({ middleware: 'v2-only' })

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const requestUrl = useRequestURL()
const { $toast } = useNuxtApp()
const { errorText } = useSocialError()
const api = useGroups()
const friendsApi = useFriends()
const authStore = useAuthStore()
const themeStore = useThemeStore()
const { save } = useProfileSettings()

const groupId = computed(() => {
  const value = route.params.id
  const id = Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
  return uuidSchema.safeParse(id).success ? id : null
})
const meId = computed(() => authStore.currentUser?.id ?? null)

interface PageData {
  group: MyGroup | null
  members: GroupMember[]
  invitations: GroupInvitation[]
  friends: Friend[]
}
const empty = (): PageData => ({ group: null, members: [], invitations: [], friends: [] })

const { data, pending, refresh } = await useAsyncData<PageData>(
  () => `group:${groupId.value}`,
  async () => {
    if (!groupId.value) return empty()
    const groups = await api.listMyGroups().catch(() => [] as MyGroup[])
    const group = groups.find(candidate => candidate.groupId === groupId.value) ?? null
    if (!group) return empty()
    const [members, invitations, friends] = await Promise.all([
      api.listGroupMembers({ groupId: group.groupId }).catch(() => [] as GroupMember[]),
      group.isCreator ? api.listGroupInvitations().catch(() => [] as GroupInvitation[]) : Promise.resolve([] as GroupInvitation[]),
      group.isCreator ? friendsApi.listFriends().catch(() => [] as Friend[]) : Promise.resolve([] as Friend[])
    ])
    return { group, members, invitations, friends }
  },
  { watch: [groupId], default: empty }
)

const group = computed(() => data.value.group)
const members = computed(() => data.value.members)
const rights = computed(() => groupRights(group.value))

const sentHere = computed(() => data.value.invitations.filter(invitation => invitation.direction === 'sent' && invitation.groupId === groupId.value))
const pendingPeople = computed(() => sentHere.value.filter(invitation => invitation.userId !== null))
const pendingLinks = computed(() => sentHere.value.filter(invitation => invitation.userId === null))
const isMember = (userId: string) => members.value.some(member => member.userId === userId)
const isInvited = (userId: string) => pendingPeople.value.some(invitation => invitation.userId === userId)
const invitableFriends = computed(() => data.value.friends.filter(friend => !isMember(friend.userId) && !isInvited(friend.userId)))

const formatDate = (iso: string) => new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(iso))

const busy = ref<string | null>(null)
const message = ref<string | null>(null)
const themeMessage = ref<string | null>(null)

async function run(key: string, task: () => Promise<void>, reload = true): Promise<boolean> {
  busy.value = key
  message.value = null
  try {
    await task()
    if (reload) await refresh()
    return true
  } catch (cause) {
    message.value = errorText(cause)
    return false
  } finally {
    busy.value = null
  }
}

// ---- renommer
const newName = ref(group.value?.name ?? '')
watch(() => group.value?.name, (name) => { if (name) newName.value = name })
const rename = () => run('rename', async () => {
  await api.renameGroup({ groupId: groupId.value!, name: newName.value })
  $toast.success(t('groups.toast.renamed'))
})

// ---- thème
const theme = ref<ThemeInput | null>(parseThemeInput(group.value?.theme))
const groupThemeUsable = computed(() => parseThemeInput(group.value?.theme) !== null)
const isActiveTheme = computed(() => authStore.profile?.active_theme_group_id === groupId.value)

async function saveTheme(): Promise<void> {
  if (!theme.value) return
  themeMessage.value = null
  const ok = await run('theme', async () => {
    await api.updateGroupTheme({ groupId: groupId.value!, theme: theme.value as Record<string, unknown> })
    await themeStore.loadGroupThemes(true)
    $toast.success(t('groups.toast.themeSaved'))
  })
  if (!ok) {
    themeMessage.value = message.value
    message.value = null
  }
}

/** « Utiliser le thème de ce groupe » (`null` : revenir à mon thème personnel), comme dans les réglages. */
const useTheme = (target: string | null) => run('use', async () => {
  await themeStore.loadGroupThemes(true)
  await save({ activeThemeGroupId: target })
  themeStore.setPreview(null)
  $toast.success(t(target ? 'groups.toast.themeUsed' : 'groups.toast.themeMine'))
}, false)

// ---- inviter
const invite = (userId: string) => run(`invite:${userId}`, async () => {
  await api.inviteToGroup({ groupId: groupId.value!, userId })
  $toast.success(t('groups.toast.invited'))
})
const cancelInvitation = (invitation: GroupInvitation) => run(`cancel:${invitation.invitationId}`, async () => {
  await api.cancelGroupInvitation({ invitationId: invitation.invitationId })
  $toast.success(t('groups.toast.cancelled'))
})

// ---- lien d'invitation (le jeton n'est montré qu'une fois : il vit seulement dans cette page)
const createdLink = ref<{ url: string, expiresAt: string } | null>(null)
const copied = ref(false)
const createLink = () => run('link', async () => {
  const link = await api.createInviteLink({ groupId: groupId.value! })
  createdLink.value = { url: `${publicOrigin(useRuntimeConfig().public.siteUrl, requestUrl.origin)}${localePath(inviteLinkPath(link.token))}`, expiresAt: link.expiresAt }
  copied.value = false
})
async function copyLink(): Promise<void> {
  if (!createdLink.value) return
  try {
    await navigator.clipboard.writeText(createdLink.value.url)
    copied.value = true
  } catch {
    $toast.info(t('groups.link.copyManual'))
  }
}
watch(groupId, () => { createdLink.value = null })

// ---- membres
const toRemove = ref<GroupMember | null>(null)
const toTransfer = ref<GroupMember | null>(null)
async function removeMember(): Promise<void> {
  const target = toRemove.value
  if (!target) return
  await run('remove', async () => {
    await api.removeGroupMember({ groupId: groupId.value!, userId: target.userId })
    $toast.success(t('groups.toast.removed'))
  })
  toRemove.value = null
}
async function transfer(): Promise<void> {
  const target = toTransfer.value
  if (!target) return
  await run('transfer', async () => {
    await api.transferGroupOwnership({ groupId: groupId.value!, newCreatorId: target.userId })
    createdLink.value = null
    $toast.success(t('groups.toast.transferred'))
  })
  toTransfer.value = null
}

// ---- quitter, supprimer
const confirmLeave = ref(false)
const confirmDelete = ref(false)
async function leave(): Promise<void> {
  const ok = await run('leave', async () => {
    await api.leaveGroup({ groupId: groupId.value! })
    await afterGone()
    $toast.success(t('groups.toast.left'))
  }, false)
  confirmLeave.value = false
  if (ok) await navigateTo(localePath('/groupes'))
}
async function deleteGroup(): Promise<void> {
  const ok = await run('delete', async () => {
    await api.deleteGroup({ groupId: groupId.value! })
    await afterGone()
    $toast.success(t('groups.toast.deleted'))
  }, false)
  confirmDelete.value = false
  if (ok) await navigateTo(localePath('/groupes'))
}
/** Plus de groupe : si c'était mon thème actif, la base l'a remis à vide ; on relit mon profil et les thèmes. */
async function afterGone(): Promise<void> {
  await themeStore.loadGroupThemes(true)
  if (authStore.profile?.active_theme_group_id === groupId.value) {
    authStore.profile = { ...authStore.profile, active_theme_group_id: null }
  }
  useRecipesStore().refresh()
}

useHead({ title: () => group.value?.name ?? t('groups.title'), meta: [{ name: 'robots', content: 'noindex' }] })
</script>
