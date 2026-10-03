<template>
  <div v-if="providers.length > 0" class="space-y-2">
    <UButton
      v-if="providers.includes('google')"
      block
      color="neutral"
      variant="outline"
      size="lg"
      :loading="loading === 'google'"
      :disabled="loading !== null"
      :label="$t('auth.oauth.google')"
      @click="signIn('google')"
    >
      <template #leading>
        <img src="/images/google.svg" alt="" class="size-5">
      </template>
    </UButton>

    <UButton
      v-if="providers.includes('apple')"
      block
      color="neutral"
      variant="outline"
      size="lg"
      :loading="loading === 'apple'"
      :disabled="loading !== null"
      :label="$t('auth.oauth.apple')"
      @click="signIn('apple')"
    >
      <template #leading>
        <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16.37 12.7c-.02-2.44 2-3.61 2.09-3.67-1.14-1.67-2.91-1.9-3.54-1.92-1.5-.15-2.94.89-3.7.89-.77 0-1.95-.87-3.2-.85-1.65.03-3.17.96-4.02 2.43-1.72 2.98-.44 7.39 1.23 9.81.82 1.18 1.79 2.51 3.06 2.46 1.23-.05 1.7-.8 3.19-.8 1.49 0 1.91.8 3.21.77 1.33-.02 2.17-1.2 2.98-2.39.94-1.37 1.33-2.7 1.35-2.77-.03-.01-2.59-.99-2.62-3.96ZM13.94 5.5c.68-.82 1.14-1.97 1.01-3.11-.98.04-2.16.65-2.86 1.47-.63.73-1.18 1.9-1.03 3.01 1.09.09 2.2-.55 2.88-1.37Z" />
        </svg>
      </template>
    </UButton>

    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
  </div>
</template>

<script setup lang="ts">
import type { OAuthProvider } from '~/composables/useAuthProviders'

/**
 * Boutons « Continuer avec Google / Apple » : redirige vers Supabase Auth,
 * qui renvoie sur `/confirm` (page qui attend la session puis redirige).
 */
const supabase = useSupabaseClient()
const localePath = useLocalePath()
const route = useRoute()
const { t } = useI18n()

const providers = useAuthProviders()
const loading = ref<OAuthProvider | null>(null)
const error = ref('')

const signIn = async (provider: OAuthProvider) => {
  loading.value = provider
  error.value = ''
  try {
    // Page à rouvrir après le retour OAuth (lue par pages/confirm.vue)
    sessionStorage.setItem('auth:redirect', route.fullPath)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${localePath('/confirm')}` }
    })
    if (oauthError) {
      error.value = t('auth.oauth.error')
      loading.value = null
    }
    // Sinon le navigateur quitte la page : on laisse l'état « chargement ».
  } catch {
    error.value = t('auth.oauth.error')
    loading.value = null
  }
}
</script>
