<template>
  <div class="mx-auto max-w-xl py-12 text-center" data-testid="coming-soon">
    <div class="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-primary/10">
      <UIcon :name="icon" class="size-8 text-primary" aria-hidden="true" />
    </div>
    <h1 class="font-serif text-3xl font-semibold text-highlighted">{{ title }}</h1>
    <p class="mt-3 text-muted">{{ description ?? $t('comingSoon.description') }}</p>
    <UButton class="mt-6" color="neutral" variant="outline" icon="i-lucide-arrow-left" :to="localePath('/')" :label="$t('comingSoon.back')" />
  </div>
</template>

<script setup lang="ts">
/** Écran « bientôt » minimal des pages v2 des phases 6B à 6E (la navigation est déjà en place). */
defineProps<{ title: string, icon: string, description?: string }>()
const localePath = useLocalePath()
</script>
