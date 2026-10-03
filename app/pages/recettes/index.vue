<template>
  <div class="space-y-6">
    <header class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl">{{ $t('recipes.title') }}</h1>
        <p class="mt-2 text-muted">{{ $t('recipes.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-3">
        <ActionLoading v-if="recipesStore.isLoading" :message="$t('ui.common.updating')" />
        <UDropdownMenu v-if="authStore.isAdmin" :items="newRecipeItems" :content="{ align: 'end' }">
          <UButton icon="i-lucide-plus" trailing-icon="i-lucide-chevron-down" :label="$t('recipes.new.label')" />
        </UDropdownMenu>
      </div>
    </header>

    <RecipeFilters
      v-model:query="searchQuery"
      v-model:category="selectedCategory"
      v-model:tags="selectedTags"
      :available-tags="availableTags"
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
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6">
        <RecipeCard
          v-for="recipe in recipes"
          :key="recipe.id"
          :recipe="recipe"
          :show-admin-actions="authStore.isAdmin"
          @edit="editRecipe"
          @delete="confirmDeleteRecipe"
        />
      </div>

      <RecipePagination v-if="totalPages > 1" v-model:page="page" :total="totalCount" :items-per-page="pageSize" />
    </template>

    <EmptyState v-else icon="i-lucide-search-x" :title="$t('recipes.empty.title')" :message="$t('recipes.empty.description')">
      <template #action>
        <UButton color="neutral" variant="outline" icon="i-lucide-filter-x" :label="$t('recipes.empty.clearFilters')" @click="clearFilters" />
      </template>
    </EmptyState>

    <RecipeEditor :show="showRecipeEditor" :recipe="editingRecipe" @close="closeRecipeEditor" @save="onRecipeSaved" />

    <UModal
      :open="recipeToDelete !== null"
      :title="$t('ui.deleteRecipe.title')"
      :description="recipeToDelete ? $t('ui.deleteRecipe.message', { title: recipeToDelete.title }) : ''"
      :ui="{ footer: 'justify-end' }"
      @update:open="value => !value && closeDeleteModal()"
    >
      <template #footer>
        <UButton :label="$t('ui.common.cancel')" color="neutral" variant="ghost" @click="closeDeleteModal" />
        <UButton :label="$t('ui.common.delete')" color="error" icon="i-lucide-trash-2" :loading="deleting" @click="deleteRecipe" />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Recipe, RecipeSummary } from '#shared/types'
import type { Database } from '#shared/types/database'

const { t } = useI18n()
const localePath = useLocalePath()
const recipesStore = useRecipesStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const supabase = useSupabaseClient<Database>()
const { $toast } = useNuxtApp()

// Paramètres d'URL (SSR) : ?category= (liens de l'accueil) et ?page=
const categoryFromUrl = route.query.category
if (typeof categoryFromUrl === 'string' && categoryFromUrl !== recipesStore.currentCategory) {
  recipesStore.setCategory(categoryFromUrl || null)
}
const pageFromUrl = Number.parseInt(typeof route.query.page === 'string' ? route.query.page : '', 10)
const page = ref(Number.isFinite(pageFromUrl) && pageFromUrl > 0 ? pageFromUrl : 1)

// Filtres : l'état d'interface vit dans le store (conservé entre les pages)
const searchQuery = computed({
  get: () => recipesStore.searchQuery,
  set: value => recipesStore.setSearchQuery(value)
})
const selectedCategory = computed({
  get: () => recipesStore.currentCategory,
  set: value => recipesStore.setCategory(value || null)
})
const selectedTags = computed({
  get: () => recipesStore.selectedTags,
  set: (value) => {
    for (const tag of recipesStore.selectedTags.filter(tag => !value.includes(tag))) recipesStore.toggleTag(tag)
    for (const tag of value.filter(tag => !recipesStore.selectedTags.includes(tag))) recipesStore.toggleTag(tag)
  }
})

// Recherche : la RPC n'est appelée qu'après une courte pause de saisie
const debouncedQuery = ref(recipesStore.searchQuery)
let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch(searchQuery, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { debouncedQuery.value = value }, 300)
})
onUnmounted(() => clearTimeout(debounceTimer))

// Retour à la première page quand les filtres changent
watch([debouncedQuery, selectedCategory, () => selectedTags.value.join('\u0000')], () => {
  page.value = 1
})

// Garde la catégorie et la page dans l'URL (rechargement, partage)
watch([page, selectedCategory], ([newPage, newCategory]) => {
  const query = { ...route.query }
  if (newPage > 1) query.page = String(newPage)
  else delete query.page
  if (newCategory) query.category = newCategory
  else delete query.category
  router.replace({ query })
})

// Changement de page : revenir en haut de la liste
watch(page, () => {
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
})

// Liste paginée (RPC search_recipes, SSR)
const { recipes, totalCount, totalPages, pageSize, status, error, refresh } = useRecipeSearch('index', {
  query: debouncedQuery,
  category: selectedCategory,
  tags: selectedTags,
  page
})

// Tags disponibles pour la catégorie courante (facettes)
const facets = useRecipeFacets()
const availableTags = computed(() => facets.tagsForCategory(recipesStore.currentCategory))

const clearFilters = () => recipesStore.clearFilters()

// Création (saisie manuelle ou import IA) et édition : l'éditeur a besoin des sections
const showRecipeEditor = ref(false)
const editingRecipe = ref<Recipe | null>(null)

const newRecipeItems = computed<DropdownMenuItem[]>(() => [
  { label: t('recipes.new.manual'), icon: 'i-lucide-pencil-line', onSelect: () => openEditor(null) },
  { label: t('recipes.new.ai'), icon: 'i-lucide-sparkles', to: localePath('/traducteur') }
])

const openEditor = (recipe: Recipe | null) => {
  editingRecipe.value = recipe
  showRecipeEditor.value = true
}

const editRecipe = async (recipe: RecipeSummary) => {
  try {
    const full = await fetchRecipeById(supabase, recipe.id)
    if (full) openEditor(full)
  } catch {
    $toast.error(t('ui.editRecipe.loadError'))
  }
}

const closeRecipeEditor = () => {
  showRecipeEditor.value = false
  editingRecipe.value = null
  // La liste observe recipesStore.revision : elle se recharge seule après un enregistrement
}

/** Après une création, on ouvre la fiche de la nouvelle recette. */
const onRecipeSaved = (saved: Recipe) => {
  const created = editingRecipe.value === null
  closeRecipeEditor()
  if (created) void navigateTo(localePath(`/recettes/${saved.id}`))
}

// Suppression (photos du bucket comprises : voir recipesStore.deleteRecipe)
const deleting = ref(false)
const recipeToDelete = ref<RecipeSummary | null>(null)

const confirmDeleteRecipe = (recipe: RecipeSummary) => {
  recipeToDelete.value = recipe
}

const deleteRecipe = async () => {
  if (!recipeToDelete.value) return
  deleting.value = true
  try {
    await recipesStore.deleteRecipe(recipeToDelete.value.id)
    recipeToDelete.value = null
    $toast.success(t('ui.deleteRecipe.success'))
  } catch (deleteError) {
    $toast.error(t('ui.deleteRecipe.error'), toUserMessage(deleteError))
  } finally {
    deleting.value = false
  }
}

/** Fermeture par l'utilisateur (Annuler, Échap, fond), ignorée pendant la suppression. */
const closeDeleteModal = () => {
  if (!deleting.value) recipeToDelete.value = null
}

useHead({
  title: () => t('navigation.recipes'),
  meta: [{ name: 'description', content: () => t('recipes.subtitle') }]
})
</script>
