<template>
  <div>
    <!-- Héros d'origine : diagonale bleu-vert / fond, pleine largeur, 72vh.
         `mx-[calc(50%-50vw)]` sort du conteneur du layout (le <main> coupe
         le débord horizontal) ; marge haute négative = collé à l'en-tête. -->
    <section
      class="diagonal-bg relative mx-[calc(50%-50vw)] -mt-6 overflow-hidden md:-mt-8"
      aria-labelledby="hero-title"
      data-testid="home-hero"
    >
      <UContainer class="flex min-h-[72vh] flex-col items-center justify-between gap-10 py-10 lg:flex-row lg:gap-16 lg:py-16">
        <!-- Texte à gauche -->
        <div class="flex w-full flex-1 flex-col items-start">
          <h1 id="hero-title" class="mb-6 font-lobster text-5xl leading-tight text-white drop-shadow-lg md:text-6xl">
            {{ siteName }}
          </h1>
          <p class="mb-8 max-w-md text-xl font-bold text-white md:text-2xl md:font-semibold">
            {{ tagline }}
          </p>
          <UButton
            size="xl"
            trailing-icon="i-lucide-arrow-down"
            :label="$t('home.viewRecipes')"
            class="bg-white px-6 text-(--ui-color-primary-800) shadow-lg hover:bg-(--ui-color-primary-50) active:bg-(--ui-color-primary-100)"
            @click="scrollToCategories"
          />
        </div>

        <!-- Illustration à droite : carte claire dans les deux modes (PNG
             transparent dessiné pour un fond blanc). -->
        <div v-if="heroImage" class="flex w-full flex-1 items-center justify-center lg:w-auto">
          <div class="w-full max-w-[500px] rounded-3xl bg-white p-6 shadow-2xl sm:p-8 md:p-12">
            <NuxtImg
              :src="heroImage.src"
              :alt="text(heroImage.alt)"
              :width="420"
              :height="420"
              sizes="xs:90vw sm:420px"
              format="webp"
              loading="eager"
              fetchpriority="high"
              class="mx-auto h-auto w-full max-w-[420px] object-contain"
            />
          </div>
        </div>
      </UContainer>
    </section>

    <!-- Catégories (illustrations) -->
    <section id="categories" class="scroll-mt-20 py-12 md:scroll-mt-24 md:py-16" aria-labelledby="categories-title">
      <div class="mb-8 text-center md:mb-12">
        <h2 id="categories-title" class="mb-3 font-serif text-3xl font-semibold text-highlighted md:text-4xl">
          {{ $t('home.categories.titleBoultons') }}
        </h2>
        <p v-if="facets.totalCount.value > 0" class="text-lg text-muted md:text-xl">
          {{ $t('recipes.count', facets.totalCount.value) }}
        </p>
      </div>
      <CategoryGrid :categories="categories" :counts="facets.countsByCategory.value" />
    </section>

    <!-- Fonctionnalités -->
    <section class="py-12 md:py-16" aria-labelledby="features-title">
      <div class="mb-8 text-center md:mb-12">
        <h2 id="features-title" class="mb-3 font-serif text-3xl font-semibold text-highlighted md:text-4xl">
          {{ $t('home.features.title') }}
        </h2>
        <p class="text-lg text-muted md:text-xl">{{ $t('home.features.subtitle') }}</p>
      </div>
      <div class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="feature in HOME_FEATURES" :key="feature.key" class="text-center">
          <div class="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10">
            <UIcon :name="feature.icon" class="size-8 text-primary" aria-hidden="true" />
          </div>
          <h3 class="mb-2 text-xl font-semibold text-highlighted">{{ $t(`home.features.${feature.key}.title`) }}</h3>
          <p class="text-muted">{{ $t(`home.features.${feature.key}.description`) }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * Accueil de l'édition Boultons : reprise de la page d'origine (commit
 * 6a9a207) avec les composants actuels, i18n, mode sombre et mobile.
 */
const { config, siteName, tagline, text } = useEdition()
const heroImage = config.home.heroImage

// Compteurs par catégorie (requête légère, rendue côté serveur)
const facets = useRecipeFacets()
const { categories } = useCategories()

const scrollToCategories = () => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById('categories')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
}
</script>
