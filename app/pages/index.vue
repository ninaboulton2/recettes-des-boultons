<template>
  <div>
    <!-- v2, connecté : bannières « Explorer les recettes de X » / « nouvelle recette » (pending_prompts) -->
    <PromptBanners v-if="v2 && authStore.isAuthenticated" class="mb-6" />
    <!-- v2, visiteur sans compte : présentation générique du produit, aucune recette -->
    <HomeVisitor v-if="v2 && !authStore.isAuthenticated" />
    <HomeBoultons v-else-if="edition.config.home.variant === 'boultons'" />
    <HomeGeneric v-else />
  </div>
</template>

<script setup lang="ts">
// Variante d'accueil choisie par l'édition (shared/editions/*.ts → home.variant) ; en v2, par le thème actif.
const { t } = useI18n()
const edition = useEdition()
const v2 = useV2()
const authStore = useAuthStore()

useHead({
  title: () => t('navigation.home'),
  meta: [
    { name: 'description', content: () => edition.text(edition.config.brand.homeDescription) }
  ]
})
</script>
