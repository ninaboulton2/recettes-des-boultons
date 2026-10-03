<template>
  <div>
    <div class="mb-4 print:hidden">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="sm"
        :label="$t('recipeDetail.back')"
        @click="goBack"
      />
    </div>

    <LoadingState v-if="status === 'pending'" :message="$t('recipes.detail.loading')" />

    <ErrorState
      v-else-if="error"
      :message="error.message"
      :retry-action="() => refresh()"
      :title="$t('recipes.detail.loadError')"
      :retry-text="$t('recipes.loadError.retry')"
    />

    <article v-else-if="recipe" id="recipe-sheet" class="mx-auto max-w-4xl space-y-8">
      <RecipeHero
        :recipe="recipe"
        :servings="scaler.servings.value"
        :base-servings="scaler.baseServings.value"
        :can-scale="scaler.canScale.value"
        :is-scaled="scaler.isScaled.value"
        @update:servings="scaler.setServings"
      />

      <RecipeActions
        :recipe="recipe"
        :factor="scaler.factor.value"
        :servings="scaler.servings.value"
        @cook="cookingOpen = true"
        @edit="openEditor"
        @delete="showDeleteModal = true"
      />

      <div class="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12">
        <RecipeIngredients :sections="ingredientSections" :factor="scaler.factor.value" class="print:break-inside-avoid" />
        <RecipeSteps :sections="instructionSections" />
      </div>

      <section v-if="recipe.notes.trim()" :aria-labelledby="notesId" class="space-y-3 print:break-inside-avoid">
        <h2 :id="notesId" class="font-serif text-2xl font-semibold text-highlighted">
          {{ $t('recipeDetail.notes.title') }}
        </h2>
        <div class="flex gap-3 rounded-xl border border-default bg-muted p-4">
          <UIcon name="i-lucide-lightbulb" class="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <p class="whitespace-pre-wrap leading-7 text-default">{{ recipe.notes }}</p>
        </div>
      </section>

      <p class="hidden text-center text-xs text-muted print:block">
        {{ $t('meta.title') }}
      </p>
    </article>

    <div v-else class="py-16 text-center">
      <h2 class="mb-4 font-serif text-2xl font-semibold text-highlighted">{{ $t('recipes.detail.notFound') }}</h2>
      <UButton :to="localePath('/recettes')" :label="$t('recipes.detail.backToList')" color="primary" />
    </div>

    <RecipeCookingMode v-model:open="cookingOpen" :recipe="recipe" :factor="scaler.factor.value" />

    <RecipeEditor
      :show="showRecipeEditor"
      :recipe="editingRecipe"
      @close="closeRecipeEditor"
      @save="closeRecipeEditor"
    />

    <UModal
      v-model:open="showDeleteModal"
      :title="$t('recipeDetail.delete.title')"
      :description="recipe ? $t('recipeDetail.delete.message', { title: recipe.title }) : ''"
      :ui="{ footer: 'justify-end' }"
    >
      <template #footer>
        <UButton :label="$t('recipeDetail.delete.cancel')" color="neutral" variant="ghost" @click="showDeleteModal = false" />
        <UButton
          :label="$t('recipeDetail.delete.confirm')"
          color="error"
          icon="i-lucide-trash-2"
          :loading="deleting"
          @click="deleteRecipe"
        />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Recipe } from '#shared/types'
import { sectionsWithIngredients, sectionsWithInstructions } from '#shared/utils/recipes'

// Nuxt 4 ordonne les routes dynamiques différemment de Nuxt 3 : sans ceci,
// `/recettes/:category` capturait aussi les identifiants de recettes. On
// réserve explicitement cette page aux UUID.
definePageMeta({
  path: '/recettes/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'
})

const recipesStore = useRecipesStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const localePath = useLocalePath()
const notesId = useId()

const recipeId = computed(() => {
  const value = route.params.id
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
})

// Fiche : une requête ciblée (recette + sections imbriquées), rendue côté serveur
const { data: recipe, status, error, refresh } = await useRecipe(recipeId)

const ingredientSections = computed(() => sectionsWithIngredients(recipe.value?.sections ?? []))
const instructionSections = computed(() => sectionsWithInstructions(recipe.value?.sections ?? []))

// Portions ajustables : facteur partagé avec les ingrédients, le mode cuisine et les courses
const scaler = useServingsScaler(recipe)

const cookingOpen = ref(false)

const goBack = () => {
  if (import.meta.client && window.history.length > 1) router.back()
  else void navigateTo(localePath('/recettes'))
}

// Édition (admin) : l'éditeur recharge la fiche via recipesStore.revision
const showRecipeEditor = ref(false)
const editingRecipe = ref<Recipe | null>(null)
const openEditor = () => {
  editingRecipe.value = recipe.value
  showRecipeEditor.value = true
}
const closeRecipeEditor = () => {
  showRecipeEditor.value = false
  editingRecipe.value = null
}

// Suppression (admin) : photos du bucket retirées par recipesStore.deleteRecipe
const showDeleteModal = ref(false)
const deleting = ref(false)
const deleteRecipe = async () => {
  const current = recipe.value
  if (!current || deleting.value) return
  deleting.value = true
  try {
    await recipesStore.deleteRecipe(current.id)
    showDeleteModal.value = false
    toast.add({ title: t('recipeDetail.delete.success'), color: 'success', icon: 'i-lucide-check' })
    await navigateTo(localePath('/recettes'))
  } catch (deleteError) {
    toast.add({ title: t('recipeDetail.delete.error'), description: toUserMessage(deleteError), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    deleting.value = false
  }
}

// Impression : feuille `@media print` de main.css (body:has(#recipe-sheet)).
useHead({
  title: () => recipe.value?.title ?? t('recipes.detail.notFound'),
  meta: [
    { name: 'description', content: () => recipe.value?.description || t('recipes.detail.notFound') }
  ]
})
</script>
