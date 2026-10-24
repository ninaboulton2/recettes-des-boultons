<template>
  <div class="space-y-6" data-testid="explore-page">
    <div>
      <UButton :to="localePath('/recettes')" variant="link" color="neutral" icon="i-lucide-arrow-left" size="sm" class="-ml-2" :label="$t('explore.back')" />
    </div>

    <LoadingState v-if="profilePending" :message="$t('explore.loading')" />

    <!-- Personne inconnue, invisible ou lien erroné : même page neutre, sans rien révéler -->
    <EmptyState
      v-else-if="!profile"
      icon="i-lucide-user-x"
      :title="$t('explore.notFound.title')"
      :message="$t('explore.notFound.description')"
      data-testid="explore-not-found"
    >
      <template #action>
        <UButton :to="localePath('/recettes')" color="neutral" variant="outline" :label="$t('explore.notFound.action')" />
      </template>
    </EmptyState>

    <template v-else>
      <header class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="text-sm font-medium uppercase tracking-wide text-primary">{{ $t('explore.eyebrow', { author: authorName }) }}</p>
          <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl" data-testid="explore-title">{{ heading }}</h1>
          <p class="mt-2 text-muted">{{ $t('explore.subtitle', { author: authorName }) }}</p>
        </div>
        <UButton
          v-if="notYetAdded > 0 || (totalPages > 1 && !addedEverything)"
          icon="i-lucide-library-big"
          :label="$t('explore.addAll')"
          :loading="addingAll"
          :disabled="busyId !== null"
          data-testid="explore-add-all"
          @click="addAll"
        />
        <p v-else-if="items.length > 0" class="inline-flex items-center gap-1.5 text-sm text-muted" data-testid="explore-all-added">
          <UIcon name="i-lucide-check-circle-2" class="size-4 text-primary" aria-hidden="true" />
          {{ $t('explore.allAdded') }}
        </p>
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
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-6" data-testid="explore-grid">
          <SharedRecipeCard v-for="recipe in items" :key="recipe.id" :recipe="recipe">
            <template #actions>
              <span v-if="recipe.inCookbook" class="inline-flex items-center gap-1.5 text-sm text-muted" data-testid="in-cookbook">
                <UIcon name="i-lucide-check" class="size-4 text-primary" aria-hidden="true" />
                {{ $t('explore.inCookbook') }}
              </span>
              <UButton
                v-else
                size="sm"
                icon="i-lucide-bookmark-plus"
                :label="$t('explore.add')"
                :loading="busyId === recipe.id"
                :disabled="busyId !== null || addingAll"
                data-testid="explore-add"
                @click="add(recipe)"
              />
            </template>
          </SharedRecipeCard>
        </div>
        <RecipePagination v-if="totalPages > 1" v-model:page="page" :total="totalCount" :items-per-page="COOKBOOK_PAGE_SIZE" />
      </template>

      <EmptyState v-else icon="i-lucide-chef-hat" :title="$t('explore.empty.title')" :message="$t('explore.empty.description', { author: authorName })" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { COOKBOOK_PAGE_SIZE } from '#shared/schemas/cookbook'
import { uuidSchema } from '#shared/schemas/common'
import type { AuthorRecipe } from '#shared/utils/cookbook'
import { sharingErrorKey } from '#shared/utils/recipeRights'

/**
 * « Explorer les recettes de X » (v2) : ses recettes que je peux lire (`list_author_recipes`), « Ajouter » une par une ou
 * « Tout ajouter » (`add_author_recipes_to_cookbook`, qui ferme aussi la bannière). Rejoindre un groupe n'ajoute rien :
 * l'ajout au carnet est toujours un geste explicite. En-tête : pseudonyme et titre du carnet de X (`get_user_profile`).
 */
definePageMeta({ middleware: 'v2-only' })

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { $toast } = useNuxtApp()
const { toUserMessage } = useApiError()
const cookbook = useCookbook()
const friends = useFriends()
const recipesStore = useRecipesStore()
const authStore = useAuthStore()

const authorId = computed(() => {
  const value = route.params.authorId
  const id = Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
  return uuidSchema.safeParse(id).success ? id : null
})

const { data: profile, pending: profilePending } = await useAsyncData(
  () => `explore-profile:${authorId.value}`,
  async () => (authorId.value ? await friends.getUserProfile({ userId: authorId.value }).catch(() => null) : null),
  { watch: [authorId], default: () => null }
)

// Ma propre page n'a rien à explorer : retour à mon carnet.
if (profile.value?.isSelf || (authorId.value && authorId.value === authStore.currentUser?.id)) {
  await navigateTo(localePath('/recettes'), { replace: true })
}

const authorName = computed(() => profile.value?.displayName ?? t('prompts.someone'))
const heading = computed(() => profile.value?.cookbookTitle?.trim() || t('explore.defaultTitle', { author: authorName.value }))

const page = ref(1)
const { data, status, error, refresh } = await useAsyncData(
  () => `explore-recipes:${authorId.value}`,
  async () => {
    if (!authorId.value || !profile.value) return { items: [] as AuthorRecipe[], totalCount: 0 }
    return await cookbook.listAuthorRecipes({ authorId: authorId.value, page: page.value, pageSize: COOKBOOK_PAGE_SIZE })
  },
  { default: () => ({ items: [] as AuthorRecipe[], totalCount: 0 }), watch: [page, authorId] }
)
const items = computed(() => data.value.items)
const totalCount = computed(() => data.value.totalCount)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / COOKBOOK_PAGE_SIZE)))
// « Tout ajouter » concerne toutes les pages : le nombre exact est dans le retour de la RPC ; ici, ce qui reste à ajouter sur la page affichée.
const notYetAdded = computed(() => items.value.filter(recipe => !recipe.inCookbook).length)

/** Après « Tout ajouter », même s'il y a plusieurs pages, plus rien à proposer. */
const addedEverything = ref(false)

const busyId = ref<string | null>(null)
const addingAll = ref(false)

const failure = (cause: unknown) => $toast.error(t(sharingErrorKey(cause) === 'errors.generic' ? 'explore.error' : sharingErrorKey(cause)))

async function add(recipe: AuthorRecipe): Promise<void> {
  busyId.value = recipe.id
  try {
    await cookbook.addToCookbook({ recipeId: recipe.id })
    $toast.success(t('shared.added', { title: recipe.title }))
    recipesStore.refresh()
    await refresh()
  } catch (cause) {
    failure(cause)
  } finally {
    busyId.value = null
  }
}

async function addAll(): Promise<void> {
  if (!authorId.value) return
  addingAll.value = true
  try {
    const count = await cookbook.addAuthorRecipesToCookbook({ authorId: authorId.value })
    addedEverything.value = true
    $toast.success(t('explore.addedAll', { n: count }, count))
    recipesStore.refresh()
    await refresh()
  } catch (cause) {
    failure(cause)
  } finally {
    addingAll.value = false
  }
}

useHead({
  title: () => heading.value,
  meta: [{ name: 'robots', content: 'noindex' }]
})
</script>
