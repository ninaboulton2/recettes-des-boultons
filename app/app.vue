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
  ],
  link: [
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/images/logo.png' }
  ]
})
</script> 