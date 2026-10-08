<template>
  <div class="space-y-16 md:space-y-24">
    <!-- Héros -->
    <section class="flex flex-col items-start gap-6 pt-6 md:pt-12">
      <UBadge v-if="facets.totalCount.value > 0" color="primary" variant="soft" size="lg" icon="i-lucide-chef-hat">
        {{ $t('recipes.count', facets.totalCount.value) }}
      </UBadge>
      <h1 class="max-w-3xl font-serif text-4xl font-semibold leading-tight text-highlighted sm:text-5xl md:text-6xl">
        {{ siteName }}
      </h1>
      <p class="max-w-xl text-lg text-muted md:text-xl">
        {{ tagline }}
      </p>
      <div class="flex flex-wrap gap-3">
        <UButton :to="localePath('/recettes')" size="xl" icon="i-lucide-book-open" :label="$t('home.viewRecipes')" />
        <UButton
          v-if="authStore.isAdmin"
          :to="localePath('/traducteur')"
          size="xl"
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
          :label="$t('home.addRecipe')"
        />
      </div>
    </section>

    <!-- Catégories -->
    <section id="categories" aria-labelledby="categories-title">
      <div class="mb-6 md:mb-8">
        <h2 id="categories-title" class="font-serif text-2xl font-semibold text-highlighted md:text-3xl">
          {{ $t('home.categories.title') }}
        </h2>
        <p class="mt-2 text-muted">{{ $t('home.categories.subtitle') }}</p>
      </div>
      <CategoryGrid :categories="categories" :counts="facets.countsByCategory.value" />
    </section>

    <!-- Fonctionnalités -->
    <section aria-labelledby="features-title" class="border-t border-default pt-12 md:pt-16">
      <div class="mb-6 md:mb-8">
        <h2 id="features-title" class="font-serif text-2xl font-semibold text-highlighted md:text-3xl">
          {{ $t('home.features.title') }}
        </h2>
        <p class="mt-2 text-muted">{{ $t('home.features.subtitle') }}</p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="feature in HOME_FEATURES" :key="feature.key" class="rounded-xl border border-default p-5">
          <div class="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <UIcon :name="feature.icon" class="size-5 text-primary" aria-hidden="true" />
          </div>
          <h3 class="font-semibold text-highlighted">{{ $t(`home.features.${feature.key}.title`) }}</h3>
          <p class="mt-1 text-sm text-muted">{{ $t(`home.features.${feature.key}.description`) }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/** Accueil de l'édition générique : héros typographique allégé, catégories en icônes. */
const localePath = useLocalePath()
const authStore = useAuthStore()
const { siteName, tagline } = useEdition()

// Compteurs par catégorie (requête légère, rendue côté serveur)
const facets = useRecipeFacets()
const { categories } = useCategories()
</script>
