<template>
  <UModal
    v-model:open="open"
    :title="$t('ui.addToList.title', { title: recipe.title })"
  >
    <template #body>
      <LoadingState v-if="loading" :message="$t('recipes.detail.ingredientsLoading')" />

      <div v-else class="space-y-5">
        <!-- Liste cible -->
        <UFormField :label="$t('ui.addToList.list')" required>
          <USelectMenu
            v-if="listItems.length > 0"
            v-model="selectedListId"
            :items="listItems"
            value-key="value"
            :search-input="false"
            icon="i-lucide-list-checks"
            class="w-full"
          />
          <UAlert
            v-else
            color="neutral"
            variant="soft"
            icon="i-lucide-info"
            :description="$t('ui.addToList.noLists')"
            :actions="[{ label: $t('ui.addToList.createList'), to: localePath('/courses'), icon: 'i-lucide-plus' }]"
          />
        </UFormField>

        <!-- Sections d'ingrédients -->
        <div v-if="sections.length > 0" class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-medium text-default">{{ $t('ui.addToList.sections') }}</p>
            <div class="flex gap-1">
              <UButton size="xs" variant="ghost" color="neutral" :label="$t('ui.common.selectAll')" @click="selectedSectionIds = sections.map(s => s.id)" />
              <UButton size="xs" variant="ghost" color="neutral" :label="$t('ui.common.deselectAll')" @click="selectedSectionIds = []" />
            </div>
          </div>

          <label
            v-for="section in sections"
            :key="section.id"
            class="flex cursor-pointer gap-3 rounded-lg border border-default p-3 transition-colors hover:bg-muted"
          >
            <UCheckbox
              :model-value="selectedSectionIds.includes(section.id)"
              class="mt-0.5"
              @update:model-value="toggleSection(section.id, $event === true)"
            />
            <div class="min-w-0 flex-1">
              <p class="font-medium text-highlighted">{{ section.name || $t('ui.addToList.unnamedSection') }}</p>
              <ul class="mt-1 space-y-0.5 text-sm text-muted">
                <li v-for="ingredient in section.ingredients" :key="ingredient.id">{{ formatIngredient(ingredient, numberLocale) }}</li>
              </ul>
            </div>
          </label>
        </div>
        <p v-else class="text-sm text-muted">{{ $t('recipes.detail.noIngredients') }}</p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="$t('ui.common.cancel')" @click="open = false" />
        <UButton
          icon="i-lucide-shopping-cart"
          :label="$t('ui.common.add')"
          :loading="submitting"
          :disabled="loading || !selectedListId || selectedSectionIds.length === 0"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { Recipe, RecipeSection, RecipeSummary } from '#shared/types'
import type { Database } from '#shared/types/database'
import { formatIngredient, sectionsWithIngredients } from '#shared/utils/recipes'

/**
 * « Ajouter aux courses » : choix de la liste et des sections d'ingrédients,
 * puis `useShoppingStore().addRecipeToList(listId, recipeId, sectionIds?)`.
 */
const props = defineProps<{ recipe: RecipeSummary | Recipe }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { toUserMessage } = useApiError()
const localePath = useLocalePath()
const supabase = useSupabaseClient<Database>()
const shoppingStore = useShoppingStore()
const { $toast } = useNuxtApp()
const numberLocale = useNumberLocale()

const loading = ref(false)
const submitting = ref(false)
const loadedSections = ref<RecipeSection[]>([])
const selectedSectionIds = ref<string[]>([])
const selectedListId = ref<string | undefined>(undefined)

const sections = computed(() => sectionsWithIngredients(loadedSections.value))

const listItems = computed(() =>
  shoppingStore.shoppingLists.map(list => ({ label: list.name, value: list.id }))
)

const toggleSection = (id: string, checked: boolean) => {
  selectedSectionIds.value = checked
    ? [...new Set([...selectedSectionIds.value, id])]
    : selectedSectionIds.value.filter(sectionId => sectionId !== id)
}

const loadSections = async (): Promise<RecipeSection[]> => {
  if ('sections' in props.recipe) return props.recipe.sections
  const full = await fetchRecipeById(supabase, props.recipe.id)
  return full?.sections ?? []
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  loading.value = true
  try {
    const [recipeSections] = await Promise.all([loadSections(), shoppingStore.ensureLoaded()])
    loadedSections.value = recipeSections
    selectedSectionIds.value = sections.value.map(section => section.id)
    selectedListId.value = shoppingStore.currentList?.id ?? shoppingStore.shoppingLists[0]?.id
  } catch (error) {
    console.error('Erreur lors du chargement des ingrédients :', error)
    loadedSections.value = []
    $toast.error(t('ui.addToList.loadError'))
  } finally {
    loading.value = false
  }
})

const submit = async () => {
  if (!selectedListId.value || selectedSectionIds.value.length === 0) return
  submitting.value = true
  try {
    const allSelected = selectedSectionIds.value.length === sections.value.length
    const count = await shoppingStore.addRecipeToList(
      selectedListId.value,
      props.recipe.id,
      allSelected ? undefined : [...selectedSectionIds.value]
    )
    $toast.success(t('ui.addToList.success'), t('ui.addToList.added', { count }, count))
    open.value = false
  } catch (error) {
    $toast.error(t('ui.addToList.error'), toUserMessage(error))
  } finally {
    submitting.value = false
  }
}
</script>
