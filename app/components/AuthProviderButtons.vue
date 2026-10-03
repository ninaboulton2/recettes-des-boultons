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
        <svg class="size-5" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09Z" />
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
        </svg>
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
      error.value = oauthError.message || t('auth.oauth.error')
      loading.value = null
    }
    // Sinon le navigateur quitte la page : on laisse l'état « chargement ».
  } catch {
    error.value = t('auth.oauth.error')
    loading.value = null
  }
}
</script>
