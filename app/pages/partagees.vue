<template>
  <ComingSoon :title="$t('comingSoon.sharedWithMe')" icon="i-lucide-share-2" />
</template>

<script setup lang="ts">
// Page v2 de la phase 6B-6E : seulement l'emplacement (navigation, accès réservé à v2 + connexion).
definePageMeta({ middleware: 'v2-only' })
const { t } = useI18n()
useHead({ title: () => t('comingSoon.sharedWithMe') })
</script>
