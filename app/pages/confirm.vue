<template>
  <div class="mx-auto flex max-w-md flex-col items-center py-16 text-center">
    <template v-if="!failed">
      <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" aria-hidden="true" />
      <p class="mt-4 text-muted" role="status">{{ $t('auth.confirm.waiting') }}</p>
    </template>
    <template v-else>
      <UIcon name="i-lucide-circle-alert" class="size-8 text-error" aria-hidden="true" />
      <h1 class="mt-4 font-serif text-2xl font-semibold text-highlighted">{{ $t('auth.confirm.failedTitle') }}</h1>
      <p class="mt-2 text-muted">{{ $t('auth.confirm.failedDescription') }}</p>
      <UButton class="mt-6" :to="localePath('/')" icon="i-lucide-house" :label="$t('ui.common.backHome')" />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Retour OAuth (Google / Apple) : le client Supabase échange le code présent
 * dans l'URL, `useSupabaseUser()` se renseigne, puis on revient sur la page
 * d'origine (mémorisée avant la redirection) ou l'accueil.
 */
const { t } = useI18n()
const user = useSupabaseUser()
const localePath = useLocalePath()
const failed = ref(false)

const redirectBack = () => {
  let target = localePath('/')
  try {
    const saved = sessionStorage.getItem('auth:redirect')
    sessionStorage.removeItem('auth:redirect')
    if (saved && saved.startsWith('/') && !saved.startsWith('//')) target = saved
  } catch {
    // sessionStorage indisponible : retour à l'accueil
  }
  return navigateTo(target, { replace: true })
}

watch(user, (value) => {
  if (value) void redirectBack()
}, { immediate: true })

onMounted(() => {
  const timer = setTimeout(() => {
    if (!user.value) failed.value = true
  }, 8000)
  onUnmounted(() => clearTimeout(timer))
})

useHead({ title: () => t('auth.confirm.title') })
</script>
