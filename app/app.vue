<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
import { en, fr } from '@nuxt/ui/locale'
import { normalizeSiteUrl } from '#shared/utils/siteUrl'

const { locale } = useI18n()
const route = useRoute()
// Adresse canonique (SITE_URL) : balises canonical / og:url. Absente (v1, local) : aucune balise. Les liens publics /r/<jeton>
// (noindex, le jeton est dans l'adresse) n'en ont pas.
const siteOrigin = normalizeSiteUrl(useRuntimeConfig().public.siteUrl)
const canonicalUrl = computed(() => {
  if (!siteOrigin || /^\/(?:en\/)?r(?:\/|$)/.test(route.path)) return null
  return `${siteOrigin}${route.path}`
})
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

// Seulement avec SITE_URL (et hors lien public) : sans elle, l'en-tête reste celui de la v1.
useHead(() => canonicalUrl.value
  ? {
      link: [{ rel: 'canonical', href: canonicalUrl.value }],
      meta: [
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: siteName.value },
        { property: 'og:url', content: canonicalUrl.value }
      ]
    }
  : {})
</script>
