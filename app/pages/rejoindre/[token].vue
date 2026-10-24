<template>
  <div class="mx-auto max-w-md py-10 text-center" data-testid="join-page">
    <div class="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-primary/10">
      <UIcon :name="failed ? 'i-lucide-link-2-off' : 'i-lucide-users-round'" class="size-8 text-primary" aria-hidden="true" />
    </div>

    <template v-if="failed">
      <h1 class="font-serif text-3xl font-semibold text-highlighted" data-testid="join-invalid-title">{{ $t('join.invalid.title') }}</h1>
      <p class="mt-3 text-muted" data-testid="join-invalid">{{ failureText }}</p>
      <UButton class="mt-6" color="neutral" variant="outline" :to="localePath('/')" :label="$t('join.invalid.action')" />
    </template>

    <template v-else>
      <h1 class="font-serif text-3xl font-semibold text-highlighted">{{ $t('join.title') }}</h1>
      <p class="mt-3 text-muted">{{ $t('join.description') }}</p>
      <p class="mt-2 text-sm text-muted">{{ $t('join.nothingAdded') }}</p>
      <UButton
        v-if="authStore.isAuthenticated"
        class="mt-6"
        size="lg"
        icon="i-lucide-log-in"
        :label="$t('join.button')"
        :loading="joining"
        :disabled="!token"
        data-testid="join-button"
        @click="join"
      />
      <UButton v-else class="mt-6" size="lg" icon="i-lucide-log-in" :label="$t('join.login')" data-testid="join-login" @click="showLogin = true" />
    </template>

    <AuthModal :is-open="showLogin" @close="showLogin = false" @success="showLogin = false" />
  </div>
</template>

<script setup lang="ts">
import { redeemInviteLinkInputSchema } from '#shared/schemas/social'

/**
 * Arrivée par un lien d'invitation (v2, `/rejoindre/<jeton>`) : connexion si besoin (modale), puis `redeem_invite_link` au
 * clic sur « Rejoindre » (jamais automatique : un aperçu de lien ne doit pas consommer ce lien à usage unique). Un jeton
 * mal formé, inconnu, expiré ou déjà utilisé donne le MÊME message neutre. Rejoindre n'ajoute aucune recette au carnet.
 */
definePageMeta({
  middleware: () => {
    if (!useV2()) return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true }))
  }
})

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { $toast } = useNuxtApp()
const authStore = useAuthStore()
const { inviteLinkErrorText } = useSocialError()
const { redeemInviteLink } = useGroups()
const themeStore = useThemeStore()

const token = computed(() => {
  const value = route.params.token
  const raw = Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
  return redeemInviteLinkInputSchema.safeParse({ token: raw }).success ? raw : null
})

const showLogin = ref(false)
const joining = ref(false)
const failed = ref(token.value === null)
const failureText = ref(t('join.invalid.description'))

async function join(): Promise<void> {
  if (!token.value) return
  joining.value = true
  try {
    const groupId = await redeemInviteLink({ token: token.value })
    await themeStore.loadGroupThemes(true)
    $toast.success(t('join.success'))
    await navigateTo(localePath(`/groupes/${groupId}`))
  } catch (cause) {
    failed.value = true
    failureText.value = inviteLinkErrorText(cause) === t('errors.social.invalidLink') ? t('join.invalid.description') : inviteLinkErrorText(cause)
  } finally {
    joining.value = false
  }
}

useHead({ title: () => t('join.title'), meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
</script>
