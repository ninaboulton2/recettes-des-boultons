<template>
  <HomeBoultons v-if="config.home.variant === 'boultons'" />
  <HomeGeneric v-else />
</template>

<script setup lang="ts">
// Variante d'accueil choisie par l'édition (shared/editions/*.ts → home.variant).
const { t } = useI18n()
const { config, text } = useEdition()

useHead({
  title: () => t('navigation.home'),
  meta: [
    { name: 'description', content: () => text(config.brand.homeDescription) }
  ]
})
</script>
