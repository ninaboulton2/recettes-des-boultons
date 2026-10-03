<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6" aria-busy="true" aria-live="polite">
    <div v-for="n in count" :key="n" class="overflow-hidden rounded-xl border border-default">
      <USkeleton class="aspect-[4/3] w-full rounded-none" />
      <div class="space-y-3 p-4">
        <USkeleton class="h-5 w-3/4" />
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-1/2" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Squelettes de cartes recette pendant le chargement d'une liste. */
withDefaults(defineProps<{ count?: number }>(), { count: 8 })
</script>
