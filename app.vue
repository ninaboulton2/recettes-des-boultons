<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup>
// Configuration globale de l'application
useHead({
  title: $t('meta.title'),
  meta: [
    { name: 'description', content: $t('meta.description') }
  ]
})
</script> 