<template>
  <div class="space-y-6" data-testid="cookbook-page">
    <header class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl">{{ cookbookTitle }}</h1>
        <p class="mt-2 text-muted">{{ $t('cookbook.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-3">
        <ActionLoading v-if="recipesStore.isLoading" :message="$t('ui.common.updating')" />
        <UDropdownMenu :items="newRecipeItems" :content="{ align: 'end' }">
          <UButton icon="i-lucide-plus" trailing-icon="i-lucide-chevron-down" :label="$t('recipes.new.label')" data-testid="new-recipe" />
        </UDropdownMenu>
      </div>
    </header>

    <!-- Bannières « Explorer les recettes de X » / « nouvelle recette » (pending_prompts) : dans Mon carnet, pas sur l'accueil -->
    <PromptBanners />

    <RecipeFilters
      v-model:query="searchQuery"
      v-model:category="selectedCategory"
      v-model:tags="noTags"
      :available-tags="[]"
      hide-tags
      :total-count="totalCount"
      @clear="clearFilters"
    />

    <RecipeGridSkeleton v-if="status === 'pending'" />

    <ErrorState
      v-else-if="error"
      :message="error.message"
      :retry-action="() => refresh()"
      :title="$t('recipes.loadError.title')"
      :retry-text="$t('recipes.loadError.retry')"
    />

    <template v-else-if="recipes.length > 0">
      <RecipeGrid :recipes="recipes" />
      <RecipePagination v-if="totalPages > 1" v-model:page="page" :total="totalCount" :items-per-page="pageSize" />
    </template>

    <!-- Carnet vide : trois façons de commencer -->
    <section v-else-if="isPristine" class="mx-auto max-w-2xl py-8 text-center" data-testid="cookbook-empty">
      <div class="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10">
        <UIcon name="i-lucide-book-open" class="size-8 text-primary" aria-hidden="true" />
      </div>
      <h2 class="font-serif text-2xl font-semibold text-highlighted">{{ $t('cookbook.empty.title') }}</h2>
      <p class="mt-2 text-muted">{{ $t('cookbook.empty.description') }}</p>
      <div class="mt-6 grid gap-3 sm:grid-cols-3">
        <button type="button" class="rounded-xl border border-default p-4 text-left transition-colors hover:border-accented" data-testid="empty-create" @click="openEditor">
          <UIcon name="i-lucide-pencil-line" class="mb-2 size-6 text-primary" aria-hidden="true" />
          <span class="block font-semibold text-highlighted">{{ $t('cookbook.empty.create.title') }}</span>
          <span class="mt-1 block text-sm text-muted">{{ $t('cookbook.empty.create.description') }}</span>
        </button>
        <NuxtLink :to="localePath('/traducteur')" class="rounded-xl border border-default p-4 text-left transition-colors hover:border-accented" data-testid="empty-import">
          <UIcon name="i-lucide-sparkles" class="mb-2 size-6 text-primary" aria-hidden="true" />
          <span class="block font-semibold text-highlighted">{{ $t('cookbook.empty.import.title') }}</span>
          <span class="mt-1 block text-sm text-muted">{{ $t('cookbook.empty.import.description') }}</span>
        </NuxtLink>
        <NuxtLink :to="localePath('/partagees')" class="rounded-xl border border-default p-4 text-left transition-colors hover:border-accented" data-testid="empty-explore">
          <UIcon name="i-lucide-compass" class="mb-2 size-6 text-primary" aria-hidden="true" />
          <span class="block font-semibold text-highlighted">{{ $t('cookbook.empty.explore.title') }}</span>
          <span class="mt-1 block text-sm text-muted">{{ $t('cookbook.empty.explore.description') }}</span>
        </NuxtLink>
      </div>
    </section>

    <EmptyState v-else icon="i-lucide-search-x" :title="$t('recipes.empty.title')" :message="$t('recipes.empty.description')">
      <template #action>
        <UButton color="neutral" variant="outline" icon="i-lucide-filter-x" :label="$t('recipes.empty.clearFilters')" @click="clearFilters" />
      </template>
    </EmptyState>

    <RecipeEditor :show="showRecipeEditor" :recipe="null" @close="showRecipeEditor = false" @save="onRecipeSaved" />
  </div>
</template>

<script setup lang="ts">
import { localizedCookbookTitle } from '#shared/utils/cookbookTitle'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Recipe } from '#shared/types'

/**
 * Mon carnet (v2, `/recettes`) : mes recettes + celles que j'ai ajoutées (`list_cookbook`), avec badge de provenance,
 * filtre par catégorie personnelle, recherche et pagination comme en v1. Créer, importer et supprimer : fiche et éditeur.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const recipesStore = useRecipesStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const cookbookTitle = computed(() => localizedCookbookTitle(authStore.profile?.cookbook_title, authStore.profile?.cookbook_title_i18n, locale.value) || t('navigation.myCookbook'))

// Paramètres d'URL : ?category= (liens de l'accueil) et ?page=
const categoryFromUrl = route.query.category
if (typeof categoryFromUrl === 'string' && categoryFromUrl !== recipesStore.currentCategory) {
  recipesStore.setCategory(categoryFromUrl || null)
}
const pageFromUrl = Number.parseInt(typeof route.query.page === 'string' ? route.query.page : '', 10)
const page = ref(Number.isFinite(pageFromUrl) && pageFromUrl > 0 ? pageFromUrl : 1)

const searchQuery = computed({
  get: () => recipesStore.searchQuery,
  set: value => recipesStore.setSearchQuery(value)
})
const selectedCategory = computed({
  get: () => recipesStore.currentCategory,
  set: value => recipesStore.setCategory(value || null)
})
// Le carnet ne se filtre pas par tag (la recherche les couvre) : valeur fixe pour le composant de filtres.
const noTags = computed({ get: () => [] as string[], set: () => undefined })

// Recherche : la RPC n'est appelée qu'après une courte pause de saisie
const debouncedQuery = ref(recipesStore.searchQuery)
let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch(searchQuery, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { debouncedQuery.value = value }, 300)
})
onUnmounted(() => clearTimeout(debounceTimer))

watch([debouncedQuery, selectedCategory], () => { page.value = 1 })

watch([page, selectedCategory], ([newPage, newCategory]) => {
  const query = { ...route.query }
  if (newPage > 1) query.page = String(newPage)
  else delete query.page
  if (newCategory) query.category = newCategory
  else delete query.category
  router.replace({ query })
})

watch(page, () => {
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
})

const { recipes, totalCount, totalPages, pageSize, status, error, refresh } = useRecipeSearch('index', {
  query: debouncedQuery,
  category: selectedCategory,
  page
})

/** Rien du tout dans le carnet (ni filtre ni recherche) : on propose de commencer. */
const isPristine = computed(() => totalCount.value === 0 && !debouncedQuery.value.trim() && !selectedCategory.value)

const clearFilters = () => recipesStore.clearFilters()

// Création : l'éditeur (toute personne connectée peut créer ses recettes)
const showRecipeEditor = ref(false)
const openEditor = () => { showRecipeEditor.value = true }
const newRecipeItems = computed<DropdownMenuItem[]>(() => [
  { label: t('recipes.new.manual'), icon: 'i-lucide-pencil-line', onSelect: openEditor },
  { label: t('recipes.new.ai'), icon: 'i-lucide-sparkles', to: localePath('/traducteur') }
])

/** Après une création, on ouvre la fiche de la nouvelle recette. */
const onRecipeSaved = (saved: Recipe) => {
  showRecipeEditor.value = false
  void navigateTo(localePath(`/recettes/${saved.id}`))
}

useHead({
  title: () => t('navigation.myCookbook'),
  meta: [{ name: 'description', content: () => t('cookbook.subtitle') }]
})
</script>
