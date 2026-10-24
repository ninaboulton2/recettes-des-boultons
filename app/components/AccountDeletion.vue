<template>
  <section class="space-y-4" aria-labelledby="deletion-heading" data-testid="settings-deletion">
    <h2 id="deletion-heading" class="font-serif text-xl font-semibold text-error">{{ $t('settings.deletion.title') }}</h2>
    <div class="space-y-3 rounded-xl border border-error/40 p-4 md:p-5">
      <p class="text-sm text-muted">{{ $t('settings.deletion.description') }}</p>
      <div class="flex flex-wrap items-center gap-3">
        <UButton color="error" variant="outline" icon="i-lucide-trash-2" :label="$t('settings.deletion.button')" :loading="checking" data-testid="deletion-start" @click="start" />
        <p v-if="startError" class="text-sm text-error" role="alert">{{ startError }}</p>
      </div>
    </div>

    <!-- Blocage : des groupes sont à transférer ou à supprimer d'abord -->
    <UModal v-model:open="blockedOpen" :title="$t('settings.deletion.blocked.title')" :description="$t('settings.deletion.blocked.intro')" :ui="{ footer: 'justify-end' }">
      <template #body>
        <ul class="space-y-3" data-testid="deletion-blockers">
          <li v-for="blocker in blockers" :key="blocker.groupId" class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-default p-3" :data-testid="`deletion-blocker-${blocker.groupId}`">
            <div class="min-w-0">
              <p class="truncate font-medium text-highlighted">{{ blocker.groupName }}</p>
              <p class="text-sm text-muted">{{ $t('settings.deletion.blocked.members', { n: blocker.otherMemberCount }, blocker.otherMemberCount) }}</p>
            </div>
            <UButton :to="localePath(`/groupes/${blocker.groupId}`)" color="neutral" variant="outline" size="sm" icon="i-lucide-users-round" :label="$t('settings.deletion.blocked.manage')" @click="blockedOpen = false" />
          </li>
        </ul>
        <p class="mt-4 text-sm text-muted">{{ $t('settings.deletion.blocked.hint') }}</p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" :label="$t('ui.common.close')" data-testid="deletion-blocked-close" @click="blockedOpen = false" />
      </template>
    </UModal>

    <!-- Confirmation forte -->
    <UModal v-model:open="confirmOpen" :title="$t('settings.deletion.confirm.title')" :description="$t('settings.deletion.confirm.intro')" :ui="{ footer: 'justify-end' }">
      <template #body>
        <div class="space-y-4">
          <ul class="list-disc space-y-1.5 pl-5 text-sm text-default" data-testid="deletion-consequences">
            <li v-for="key in CONSEQUENCES" :key="key">{{ $t(`settings.deletion.confirm.consequences.${key}`) }}</li>
          </ul>
          <p class="text-sm font-medium text-error">{{ $t('settings.deletion.confirm.irreversible') }}</p>
          <div class="space-y-1.5">
            <label for="deletion-email" class="block text-sm font-medium text-default">{{ $t('settings.deletion.confirm.emailLabel', { email: accountEmail }) }}</label>
            <UInput id="deletion-email" v-model="typedEmail" type="email" autocomplete="off" :placeholder="$t('settings.deletion.confirm.emailPlaceholder')" class="w-full" data-testid="deletion-email" @keydown.enter.prevent="confirm" />
          </div>
          <p v-if="confirmError" class="text-sm text-error" role="alert" data-testid="deletion-error">{{ confirmError }}</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" :label="$t('ui.common.cancel')" :disabled="deleting" data-testid="deletion-cancel" @click="confirmOpen = false" />
        <UButton color="error" icon="i-lucide-trash-2" :label="$t('settings.deletion.confirm.submit')" :disabled="!canConfirm" :loading="deleting" data-testid="deletion-confirm" @click="confirm" />
      </template>
    </UModal>

    <!-- Reconnexion exigée (connexion de plus de 10 minutes) -->
    <UModal v-model:open="reauthOpen" :title="$t('settings.deletion.reauth.title')" :description="$t('settings.deletion.reauth.description')" :ui="{ footer: 'justify-end' }">
      <template #body>
        <form v-if="passwordLogin" class="space-y-3" novalidate @submit.prevent="reauthenticate">
          <label for="deletion-password" class="block text-sm font-medium text-default">{{ $t('settings.deletion.reauth.password') }}</label>
          <UInput id="deletion-password" v-model="password" type="password" autocomplete="current-password" class="w-full" data-testid="deletion-password" />
          <p v-if="reauthError" class="text-sm text-error" role="alert" data-testid="deletion-reauth-error">{{ reauthError }}</p>
        </form>
        <div v-else class="space-y-3" data-testid="deletion-reauth-oauth">
          <p class="text-sm text-default">{{ $t('settings.deletion.reauth.oauth') }}</p>
          <UButton color="neutral" variant="outline" icon="i-lucide-log-out" :label="$t('ui.user.logout')" @click="logoutThenHome" />
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" :label="$t('ui.common.cancel')" @click="reauthOpen = false" />
        <UButton v-if="passwordLogin" color="error" :label="$t('settings.deletion.reauth.submit')" :loading="deleting" :disabled="password === ''" data-testid="deletion-reauth-submit" @click="reauthenticate" />
      </template>
    </UModal>
  </section>
</template>

<script setup lang="ts">
import { classifyDeletionError, emailMatches, hasPasswordLogin } from '#shared/utils/account'
import type { DeletionBlocker } from '#shared/utils/social'

/**
 * Suppression de mon compte (dossier §7.4) : (1) `account_deletion_blockers` — des groupes à transférer ou supprimer d'abord ;
 * (2) confirmation forte, ce qui disparaît puis saisie de l'adresse e-mail du compte ; (3) `POST /api/account/delete` ;
 * 401 `REAUTH_REQUIRED` → reconnexion (mot de passe) puis reprise ; (4) déconnexion et page « Compte supprimé ».
 * Affichage seulement : le serveur et la base décident (adresse, blocages, connexion récente).
 */
const { t } = useI18n()
const localePath = useLocalePath()
const authStore = useAuthStore()
const supabase = useSupabaseClient()
const claims = useSupabaseUser()
const { accountDeletionBlockers, deleteAccount } = useAccount()

const CONSEQUENCES = ['recipes', 'groups', 'social', 'personal', 'reports'] as const

const accountEmail = computed(() => authStore.currentUser?.email ?? '')
const passwordLogin = computed(() => hasPasswordLogin(claims.value))

const checking = ref(false)
const startError = ref('')
const blockers = ref<DeletionBlocker[]>([])
const blockedOpen = ref(false)
const confirmOpen = ref(false)
const reauthOpen = ref(false)
const typedEmail = ref('')
const confirmError = ref('')
const deleting = ref(false)
const password = ref('')
const reauthError = ref('')

const canConfirm = computed(() => emailMatches(typedEmail.value, accountEmail.value) && !deleting.value)

async function loadBlockers(): Promise<boolean> {
  blockers.value = await accountDeletionBlockers()
  return blockers.value.length > 0
}

async function start(): Promise<void> {
  checking.value = true
  startError.value = ''
  try {
    if (await loadBlockers()) {
      blockedOpen.value = true
      return
    }
    typedEmail.value = ''
    confirmError.value = ''
    confirmOpen.value = true
  } catch {
    startError.value = t('errors.generic')
  } finally {
    checking.value = false
  }
}

async function confirm(): Promise<void> {
  if (!canConfirm.value) return
  deleting.value = true
  confirmError.value = ''
  try {
    await deleteAccount({ confirmEmail: typedEmail.value })
  } catch (cause) {
    deleting.value = false
    const failure = classifyDeletionError(cause)
    if (failure.kind === 'reauth') {
      confirmOpen.value = false
      password.value = ''
      reauthError.value = ''
      reauthOpen.value = true
    } else if (failure.kind === 'blockers') {
      confirmOpen.value = false
      await loadBlockers().catch(() => undefined)
      blockedOpen.value = true
    } else if (failure.kind === 'mismatch') {
      confirmError.value = t('settings.deletion.confirm.mismatch')
    } else {
      confirmError.value = t('settings.deletion.errors.generic')
    }
    return
  }
  await finish()
}

/** Nouvelle connexion par mot de passe (jeton neuf, `iat` récent), puis reprise de la suppression. */
async function reauthenticate(): Promise<void> {
  if (!password.value || deleting.value) return
  deleting.value = true
  reauthError.value = ''
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: accountEmail.value, password: password.value })
    if (error) {
      reauthError.value = t('settings.deletion.reauth.wrong')
      deleting.value = false
      return
    }
    await deleteAccount({ confirmEmail: typedEmail.value })
  } catch (cause) {
    deleting.value = false
    const failure = classifyDeletionError(cause)
    if (failure.kind === 'blockers') {
      reauthOpen.value = false
      await loadBlockers().catch(() => undefined)
      blockedOpen.value = true
    } else {
      reauthError.value = t(failure.kind === 'reauth' ? 'settings.deletion.reauth.wrong' : 'settings.deletion.errors.generic')
    }
    return
  }
  await finish()
}

async function finish(): Promise<void> {
  confirmOpen.value = false
  reauthOpen.value = false
  await authStore.logout()
  deleting.value = false
  await navigateTo(localePath('/compte-supprime'))
}

async function logoutThenHome(): Promise<void> {
  reauthOpen.value = false
  await authStore.logout()
  await navigateTo(localePath('/'))
}
</script>
