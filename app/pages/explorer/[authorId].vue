<template>
  <ComingSoon :title="$t('comingSoon.explore')" icon="i-lucide-compass" />
</template>

<script setup lang="ts">
// Phase 6B : « Explorer les recettes de X » (list_author_recipes, boutons « ajouter » / « tout ajouter »).
// Les bannières de l'accueil (PromptBanners) mènent déjà ici.
definePageMeta({ middleware: 'v2-only' })
const { t } = useI18n()
useHead({ title: () => t('comingSoon.explore') })
</script>
