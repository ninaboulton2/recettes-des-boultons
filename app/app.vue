<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
import { en, fr } from '@nuxt/ui/locale'

const { t, locale } = useI18n()

// Textes internes de Nuxt UI (pagination, modales…) dans la langue courante.
const uiLocale = computed(() => (locale.value === 'en' ? en : fr))

useHead({
  htmlAttrs: { lang: locale },
  titleTemplate: title => (title ? `${title} · ${t('meta.title')}` : t('meta.title')),
  meta: [
    { name: 'description', content: () => t('meta.description') }
  ]
})
</script>
