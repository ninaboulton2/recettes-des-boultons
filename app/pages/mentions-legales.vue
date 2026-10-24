<template>
  <LegalPage page="mentions" />
</template>

<script setup lang="ts">
// Page légale (v2) : 404 quand l'interrupteur v2 est éteint. Voir DEVELOPER.md § 20.13.
definePageMeta({ middleware: 'v2-enabled' })
</script>
