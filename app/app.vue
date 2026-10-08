<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
import { en, fr } from '@nuxt/ui/locale'

const { locale } = useI18n()
// Nom et accroche du site : configuration de l'édition (shared/editions/).
// `data-edition`, thème et `theme-color` : plugins/edition.ts.
const { siteName, tagline } = useEdition()

// Textes internes de Nuxt UI (pagination, modales…) dans la langue courante.
const uiLocale = computed(() => (locale.value === 'en' ? en : fr))

useHead({
  htmlAttrs: { lang: locale },
  titleTemplate: title => (title ? `${title} · ${siteName.value}` : siteName.value),
  meta: [
    { name: 'description', content: () => tagline.value }
  ]
})
</script>
