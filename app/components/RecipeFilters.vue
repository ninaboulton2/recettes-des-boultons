<template>
  <div class="space-y-4 rounded-xl border border-default bg-muted/40 p-4">
    <div class="grid gap-3 md:grid-cols-3">
      <!--
        Libellé et champ reliés par un id FIXE : avec UFormField, l'id vient de
        useId() et différait entre SSR et client dans le build de production
        (label for="v-0-8-0", input id="v-0-0-1") ; le nom accessible du champ
        retombait alors sur le placeholder. Même rendu que UFormField (md).
      -->
      <div class="text-sm md:col-span-1">
        <label :for="SEARCH_INPUT_ID" class="block font-medium text-default">{{ $t('recipes.search.label') }}</label>
        <UInput
          :id="SEARCH_INPUT_ID"
          :model-value="query"
          type="search"
          icon="i-lucide-search"
          :placeholder="$t('recipes.search.placeholder')"
          class="mt-1 w-full"
          @update:model-value="emit('update:query', String($event ?? ''))"
        />
      </div>

      <UFormField :label="$t('recipes.filters.category.label')">
        <USelectMenu
          v-if="!lockedCategory"
          :model-value="categoryItem"
          :items="categoryItems"
          :placeholder="$t('recipes.filters.category.all')"
          :search-input="{ placeholder: $t('ui.common.search') }"
          icon="i-lucide-chef-hat"
          class="w-full"
          @update:model-value="emit('update:category', $event?.value ?? null)"
        />
        <UInput v-else :model-value="lockedCategory" disabled icon="i-lucide-chef-hat" class="w-full" />
      </UFormField>

      <UFormField :label="$t('recipes.filters.tags.label')">
        <USelectMenu
          :model-value="tags"
          :items="availableTags"
          multiple
          :disabled="availableTags.length === 0"
          :placeholder="availableTags.length === 0 ? $t('recipes.filters.tags.none') : $t('recipes.filters.tags.all')"
          :search-input="false"
          icon="i-lucide-tag"
          class="w-full"
          @update:model-value="emit('update:tags', $event)"
        />
      </UFormField>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap gap-1.5">
        <UBadge
          v-for="tag in tags"
          :key="tag"
          color="primary"
          variant="soft"
          size="md"
          as="button"
          type="button"
          trailing-icon="i-lucide-x"
          :label="tag"
          :aria-label="$t('ui.filters.removeTag', { tag })"
          @click="emit('update:tags', tags.filter(t => t !== tag))"
        />
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-muted">{{ $t('recipes.filters.count', totalCount) }}</span>
        <UButton
          v-if="hasFilters"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-filter-x"
          :label="$t('recipes.filters.clear')"
          @click="emit('clear')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Barre de filtres des listes de recettes : recherche, catégorie (ou
 * catégorie verrouillée sur la page de catégorie), tags.
 */

/** Id du champ de recherche (une seule barre de filtres par page). */
const SEARCH_INPUT_ID = 'recipe-search'
const props = defineProps<{
  query: string
  category: string | null
  tags: string[]
  availableTags: string[]
  totalCount: number
  /** Libellé de la catégorie imposée par l'URL (page catégorie) ; sélecteur masqué. */
  lockedCategory?: string
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  'update:category': [value: string | null]
  'update:tags': [value: string[]]
  'clear': []
}>()

const { t } = useI18n()
const { categories } = useCategories()

interface CategoryItem { label: string, value: string | null, icon: string }

// Première entrée « Toutes les catégories » (value null) : permet de retirer le
// filtre depuis la liste elle-même, et s'affiche quand aucune catégorie n'est choisie.
const allCategoriesItem = computed<CategoryItem>(() => ({
  label: t('recipes.filters.category.all'),
  value: null,
  icon: 'i-lucide-layout-grid'
}))

const categoryItems = computed<CategoryItem[]>(() => [
  allCategoriesItem.value,
  ...categories.value.map(category => ({ label: category.name, value: category.id, icon: category.icon }))
])

const categoryItem = computed(() =>
  categoryItems.value.find(item => item.value === (props.category ?? null)) ?? allCategoriesItem.value
)

const hasFilters = computed(() =>
  props.query.trim() !== '' || props.tags.length > 0 || (!props.lockedCategory && !!props.category)
)
</script>
