<template>
  <div class="space-y-4 rounded-xl border border-default bg-muted/40 p-4">
    <div class="grid gap-3 md:grid-cols-3">
      <UFormField :label="$t('recipes.search.label')" class="md:col-span-1">
        <UInput
          :model-value="query"
          type="search"
          icon="i-lucide-search"
          :placeholder="$t('recipes.search.placeholder')"
          class="w-full"
          @update:model-value="emit('update:query', String($event ?? ''))"
        />
      </UFormField>

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

const { categories } = useCategories()

interface CategoryItem { label: string, value: string, icon: string }

const categoryItems = computed<CategoryItem[]>(() =>
  categories.value.map(category => ({ label: category.name, value: category.id, icon: category.icon }))
)

const categoryItem = computed(() => categoryItems.value.find(item => item.value === props.category))

const hasFilters = computed(() =>
  props.query.trim() !== '' || props.tags.length > 0 || (!props.lockedCategory && !!props.category)
)
</script>
