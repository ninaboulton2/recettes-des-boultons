<template>
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
    <NuxtLink
      v-for="category in categories"
      :key="category.id"
      :to="localePath({ path: '/recettes', query: { category: category.id } })"
      class="group flex flex-col overflow-hidden rounded-xl border border-default bg-default transition-colors hover:border-accented focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div class="flex aspect-[4/3] items-center justify-center bg-muted transition-colors group-hover:bg-elevated">
        <UIcon :name="category.icon" class="size-10 text-primary md:size-12" aria-hidden="true" />
      </div>
      <div class="flex flex-1 flex-col gap-0.5 p-3 md:p-4">
        <h3 class="font-serif text-base font-semibold leading-snug text-highlighted md:text-lg">
          {{ category.name }}
        </h3>
        <p v-if="counts" class="text-xs text-muted">
          {{ $t('recipes.count', counts[category.id] ?? 0) }}
        </p>
      </div>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import type { CategoryEntry } from '~/composables/useCategories'

defineProps<{
  categories: CategoryEntry[]
  /** Nombre de recettes par catégorie (facettes) ; masqué si absent. */
  counts?: Record<string, number> | null
}>()

const localePath = useLocalePath()
</script>
