<template>
  <ComingSoon :title="$t('comingSoon.groups')" icon="i-lucide-users-round" />
</template>

<script setup lang="ts">
// Page v2 de la phase 6B-6E : seulement l'emplacement (navigation, accès réservé à v2 + connexion).
definePageMeta({ middleware: 'v2-only' })
const { t } = useI18n()
useHead({ title: () => t('comingSoon.groups') })
</script>
