<template>
  <!-- Illustrations (édition Boultons) : cartes d'origine, image dans un cadre
       blanc arrondi, texte centré ; 3 colonnes dès md (9 catégories = 3 × 3). Icônes (générique) : zone basse, l'icône
       seule ne justifie pas un grand visuel. -->
  <div
    class="grid gap-3 md:gap-4"
    :class="hasImages ? 'mx-auto max-w-5xl grid-cols-2 md:grid-cols-3 md:gap-6' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'"
  >
    <NuxtLink
      v-for="category in categories"
      :key="category.id"
      :to="localePath({ path: '/recettes', query: { category: category.id } })"
      class="group flex flex-col overflow-hidden rounded-xl border border-default bg-default transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="hasImages ? 'p-2 text-center hover:border-accented motion-safe:hover:-translate-y-1 sm:p-3' : 'hover:border-accented'"
      data-testid="category-card"
    >
      <template v-if="category.visual.type === 'image'">
        <div class="aspect-[4/3] overflow-hidden rounded-lg bg-white p-2">
          <NuxtImg
            :src="category.visual.src"
            :alt="$t('home.categories.imageAlt', { name: category.name })"
            :width="280"
            :height="280"
            densities="x1 x2"
            format="webp"
            loading="lazy"
            class="size-full object-contain transition-transform duration-300 motion-safe:group-hover:scale-105"
          />
        </div>
        <div class="flex flex-1 flex-col gap-1 px-1 pb-1 pt-3">
          <h3 class="font-serif text-base font-semibold leading-snug text-highlighted transition-colors group-hover:text-primary md:text-lg">
            {{ category.name }}
          </h3>
          <p class="hidden text-sm text-muted sm:block">{{ category.description }}</p>
          <p v-if="counts" class="mt-auto pt-1 text-xs text-muted">
            {{ $t('recipes.count', counts[category.id] ?? 0) }}
          </p>
        </div>
      </template>

      <template v-else>
        <div class="flex h-20 items-center justify-center bg-muted transition-colors group-hover:bg-elevated md:h-24">
          <UIcon :name="category.visual.name" class="size-8 text-primary" aria-hidden="true" />
        </div>
        <div class="flex flex-1 flex-col gap-0.5 p-3 md:p-4">
          <h3 class="font-serif text-base font-semibold leading-snug text-highlighted md:text-lg">
            {{ category.name }}
          </h3>
          <p v-if="counts" class="text-xs text-muted">
            {{ $t('recipes.count', counts[category.id] ?? 0) }}
          </p>
        </div>
      </template>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import type { CategoryEntry } from '~/composables/useCategories'

const props = defineProps<{
  categories: CategoryEntry[]
  /** Nombre de recettes par catégorie (facettes) ; masqué si absent. */
  counts?: Record<string, number> | null
}>()

const localePath = useLocalePath()

const hasImages = computed(() => props.categories.some(category => category.visual.type === 'image'))
</script>
