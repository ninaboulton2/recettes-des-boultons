<template>
  <UModal
    :open="open"
    :title="rights.canManageSharing ? $t('share.title') : $t('share.reshare.title')"
    :description="rights.canManageSharing ? $t('share.description') : $t('share.reshare.description')"
    :ui="{ content: 'sm:max-w-2xl' }"
    @update:open="value => emit('update:open', value)"
  >
    <template #body>
      <div class="space-y-8" data-testid="share-modal">
        <!-- ================= L'auteur : visibilité, droits, lien public ================= -->
        <template v-if="rights.canManageSharing">
          <section aria-labelledby="share-visibility-title" class="space-y-3">
            <h3 id="share-visibility-title" class="font-semibold text-highlighted">{{ $t('share.visibility.title') }}</h3>
            <URadioGroup
              :model-value="visibility"
              :items="visibilityItems"
              value-key="value"
              :disabled="busy"
              data-testid="share-visibility"
              @update:model-value="value => changeVisibility(value === 'private' ? 'private' : 'groups')"
            />
          </section>

          <section aria-labelledby="share-grants-title" class="space-y-3">
            <h3 id="share-grants-title" class="font-semibold text-highlighted">{{ $t('share.grants.title') }}</h3>
            <p v-if="grantsLoading" class="text-sm text-muted">{{ $t('share.loading') }}</p>
            <p v-else-if="grants.length === 0" class="text-sm text-muted" data-testid="share-grants-empty">{{ $t('share.grants.empty') }}</p>
            <ul v-else class="divide-y divide-default rounded-lg border border-default" data-testid="share-grants-list">
              <li v-for="grant in grants" :key="grant.id" class="flex items-center gap-3 p-3" data-testid="share-grant-row">
                <UIcon :name="grant.granteeGroupId ? 'i-lucide-users-round' : 'i-lucide-user'" class="size-5 shrink-0 text-dimmed" aria-hidden="true" />
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium text-highlighted">{{ grant.granteeName ?? $t('share.unnamed') }}</p>
                  <p class="text-xs text-muted">
                    {{ $t(`share.permission.${grant.permission}`) }}
                    <template v-if="grant.origin === 'reshare'"> · {{ $t('share.grants.reshared', { by: grant.grantedByName ?? $t('prompts.someone') }) }}</template>
                    <template v-else-if="grant.origin === 'link'"> · {{ $t('share.grants.viaLink') }}</template>
                  </p>
                </div>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-x"
                  :aria-label="$t('share.grants.remove', { name: grant.granteeName ?? $t('share.unnamed') })"
                  :disabled="busy"
                  data-testid="share-grant-revoke"
                  @click="revoke(grant.id)"
                />
              </li>
            </ul>
          </section>

          <section aria-labelledby="share-add-title" class="space-y-3">
            <h3 id="share-add-title" class="font-semibold text-highlighted">{{ $t('share.add.title') }}</h3>
            <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
              <UFormField :label="$t('share.add.who')">
                <USelectMenu
                  v-model="selected"
                  v-model:search-term="searchTerm"
                  :items="recipientItems"
                  value-key="value"
                  ignore-filter
                  :loading="recipientsLoading"
                  :placeholder="$t('share.add.placeholder')"
                  :search-input="{ placeholder: $t('share.add.search') }"
                  class="w-full"
                  data-testid="share-recipient"
                />
              </UFormField>
              <UFormField :label="$t('share.add.level')">
                <USelect v-model="permission" :items="grantLevelItems" class="w-full" data-testid="share-permission" />
              </UFormField>
            </div>
            <p class="text-xs text-muted">{{ $t(`share.permissionHint.${permission}`) }}</p>
            <div class="flex justify-end">
              <UButton icon="i-lucide-user-plus" :label="$t('share.add.submit')" :disabled="!selected || busy" :loading="busy" data-testid="share-grant-submit" @click="giveAccess" />
            </div>
          </section>

          <section aria-labelledby="share-link-title" class="space-y-3">
            <h3 id="share-link-title" class="font-semibold text-highlighted">{{ $t('share.link.title') }}</h3>
            <p class="text-sm text-muted">{{ $t('share.link.description') }}</p>
            <template v-if="linkActive">
              <div class="flex gap-2">
                <UInput :model-value="linkUrl" readonly class="min-w-0 flex-1" :aria-label="$t('share.link.title')" data-testid="share-link-input" />
                <UButton icon="i-lucide-copy" color="neutral" variant="outline" :label="$t('share.link.copy')" :disabled="!linkUrl" data-testid="share-link-copy" @click="copyLink" />
                <UButton v-if="canNativeShare" icon="i-lucide-share" color="neutral" variant="outline" :aria-label="$t('share.link.nativeShare')" :disabled="!linkUrl" @click="nativeShare" />
              </div>
              <p class="text-xs text-muted">{{ $t('share.link.revokeNote') }}</p>
              <UButton color="error" variant="outline" size="sm" icon="i-lucide-link-2-off" :label="$t('share.link.revoke')" :disabled="busy" data-testid="share-link-revoke" @click="revokeLink" />
            </template>
            <UButton v-else icon="i-lucide-link" color="neutral" variant="outline" :label="$t('share.link.create')" :disabled="busy" data-testid="share-link-create" @click="createLink" />
          </section>
        </template>

        <!-- ================= Repartage : un droit reçu explicitement, à UNE personne ================= -->
        <template v-else-if="rights.canReshare">
          <section class="space-y-3" data-testid="share-reshare">
            <p class="text-sm text-muted">{{ $t('share.reshare.rules', { level: $t(`share.permission.${rights.maxReshare}`) }) }}</p>
            <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
              <UFormField :label="$t('share.add.whoPerson')">
                <USelectMenu
                  v-model="selected"
                  v-model:search-term="searchTerm"
                  :items="recipientItems"
                  value-key="value"
                  ignore-filter
                  :loading="recipientsLoading"
                  :placeholder="$t('share.add.placeholder')"
                  :search-input="{ placeholder: $t('share.add.search') }"
                  class="w-full"
                  data-testid="share-recipient"
                />
              </UFormField>
              <UFormField :label="$t('share.add.level')">
                <USelect v-model="resharePermission" :items="reshareLevelItems" class="w-full" data-testid="share-permission" />
              </UFormField>
            </div>
            <div class="flex justify-end">
              <UButton icon="i-lucide-send" :label="$t('share.reshare.submit')" :disabled="!selected || busy" :loading="busy" data-testid="share-reshare-submit" @click="reshare" />
            </div>
          </section>
        </template>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { RecipeVisibility } from '#shared/schemas/sharing'
import type { RecipeGrant } from '#shared/utils/cookbook'
import { filterRecipients } from '#shared/utils/recipients'
import { recipeRights, reshareLevels, sharingErrorKey, type RecipeAccess } from '#shared/utils/recipeRights'

/**
 * Fenêtre « Partager » (v2). L'AUTEUR règle la visibilité, donne ou retire des droits (personne ou groupe ; lecture, copie ou
 * modification de l'original) et gère le lien public. Une personne qui a reçu un droit EXPLICITE peut le REPARTAGER à une
 * personne seulement (jamais un groupe), au plus à son propre niveau et jamais « modifier l'original ». Les règles sont
 * appliquées en base (42501, 22023, 54000 …) ; ici on ne propose que ce qui peut réussir et on explique les refus.
 * Échap ferme la fenêtre (UModal).
 */
const props = defineProps<{ open: boolean, recipeId: string, access: RecipeAccess }>()
const emit = defineEmits<{ 'update:open': [value: boolean], 'changed': [] }>()

const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const sharing = useSharing()
const recipients = useShareRecipients()

const rights = computed(() => recipeRights(props.access))
const busy = ref(false)

const fail = (cause: unknown) => {
  const key = sharingErrorKey(cause)
  toast.add({ title: t(key === 'errors.generic' ? 'share.error' : key), color: 'error', icon: 'i-lucide-circle-alert' })
}

// ---- Visibilité -------------------------------------------------------------------------------------------------
const visibility = ref<RecipeVisibility>(props.access.visibility)
const visibilityItems = computed(() => [
  { value: 'groups', label: t('cookbook.options.visibilityGroups'), description: t('cookbook.options.visibilityGroupsHint') },
  { value: 'private', label: t('cookbook.options.visibilityPrivate'), description: t('cookbook.options.visibilityPrivateHint') }
])
async function changeVisibility(next: RecipeVisibility): Promise<void> {
  if (next === visibility.value) return
  const before = visibility.value
  visibility.value = next
  busy.value = true
  try {
    await sharing.setRecipeVisibility({ recipeId: props.recipeId, visibility: next })
    toast.add({ title: t('share.visibility.saved'), color: 'success', icon: 'i-lucide-check' })
    emit('changed')
  } catch (cause) {
    visibility.value = before
    fail(cause)
  } finally {
    busy.value = false
  }
}

// ---- Droits donnés ----------------------------------------------------------------------------------------------
const grants = ref<RecipeGrant[]>([])
const grantsLoading = ref(false)
async function loadGrants(): Promise<void> {
  if (!rights.value.canManageSharing) return
  grantsLoading.value = true
  try {
    grants.value = await sharing.listRecipeGrants({ recipeId: props.recipeId })
  } catch (cause) {
    fail(cause)
  } finally {
    grantsLoading.value = false
  }
}
async function revoke(grantId: string): Promise<void> {
  busy.value = true
  try {
    await sharing.revokeRecipeGrant({ grantId })
    toast.add({ title: t('share.grants.removed'), color: 'success', icon: 'i-lucide-check' })
    await loadGrants()
    emit('changed')
  } catch (cause) {
    fail(cause)
  } finally {
    busy.value = false
  }
}

// ---- Destinataires (amis, membres de mes groupes, recherche par nom) ------------------------------------------------
const selected = ref<string | undefined>(undefined)
const searchTerm = ref('')
const permission = ref<'read' | 'copy' | 'edit_original'>('copy')
const resharePermission = ref<'read' | 'copy'>('read')
const remote = ref<Array<{ id: string, displayName: string | null }>>([])
const recipientsLoading = computed(() => recipients.loading.value)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchRun = 0
watch(searchTerm, (term) => {
  clearTimeout(searchTimer)
  const run = ++searchRun
  if (term.trim().length < 3) {
    remote.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      const found = await recipients.searchUsers({ query: term.trim() })
      if (run === searchRun) remote.value = found
    } catch {
      if (run === searchRun) remote.value = []
    }
  }, 300)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

const recipientItems = computed(() => {
  const term = searchTerm.value
  const items: Array<{ label: string, value: string, description: string, icon: string }> = []
  const seen = new Set<string>()
  for (const person of filterRecipients(recipients.people.value, term)) {
    seen.add(person.userId)
    const via = [person.isFriend ? t('share.add.friend') : '', ...person.groupNames].filter(Boolean).join(', ')
    items.push({ label: person.displayName || t('share.unnamed'), value: `user:${person.userId}`, description: via, icon: 'i-lucide-user' })
  }
  const ownerId = props.access.ownerId
  for (const found of remote.value) {
    if (seen.has(found.id) || found.id === ownerId) continue
    items.push({ label: found.displayName || t('share.unnamed'), value: `user:${found.id}`, description: t('share.add.found'), icon: 'i-lucide-search' })
  }
  if (rights.value.canManageSharing) {
    for (const group of filterRecipients(recipients.groups.value.map(g => ({ ...g, displayName: g.name })), term)) {
      items.push({ label: group.name, value: `group:${group.groupId}`, description: t('share.add.groupHint', { n: group.memberCount }), icon: 'i-lucide-users-round' })
    }
  }
  return items
})

const permissionLabel = (level: 'read' | 'copy' | 'edit_original') => t(`share.permission.${level}`)
const grantLevelItems = computed(() => (['read', 'copy', 'edit_original'] as const).map(value => ({ value, label: permissionLabel(value) })))
const reshareLevelItems = computed(() => reshareLevels(rights.value.maxReshare).map(value => ({ value, label: permissionLabel(value) })))

function reset(): void {
  selected.value = undefined
  searchTerm.value = ''
  remote.value = []
}

async function giveAccess(): Promise<void> {
  const choice = selected.value
  if (!choice) return
  const [kind, id] = choice.split(':')
  busy.value = true
  try {
    await sharing.grantRecipe({
      recipeId: props.recipeId,
      granteeUserId: kind === 'user' ? id : undefined,
      granteeGroupId: kind === 'group' ? id : undefined,
      permission: permission.value
    })
    toast.add({ title: t('share.add.done'), color: 'success', icon: 'i-lucide-check' })
    reset()
    await loadGrants()
    emit('changed')
  } catch (cause) {
    fail(cause)
  } finally {
    busy.value = false
  }
}

async function reshare(): Promise<void> {
  const choice = selected.value
  if (!choice?.startsWith('user:')) return
  busy.value = true
  try {
    const id = await sharing.reshareRecipe({ recipeId: props.recipeId, granteeUserId: choice.slice(5), permission: resharePermission.value })
    if (id) toast.add({ title: t('share.reshare.done'), color: 'success', icon: 'i-lucide-check' })
    else toast.add({ title: t('share.reshare.alreadyHas'), color: 'info', icon: 'i-lucide-info' })
    reset()
  } catch (cause) {
    fail(cause)
  } finally {
    busy.value = false
  }
}

// ---- Lien public --------------------------------------------------------------------------------------------------------
const linkActive = ref(props.access.hasShareLink)
const linkUrl = ref('')
const canNativeShare = ref(false)
const absolute = (path: string) => new URL(localePath(path), window.location.origin).toString()

async function loadLink(): Promise<void> {
  if (!rights.value.canManageSharing || !linkActive.value) return
  try {
    // `create_share_link` renvoie le jeton existant s'il y en a déjà un (le jeton n'est lisible que par cette fonction).
    const { path } = await sharing.createShareLink({ recipeId: props.recipeId })
    linkUrl.value = absolute(path)
  } catch (cause) {
    fail(cause)
  }
}
async function createLink(): Promise<void> {
  busy.value = true
  try {
    const { path } = await sharing.createShareLink({ recipeId: props.recipeId })
    linkActive.value = true
    linkUrl.value = absolute(path)
    emit('changed')
  } catch (cause) {
    fail(cause)
  } finally {
    busy.value = false
  }
}
async function revokeLink(): Promise<void> {
  busy.value = true
  try {
    await sharing.revokeShareLink({ recipeId: props.recipeId })
    linkActive.value = false
    linkUrl.value = ''
    toast.add({ title: t('share.link.revoked'), color: 'success', icon: 'i-lucide-check' })
    emit('changed')
  } catch (cause) {
    fail(cause)
  } finally {
    busy.value = false
  }
}
async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(linkUrl.value)
    toast.add({ title: t('share.link.copied'), color: 'success', icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: t('share.link.copyError'), color: 'warning', icon: 'i-lucide-circle-alert' })
  }
}
async function nativeShare(): Promise<void> {
  try {
    await navigator.share({ url: linkUrl.value })
  } catch {
    // Feuille de partage fermée par la personne : rien à signaler.
  }
}

// ---- Ouverture -----------------------------------------------------------------------------------------------------------
watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  visibility.value = props.access.visibility
  linkActive.value = props.access.hasShareLink
  linkUrl.value = ''
  canNativeShare.value = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  permission.value = 'copy'
  resharePermission.value = rights.value.maxReshare === 'copy' ? 'copy' : 'read'
  reset()
  await Promise.all([
    recipients.load(props.access.ownerId ? [props.access.ownerId] : []),
    loadGrants(),
    loadLink()
  ])
}, { immediate: true })
</script>
