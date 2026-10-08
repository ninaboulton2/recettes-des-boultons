<template>
  <header class="space-y-5">
    <!-- Photo (ou icône de repli) -->
    <div
      class="relative overflow-hidden rounded-xl border border-default bg-muted print:max-h-64"
      :class="photoUrl ? 'aspect-video print:aspect-auto' : 'h-36 sm:h-44 print:hidden'"
    >
      <!-- Image principale (LCP) : chargée tout de suite, préchargée, optimisée par @nuxt/image. -->
      <NuxtImg
        v-if="photoUrl"
        :src="photoUrl"
        :alt="$t('recipeDetail.photoAlt', { title: recipe.title })"
        sizes="xs:100vw md:768px lg:896px"
        :width="896"
        :height="504"
        fit="cover"
        format="webp"
        loading="eager"
        fetchpriority="high"
        :preload="{ fetchPriority: 'high' }"
        class="h-full w-full object-cover"
      />
      <!-- Sans photo : illustration de la catégorie (édition qui en fournit), cadre blanc. -->
      <div v-else-if="fallback.type === 'image'" class="flex h-full w-full items-center justify-center p-3 print:hidden">
        <div class="aspect-square h-full rounded-lg bg-white p-2">
          <NuxtImg
            :src="fallback.src"
            :alt="$t('recipeDetail.categoryIllustrationAlt', { category: categoryLabel })"
            :width="160"
            :height="160"
            densities="x1 x2"
            format="webp"
            class="size-full object-contain"
          />
        </div>
      </div>
      <div v-else class="flex h-full w-full flex-col items-center justify-center gap-2 text-muted print:hidden">
        <UIcon name="i-lucide-chef-hat" class="size-14" aria-hidden="true" />
        <span class="text-xs">{{ $t('recipeDetail.noPhoto') }}</span>
      </div>
    </div>

    <!-- Catégorie, tags, titre, description -->
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge color="primary" variant="subtle" size="md">
          {{ categoryLabel }}
        </UBadge>
        <UBadge v-for="tag in recipe.tags" :key="tag" color="neutral" variant="outline" size="md">
          {{ tag }}
        </UBadge>
      </div>
      <h1 class="font-serif text-3xl font-semibold leading-tight text-highlighted sm:text-4xl">
        {{ recipe.title }}
      </h1>
      <p v-if="recipe.description" class="text-base text-muted sm:text-lg">
        {{ recipe.description }}
      </p>
    </div>

    <!-- Temps et portions -->
    <dl class="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-default py-3 text-sm text-muted">
      <div v-if="recipe.prepTime" class="flex items-center gap-1.5">
        <UIcon name="i-lucide-timer" class="size-4" aria-hidden="true" />
        <dt>{{ $t('recipeDetail.prepTime') }}</dt>
        <dd class="font-medium text-default">{{ $t('recipeDetail.minutes', { n: recipe.prepTime }) }}</dd>
      </div>
      <div v-if="recipe.cookTime" class="flex items-center gap-1.5">
        <UIcon name="i-lucide-flame" class="size-4" aria-hidden="true" />
        <dt>{{ $t('recipeDetail.cookTime') }}</dt>
        <dd class="font-medium text-default">{{ $t('recipeDetail.minutes', { n: recipe.cookTime }) }}</dd>
      </div>
      <div v-if="total !== null && recipe.prepTime && recipe.cookTime" class="flex items-center gap-1.5">
        <UIcon name="i-lucide-clock" class="size-4" aria-hidden="true" />
        <dt>{{ $t('recipeDetail.totalTime') }}</dt>
        <dd class="font-medium text-default">{{ $t('recipeDetail.minutes', { n: total }) }}</dd>
      </div>
      <div v-if="canScale || recipe.servings" class="flex items-center gap-2 sm:ml-auto">
        <UIcon name="i-lucide-users" class="size-4" aria-hidden="true" />
        <dt class="sr-only">{{ $t('recipeDetail.servings') }}</dt>
        <dd>
          <RecipeServingsControl
            v-if="canScale && servings !== null"
            :model-value="servings"
            :base="baseServings"
            @update:model-value="emit('update:servings', $event)"
          />
          <span v-else class="font-medium text-default">
            {{ $t('recipeDetail.servingsCount', { count: recipe.servings ?? 0 }, recipe.servings ?? 0) }}
          </span>
        </dd>
      </div>
    </dl>

    <p v-if="isScaled && servings !== null && baseServings !== null" class="text-sm text-primary print:hidden">
      <UIcon name="i-lucide-scale" class="mr-1 inline size-4 align-text-bottom" aria-hidden="true" />
      {{ $t('recipeDetail.scaledNote', { count: servings, base: baseServings }) }}
    </p>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Recipe } from '#shared/types'
import { categoryI18nKey, totalTime } from '#shared/utils/recipes'

/** En-tête de la fiche : photo, catégorie, titre, temps, compteur de portions. */
const props = withDefaults(defineProps<{
  recipe: Recipe
  /** Portions cibles (compteur) ; `null` si la recette n'en a pas. */
  servings?: number | null
  baseServings?: number | null
  canScale?: boolean
  isScaled?: boolean
}>(), {
  servings: null,
  baseServings: null,
  canScale: false,
  isScaled: false
})

const emit = defineEmits<{ 'update:servings': [value: number] }>()

const { t, te } = useI18n()
const { publicUrl } = useRecipePhoto()

const photoUrl = computed(() => publicUrl(props.recipe.photoPath))
const { categoryVisual } = useCategories()
const fallback = computed(() => categoryVisual(props.recipe.category))
const total = computed(() => totalTime(props.recipe))
const categoryLabel = computed(() => {
  const key = categoryI18nKey(props.recipe.category)
  return te(key) ? t(key) : props.recipe.category
})
</script>
