<template>
  <UModal
    v-model:open="open"
    :title="$t('recipeDetail.shopping.title')"
    :description="$t('recipeDetail.shopping.description')"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-5">
        <!-- Liste cible -->
        <UFormField :label="$t('recipeDetail.shopping.list')" :name="'list'">
          <div v-if="shoppingStore.shoppingLists.length === 0" class="space-y-3">
            <p class="text-sm text-muted">{{ $t('recipeDetail.shopping.noLists') }}</p>
            <div class="flex gap-2">
              <UInput
                v-model="newListName"
                :placeholder="$t('recipeDetail.shopping.newListName')"
                class="flex-1"
                @keydown.enter.prevent="createList"
              />
              <UButton
                :label="$t('recipeDetail.shopping.createList')"
                color="neutral"
                variant="outline"
                :loading="creating"
                :disabled="newListName.trim() === ''"
                @click="createList"
              />
            </div>
          </div>
          <USelectMenu
            v-else
            v-model="selectedListId"
            :items="listItems"
            value-key="value"
            :search-input="false"
            class="w-full"
          />
        </UFormField>

        <!-- Sections d'ingrédients -->
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium text-default">{{ $t('recipeDetail.shopping.sections') }}</span>
            <div class="flex gap-1">
              <UButton :label="$t('recipeDetail.shopping.selectAll')" color="neutral" variant="link" size="xs" @click="selectAll" />
              <UButton :label="$t('recipeDetail.shopping.selectNone')" color="neutral" variant="link" size="xs" @click="selected = []" />
            </div>
          </div>
          <ul class="divide-y divide-default rounded-lg border border-default">
            <li v-for="section in sections" :key="section.id" class="p-3">
              <UCheckbox
                :model-value="selected.includes(section.id)"
                :ui="{ root: 'items-start', label: 'cursor-pointer', description: 'mt-1' }"
                @update:model-value="toggleSection(section.id, $event === true)"
              >
                <template #label>
                  <span class="font-medium text-default">{{ section.name.trim() || recipe.title }}</span>
                </template>
                <template #description>
                  <span class="text-xs text-muted">
                    {{ section.ingredients.map(ingredient => ingredientLabel(ingredient, factor)).join(' · ') }}
                  </span>
                </template>
              </UCheckbox>
            </li>
          </ul>
          <p v-if="factor !== 1 && servings" class="text-xs text-primary">
            {{ $t('recipeDetail.shopping.scaledFor', { count: servings }) }}
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton :label="$t('recipeDetail.shopping.cancel')" color="neutral" variant="ghost" @click="open = false" />
      <UButton
        :label="$t('recipeDetail.shopping.add')"
        icon="i-lucide-shopping-basket"
        :loading="submitting"
        :disabled="selected.length === 0 || !selectedListId"
        @click="submit"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Recipe } from '#shared/types'
import { sectionsWithIngredients } from '#shared/utils/recipes'

/**
 * Ajout d'une recette à une liste de courses, section par section, avec le
 * facteur de portions (`add_recipe_to_list` fusionne les doublons côté base).
 */
const props = withDefaults(defineProps<{
  recipe: Recipe
  factor?: number
  servings?: number | null
}>(), {
  factor: 1,
  servings: null
})

const open = defineModel<boolean>('open', { default: false })

const shoppingStore = useShoppingStore()
const toast = useToast()
const { t } = useI18n()
const { toUserMessage } = useApiError()
const { ingredientLabel } = useIngredientLabel()

const sections = computed(() => sectionsWithIngredients(props.recipe.sections))
const selected = ref<string[]>([])
const selectedListId = ref<string | undefined>(undefined)
const newListName = ref('')
const creating = ref(false)
const submitting = ref(false)

const listItems = computed(() => shoppingStore.shoppingLists.map(list => ({ label: list.name, value: list.id })))

const selectAll = () => {
  selected.value = sections.value.map(section => section.id)
}
const toggleSection = (id: string, checked: boolean) => {
  selected.value = checked
    ? [...new Set([...selected.value, id])]
    : selected.value.filter(sectionId => sectionId !== id)
}

// À l'ouverture : listes chargées, tout sélectionné, liste courante (ou première) présélectionnée.
watch(open, async (isOpen) => {
  if (!isOpen) return
  selectAll()
  try {
    await shoppingStore.ensureLoaded()
  } catch (error) {
    toast.add({ title: t('recipeDetail.shopping.error'), description: toUserMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  selectedListId.value = shoppingStore.currentList?.id ?? shoppingStore.shoppingLists[0]?.id
}, { immediate: true })

const createList = async () => {
  const name = newListName.value.trim()
  if (!name || creating.value) return
  creating.value = true
  try {
    const list = await shoppingStore.createList(name)
    selectedListId.value = list.id
    newListName.value = ''
  } catch (error) {
    toast.add({ title: t('recipeDetail.shopping.error'), description: toUserMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    creating.value = false
  }
}

const submit = async () => {
  const listId = selectedListId.value
  if (!listId || submitting.value) return
  if (selected.value.length === 0) {
    toast.add({ title: t('recipeDetail.shopping.noSelection'), color: 'warning', icon: 'i-lucide-circle-alert' })
    return
  }
  submitting.value = true
  try {
    const count = await shoppingStore.addRecipeToList(listId, props.recipe.id, selected.value, props.factor)
    const listName = shoppingStore.shoppingLists.find(list => list.id === listId)?.name ?? ''
    toast.add({
      title: t('recipeDetail.shopping.success', { count, list: listName }, count),
      color: 'success',
      icon: 'i-lucide-check'
    })
    open.value = false
  } catch (error) {
    toast.add({ title: t('recipeDetail.shopping.error'), description: toUserMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    submitting.value = false
  }
}
</script>
