<template>
  <div class="space-y-6" data-testid="shared-page">
    <header>
      <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl">{{ $t('shared.title') }}</h1>
      <p class="mt-2 text-muted">{{ $t('shared.subtitle') }}</p>
    </header>

    <RecipeGridSkeleton v-if="status === 'pending' && items.length === 0" />

    <ErrorState
      v-else-if="error"
      :message="toUserMessage(error)"
      :retry-action="() => refresh()"
      :title="$t('recipes.loadError.title')"
      :retry-text="$t('recipes.loadError.retry')"
    />

    <template v-else-if="items.length > 0">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6" data-testid="shared-grid">
        <SharedRecipeCard v-for="recipe in items" :key="recipe.id" :recipe="recipe" :note="noteOf(recipe)">
          <template #actions>
            <UButton
              size="sm"
              icon="i-lucide-bookmark-plus"
              :label="$t('shared.add')"
              :loading="busyId === recipe.id && busyAction === 'add'"
              :disabled="busyId !== null"
              data-testid="shared-add"
              @click="add(recipe)"
            />
            <UButton
              v-if="canCopy(recipe.permission)"
              size="sm"
              color="neutral"
              variant="outline"
              icon="i-lucide-copy"
              :label="$t('shared.copy')"
              :loading="busyId === recipe.id && busyAction === 'copy'"
              :disabled="busyId !== null"
              data-testid="shared-copy"
              @click="copy(recipe)"
            />
          </template>
        </SharedRecipeCard>
      </div>
      <RecipePagination v-if="totalPages > 1" v-model:page="page" :total="totalCount" :items-per-page="COOKBOOK_PAGE_SIZE" />
    </template>

    <EmptyState v-else icon="i-lucide-share-2" :title="$t('shared.empty.title')" :message="$t('shared.empty.description')">
      <template #action>
        <UButton :to="localePath('/recettes')" color="neutral" variant="outline" icon="i-lucide-book-open" :label="$t('shared.empty.action')" />
      </template>
    </EmptyState>
  </div>
</template>

<script setup lang="ts">
import { COOKBOOK_PAGE_SIZE } from '#shared/schemas/cookbook'
import { canCopy, type SharedWithMeRecipe } from '#shared/utils/cookbook'
import { sharingErrorKey } from '#shared/utils/recipeRights'

/**
 * « Partagées avec moi » (v2) : `list_shared_with_me` — recettes lisibles par moi (droit direct, de groupe, ou partage « mes groupes »)
 * et pas encore dans mon carnet. « Ajouter à mon carnet » = référence (suit l'auteur) ; « Faire une copie » = ma propre recette.
 */
definePageMeta({ middleware: 'v2-only' })

const { t } = useI18n()
const localePath = useLocalePath()
const { $toast } = useNuxtApp()
const { toUserMessage } = useApiError()
const cookbook = useCookbook()
const recipesStore = useRecipesStore()

const page = ref(1)
const { data, status, error, refresh } = await useAsyncData(
  'shared-with-me',
  () => cookbook.listSharedWithMe({ page: page.value, pageSize: COOKBOOK_PAGE_SIZE }),
  { default: () => ({ items: [] as SharedWithMeRecipe[], totalCount: 0 }), watch: [page] }
)
const items = computed(() => data.value.items)
const totalCount = computed(() => data.value.totalCount)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / COOKBOOK_PAGE_SIZE)))

const noteOf = (recipe: SharedWithMeRecipe) => {
  const author = recipe.authorName ?? t('prompts.someone')
  return recipe.via === 'user' ? t('shared.noteUser', { author }) : t('shared.noteGroup', { author })
}

const busyId = ref<string | null>(null)
const busyAction = ref<'add' | 'copy' | null>(null)

async function run(recipe: SharedWithMeRecipe, action: 'add' | 'copy', work: () => Promise<void>): Promise<void> {
  busyId.value = recipe.id
  busyAction.value = action
  try {
    await work()
  } catch (failure) {
    const key = sharingErrorKey(failure)
    $toast.error(t(key === 'errors.generic' ? 'shared.error' : key))
  } finally {
    busyId.value = null
    busyAction.value = null
  }
}

// Titre dans la langue de l'interface (les cartes l'affichent déjà ainsi).
const { localizeCard } = useRecipeLocale()

const add = (recipe: SharedWithMeRecipe) => run(recipe, 'add', async () => {
  await cookbook.addToCookbook({ recipeId: recipe.id })
  $toast.success(t('shared.added', { title: localizeCard(recipe).title }))
  recipesStore.refresh()
  await refresh()
})

const copy = (recipe: SharedWithMeRecipe) => run(recipe, 'copy', async () => {
  const { id: copyId } = await cookbook.copyRecipeWithPhoto({ recipeId: recipe.id })
  $toast.success(t('shared.copied', { title: localizeCard(recipe).title }))
  recipesStore.refresh()
  await navigateTo(localePath(`/recettes/${copyId}`))
})

useHead({ title: () => t('shared.title') })
</script>
