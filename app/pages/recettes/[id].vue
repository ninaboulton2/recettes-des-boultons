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

    <article v-else-if="recipe" id="recipe-sheet" :lang="recipe.displayLang" class="mx-auto max-w-4xl space-y-8">
      <RecipeHero
        :recipe="recipe"
        :servings="scaler.servings.value"
        :base-servings="scaler.baseServings.value"
        :can-scale="scaler.canScale.value"
        :is-scaled="scaler.isScaled.value"
        @update:servings="scaler.setServings"
      />

      <!-- Langue du texte affiché : traduction automatique, ou texte d'origine faute de traduction. -->
      <p v-if="languageHint" class="-mt-5 flex items-center gap-1.5 text-xs text-muted print:hidden" data-testid="recipe-language-hint">
        <UIcon name="i-lucide-languages" class="size-3.5" aria-hidden="true" />
        {{ languageHint }}
      </p>

      <!-- v2 : auteur et, pour une copie, l'original (« Inspirée de … ») quand il m'est lisible -->
      <div v-if="v2 && access" class="-mt-4 space-y-1 text-sm text-muted print:hidden" data-testid="recipe-origin">
        <p v-if="!rights?.isOwner && access.ownerName" data-testid="recipe-author">
          <UIcon name="i-lucide-user" class="mr-1 inline size-3.5 align-text-bottom" aria-hidden="true" />
          <i18n-t keypath="recipeDetail.v2.by" scope="global">
            <template #author>
              <NuxtLink v-if="access.ownerId" :to="localePath(`/explorer/${access.ownerId}`)" class="font-medium text-default underline underline-offset-2 hover:text-primary">{{ access.ownerName }}</NuxtLink>
              <span v-else class="font-medium text-default">{{ access.ownerName }}</span>
            </template>
          </i18n-t>
        </p>
        <p v-if="access.copiedFrom" data-testid="recipe-inspired">
          <UIcon name="i-lucide-copy" class="mr-1 inline size-3.5 align-text-bottom" aria-hidden="true" />
          <i18n-t keypath="recipeDetail.v2.inspiredBy" scope="global">
            <template #title>
              <NuxtLink :to="localePath(`/recettes/${access.copiedFrom}`)" class="font-medium text-default underline underline-offset-2 hover:text-primary">{{ access.copiedFromTitle }}</NuxtLink>
            </template>
          </i18n-t>
        </p>
      </div>

      <RecipeActions
        :recipe="recipe"
        :factor="scaler.factor.value"
        :servings="scaler.servings.value"
        :rights="rights"
        :busy="cookbookBusy"
        @cook="cookingOpen = true"
        @edit="openEditor"
        @delete="askDelete"
        @add="addToCookbook"
        @remove="removeFromCookbook"
        @copy="copyRecipe"
        @share="showShare = true"
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
        {{ siteName }}
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
      :access="access"
      @close="closeRecipeEditor"
      @save="onEditorSaved"
    />

    <RecipeShareModal v-if="v2 && access && rights?.canShare" v-model:open="showShare" :recipe-id="recipeId" :access="access" @changed="refreshAccess" />

    <UModal
      v-model:open="showDeleteModal"
      :title="$t('recipeDetail.delete.title')"
      :description="recipe ? $t('recipeDetail.delete.message', { title: recipe.title }) : ''"
      :ui="{ footer: 'justify-end' }"
    >
      <!-- v2 : combien de personnes l'ont dans leur carnet ou en ont fait une copie (recipe_usage) -->
      <template v-if="usageMessage" #body>
        <UAlert color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="usageMessage" data-testid="delete-usage" />
      </template>
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
import { hasUsage, recipeRights, sharingErrorKey, type RecipeAccess } from '#shared/utils/recipeRights'

// Nuxt 4 ordonne les routes dynamiques différemment de Nuxt 3 : sans ceci,
// `/recettes/:category` capturait aussi les identifiants de recettes. On
// réserve explicitement cette page aux UUID.
definePageMeta({
  path: '/recettes/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'
})

const recipesStore = useRecipesStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const { siteName } = useEdition()
const localePath = useLocalePath()
const notesId = useId()
const v2 = useV2()
const sharing = useSharing()
const cookbookApi = useCookbook()

const recipeId = computed(() => {
  const value = route.params.id
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
})

// Fiche : une requête ciblée (recette + sections imbriquées), rendue côté serveur
const { data: sourceRecipe, status, error, refresh } = await useRecipe(recipeId)

// v2 : mon niveau de droit sur cette recette (RPC `recipe_access`, 0026) → boutons affichés. Les droits sont décidés en base.
const { data: access, refresh: refreshAccess } = await useAsyncData<RecipeAccess | null>(
  () => `recipe-access:${recipeId.value}`,
  async () => (v2 && authStore.isAuthenticated ? await sharing.getRecipeAccess({ recipeId: recipeId.value }).catch(() => null) : null),
  { default: () => null, watch: [recipeId, () => recipesStore.revision] }
)
const rights = computed(() => (access.value ? recipeRights(access.value) : null))

// Texte dans la langue de l'interface (traduction si elle existe, sinon texte d'origine).
// L'éditeur, lui, reçoit toujours la version d'origine (`sourceRecipe`).
const { lang, localizeFull } = useRecipeLocale()
const recipe = computed(() => (sourceRecipe.value ? localizeFull(sourceRecipe.value) : null))

// Discret : dit d'où vient le texte quand ce n'est pas du texte écrit dans la langue de l'interface.
const languageHint = computed(() => {
  const shown = recipe.value
  if (!shown) return null
  if (shown.displayLang !== lang.value) return t('recipeDetail.language.original', { lang: t(`recipeDetail.language.${shown.displayLang}`) })
  if (shown.displayLang !== shown.lang) return t('recipeDetail.language.translated', { lang: t(`recipeDetail.language.${shown.lang}`) })
  return null
})

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
  editingRecipe.value = sourceRecipe.value
  showRecipeEditor.value = true
}
const closeRecipeEditor = () => {
  showRecipeEditor.value = false
  editingRecipe.value = null
}
const onEditorSaved = () => {
  closeRecipeEditor()
  if (v2) void refreshAccess()
}

// v2 : carnet, copie modifiable, partage
const showShare = ref(false)
const cookbookBusy = ref<'add' | 'remove' | 'copy' | null>(null)
const failToast = (cause: unknown, fallbackKey: string) => {
  const key = sharingErrorKey(cause)
  toast.add({ title: t(key === 'errors.generic' ? fallbackKey : key), color: 'error', icon: 'i-lucide-circle-alert' })
}
const addToCookbook = async () => {
  cookbookBusy.value = 'add'
  try {
    await cookbookApi.addToCookbook({ recipeId: recipeId.value })
    recipesStore.refresh()
    toast.add({ title: t('recipeDetail.v2.added'), color: 'success', icon: 'i-lucide-check' })
  } catch (cause) {
    failToast(cause, 'recipeDetail.v2.addError')
  } finally {
    cookbookBusy.value = null
  }
}
const removeFromCookbook = async () => {
  cookbookBusy.value = 'remove'
  try {
    await cookbookApi.removeFromCookbook({ recipeId: recipeId.value })
    recipesStore.refresh()
    toast.add({ title: t('recipeDetail.v2.removed'), color: 'success', icon: 'i-lucide-check' })
  } catch (cause) {
    failToast(cause, 'recipeDetail.v2.removeError')
  } finally {
    cookbookBusy.value = null
  }
}
const copyRecipe = async () => {
  cookbookBusy.value = 'copy'
  try {
    const copyId = await cookbookApi.copyRecipe({ recipeId: recipeId.value })
    recipesStore.refresh()
    toast.add({ title: t('recipeDetail.v2.copied'), color: 'success', icon: 'i-lucide-check' })
    await navigateTo(localePath(`/recettes/${copyId}`))
  } catch (cause) {
    failToast(cause, 'recipeDetail.v2.copyError')
  } finally {
    cookbookBusy.value = null
  }
}

// Suppression (admin) : photos du bucket retirées par recipesStore.deleteRecipe
const showDeleteModal = ref(false)
const deleting = ref(false)

// v2 : avant de supprimer, on prévient si d'autres personnes l'ont dans leur carnet ou en ont fait une copie.
const usage = ref<{ cookbookCount: number, copyCount: number } | null>(null)
const askDelete = async () => {
  usage.value = null
  if (v2) {
    try {
      usage.value = await sharing.recipeUsage({ recipeId: recipeId.value })
    } catch {
      usage.value = null   // l'avertissement est un confort : la suppression reste possible
    }
  }
  showDeleteModal.value = true
}
const usageMessage = computed(() => {
  const value = usage.value
  if (!value || !hasUsage(value)) return ''
  const parts: string[] = []
  if (value.cookbookCount > 0) parts.push(t('recipeDetail.delete.usageCookbooks', { n: value.cookbookCount }, value.cookbookCount))
  if (value.copyCount > 0) parts.push(t('recipeDetail.delete.usageCopies', { n: value.copyCount }, value.copyCount))
  return t('recipeDetail.delete.usageSentence', { parts: parts.join(t('recipeDetail.delete.usageAnd')) })
})
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
