<template>
  <div class="grid gap-4 sm:grid-cols-2" data-testid="recipe-v2-options">
    <UFormField v-if="showCategory" :label="$t('cookbook.options.category')" name="categoryId" :error="categoryError || undefined">
      <USelectMenu
        :model-value="categoryId || undefined"
        :items="categoryItems"
        value-key="value"
        :placeholder="$t('cookbook.options.categoryPlaceholder')"
        :search-input="false"
        class="w-full"
        data-testid="option-category"
        @update:model-value="value => emit('update:categoryId', String(value ?? ''))"
      />
    </UFormField>

    <UFormField v-if="showVisibility" :label="$t('cookbook.options.visibility')" name="visibility" :class="showCategory ? '' : 'sm:col-span-2'">
      <URadioGroup
        :model-value="visibility"
        :items="visibilityItems"
        value-key="value"
        data-testid="option-visibility"
        @update:model-value="value => emit('update:visibility', value === 'private' ? 'private' : 'groups')"
      />
    </UFormField>
  </div>
</template>

<script setup lang="ts">
import type { RecipeVisibility } from '#shared/schemas/sharing'

/**
 * Réglages v2 d'une recette de l'AUTEUR : sa catégorie personnelle (`category_id`) et sa visibilité (`visibility`).
 * Partagé par l'éditeur et le traducteur. Un éditeur « modifier l'original » ne voit ni l'un ni l'autre : la base les ignore pour lui.
 */
const props = withDefaults(defineProps<{
  categoryId: string
  visibility: RecipeVisibility
  showCategory?: boolean
  showVisibility?: boolean
  categoryError?: string
}>(), { showCategory: true, showVisibility: true, categoryError: '' })

const emit = defineEmits<{ 'update:categoryId': [value: string], 'update:visibility': [value: RecipeVisibility] }>()

const { t } = useI18n()
const { categories } = useCategories()

const categoryItems = computed(() =>
  categories.value.map(category => ({ label: category.name, value: category.id, icon: category.icon }))
)

const visibilityItems = computed(() => [
  { value: 'groups', label: t('cookbook.options.visibilityGroups'), description: t('cookbook.options.visibilityGroupsHint') },
  { value: 'private', label: t('cookbook.options.visibilityPrivate'), description: t('cookbook.options.visibilityPrivateHint') }
])

void props
</script>
