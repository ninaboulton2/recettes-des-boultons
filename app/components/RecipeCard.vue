<template>
  <article
    class="group relative flex h-full flex-col overflow-hidden rounded-xl border border-default bg-default transition-colors hover:border-accented focus-within:border-accented"
  >
    <!-- Visuel : photo (bucket Storage `recipe-photos`, optimisée par @nuxt/image)
         ou icône de catégorie -->
    <div class="relative aspect-[4/3] overflow-hidden bg-muted">
      <NuxtImg
        v-if="photoUrl"
        :src="photoUrl"
        alt=""
        sizes="xs:100vw sm:50vw lg:33vw xl:25vw"
        :width="400"
        :height="300"
        fit="cover"
        format="webp"
        loading="lazy"
        decoding="async"
        class="size-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
      />
      <div v-else class="flex size-full items-center justify-center">
        <UIcon :name="categoryIcon(recipe.category)" class="size-10 text-dimmed" aria-hidden="true" />
      </div>

      <div class="absolute right-2 top-2 z-10 flex flex-col gap-1">
        <UButton
          icon="i-lucide-heart"
          :color="isFavorite ? 'error' : 'neutral'"
          :variant="isFavorite ? 'soft' : 'outline'"
          size="sm"
          square
          :class="!isFavorite && 'bg-default/90'"
          :aria-label="isFavorite ? $t('ui.card.favoriteRemove') : $t('ui.card.favoriteAdd')"
          :aria-pressed="isFavorite"
          @click="toggleFavorite"
        />
        <template v-if="showAdminActions">
          <UButton icon="i-lucide-pencil" color="neutral" variant="outline" size="sm" square class="bg-default/90" :aria-label="$t('ui.card.edit')" @click="emit('edit', recipe)" />
          <UButton icon="i-lucide-trash" color="error" variant="outline" size="sm" square class="bg-default/90" :aria-label="$t('ui.card.delete')" @click="emit('delete', recipe)" />
        </template>
      </div>
    </div>

    <div class="flex flex-1 flex-col gap-2 p-4">
      <h3 class="font-serif text-lg font-semibold leading-snug text-highlighted">
        <NuxtLink
          :to="localePath(`/recettes/${recipe.id}`)"
          class="after:absolute after:inset-0 after:rounded-xl focus:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-primary"
        >
          {{ recipe.title }}
        </NuxtLink>
      </h3>

      <p v-if="recipe.description" class="line-clamp-2 text-sm text-muted">
        {{ recipe.description }}
      </p>

      <div class="mt-auto flex items-center justify-between gap-2 pt-1">
        <div class="flex items-center gap-3 text-xs text-muted">
          <span v-if="duration !== null" class="inline-flex items-center gap-1">
            <UIcon name="i-lucide-clock" class="size-3.5" aria-hidden="true" />
            {{ $t('ui.card.minutes', { n: duration }) }}
          </span>
          <span v-if="recipe.servings && recipe.servings > 0" class="inline-flex items-center gap-1">
            <UIcon name="i-lucide-users" class="size-3.5" aria-hidden="true" />
            {{ $t('ui.card.servings', { n: recipe.servings }) }}
          </span>
        </div>

        <div v-if="authStore.isAuthenticated" class="relative z-10 flex items-center">
          <UButton icon="i-lucide-shopping-cart" color="neutral" variant="ghost" size="sm" square :aria-label="$t('ui.card.addToList')" @click="showShoppingModal = true" />
          <UButton icon="i-lucide-calendar-plus" color="neutral" variant="ghost" size="sm" square :aria-label="$t('ui.card.addToPlanning')" @click="showPlanningModal = true" />
        </div>
      </div>

      <div v-if="recipe.tags.length > 0" class="flex flex-wrap gap-1">
        <UBadge v-for="tag in visibleTags" :key="tag" color="neutral" variant="subtle" size="sm" :label="tag" />
        <UBadge v-if="hiddenTagCount > 0" color="neutral" variant="outline" size="sm" :label="`+${hiddenTagCount}`" />
      </div>
    </div>

    <RecipeAddToListModal v-model:open="showShoppingModal" :recipe="recipe" />

    <PlanningModal :show="showPlanningModal" :recipe="recipe" @close="showPlanningModal = false" />
  </article>
</template>

<script setup lang="ts">
import type { Recipe, RecipeSummary } from '#shared/types'
import { totalTime } from '#shared/utils/recipes'

const MAX_TAGS = 3

const props = withDefaults(defineProps<{
  /** Résumé (liste) ou recette complète (fiche). */
  recipe: RecipeSummary | Recipe
  showAdminActions?: boolean
}>(), {
  showAdminActions: false
})

const emit = defineEmits<{
  edit: [recipe: RecipeSummary]
  delete: [recipe: RecipeSummary]
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const favoritesStore = useFavoritesStore()
const authStore = useAuthStore()
const { $toast } = useNuxtApp()
const { categoryIcon } = useCategories()
const { publicUrl } = useRecipePhoto()

const isFavorite = computed(() => favoritesStore.isFavorite(props.recipe.id))
// Cœur : favoris chargés une seule fois par utilisateur (attendus en SSR).
useFavoritesLoader()
const duration = computed(() => totalTime(props.recipe))
const visibleTags = computed(() => props.recipe.tags.slice(0, MAX_TAGS))
const hiddenTagCount = computed(() => Math.max(0, props.recipe.tags.length - MAX_TAGS))

/** URL publique de la photo dans le bucket Storage `recipe-photos`. */
const photoUrl = computed(() => publicUrl(props.recipe.photoPath))

const showPlanningModal = ref(false)
const showShoppingModal = ref(false)

const toggleFavorite = async () => {
  if (!authStore.isAuthenticated) {
    $toast.info(t('ui.card.loginRequired'))
    return
  }
  const wasFavorite = isFavorite.value
  const result = await favoritesStore.toggleFavorite(props.recipe.id)
  if (result.success) {
    $toast.success(wasFavorite ? t('recipeDetail.actions.favoriteRemoved') : t('recipeDetail.actions.favoriteAdded'))
  } else {
    $toast.error(t('ui.favorites.error'), result.error || '')
  }
}
</script>
