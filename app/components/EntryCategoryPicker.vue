<template>
  <div class="flex items-center gap-2" :class="compact ? 'text-xs' : 'text-sm'">
    <label :for="selectId" :class="compact ? 'sr-only' : 'shrink-0 font-medium text-default'">{{ $t('entryCategory.label') }}</label>
    <select
      :id="selectId"
      class="min-w-0 max-w-full flex-1 rounded-md border border-default bg-default py-1 pl-2 pr-7 text-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
      :value="current ?? ''"
      :disabled="busy"
      data-testid="entry-category"
      @change="onChange(($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ $t('entryCategory.none') }}</option>
      <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { sharingErrorKey } from '#shared/utils/recipeRights'

/**
 * Rangement d'une recette AJOUTÉE (v2) dans l'une de MES catégories (`cookbook_entries.category_id`) ou « sans catégorie ».
 * Utilisé sur la fiche et sur la carte du carnet. La base refuse une catégorie qui n'est pas à moi (42501).
 */
const props = withDefaults(defineProps<{
  recipeId: string
  /** Catégorie actuelle (`null` : sans catégorie). */
  categoryId: string | null
  compact?: boolean
}>(), { compact: false })
const emit = defineEmits<{ changed: [categoryId: string | null] }>()

const { t } = useI18n()
const { $toast } = useNuxtApp()
const { categories } = useCategories()
const cookbook = useCookbook()
const recipesStore = useRecipesStore()
const selectId = `entry-category-${useId()}`

const current = ref<string | null>(props.categoryId)
watch(() => props.categoryId, (value) => { current.value = value })
const busy = ref(false)

async function onChange(value: string): Promise<void> {
  const next = value === '' ? null : value
  const previous = current.value
  current.value = next
  busy.value = true
  try {
    await cookbook.setEntryCategory({ recipeId: props.recipeId, categoryId: next })
    recipesStore.refresh()
    $toast.success(t('entryCategory.saved'))
    emit('changed', next)
  } catch (cause) {
    current.value = previous
    const key = sharingErrorKey(cause)
    $toast.error(t(key === 'errors.generic' ? 'entryCategory.error' : key))
  } finally {
    busy.value = false
  }
}
</script>
