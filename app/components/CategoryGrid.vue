<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
    <NuxtLink
      v-for="category in categories"
      :key="category.id"
      :to="`/recettes?category=${category.id}`"
      class="category-card group block focus:outline-hidden"
    >
      <div class="relative mb-4">
        <div class="bg-white rounded-lg shadow p-2 overflow-hidden">
          <NuxtImg
            :src="category.image"
            :alt="category.name"
            class="w-full h-48 object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      </div>
      <div class="space-y-2 text-center">
        <h3 class="text-xl font-semibold text-gray-900 group-hover:text-primary-600 transition-colors duration-200">
          {{ category.name }}
        </h3>
        <p class="text-gray-600 text-sm">
          {{ category.description }}
        </p>
        <p v-if="counts" class="text-xs text-gray-500">
          {{ $t('recipes.count', counts[category.id] ?? 0) }}
        </p>
      </div>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import type { Category } from '#shared/types'

defineProps<{
  categories: Category[]
  /** Nombre de recettes par catégorie (facettes) ; masqué si absent. */
  counts?: Record<string, number> | null
}>()
</script>
