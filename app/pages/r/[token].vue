<template>
  <div class="mx-auto max-w-4xl" data-testid="public-recipe-page">
    <LoadingState v-if="status === 'pending'" :message="$t('recipes.detail.loading')" />

    <!-- Lien inconnu, révoqué ou mal formé : même page neutre, rien n'est révélé -->
    <EmptyState
      v-else-if="!recipe"
      icon="i-lucide-link-2-off"
      :title="$t('publicRecipe.notFound.title')"
      :message="$t('publicRecipe.notFound.description')"
      data-testid="public-not-found"
    >
      <template #action>
        <UButton :to="localePath('/')" color="neutral" variant="outline" :label="$t('publicRecipe.notFound.action')" />
      </template>
    </EmptyState>

    <article v-else id="recipe-sheet" :lang="recipe.displayLang" class="space-y-8">
      <div class="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center print:hidden" data-testid="public-banner">
        <UIcon name="i-lucide-share-2" class="hidden size-6 shrink-0 text-primary sm:block" aria-hidden="true" />
        <p class="min-w-0 flex-1 text-sm text-default">
          <i18n-t keypath="publicRecipe.sharedBy" scope="global">
            <template #author>
              <strong class="text-highlighted" data-testid="public-author">{{ shared?.author_name ?? $t('prompts.someone') }}</strong>
            </template>
          </i18n-t>
        </p>
        <UButton
          icon="i-lucide-bookmark-plus"
          :label="$t('publicRecipe.add')"
          :loading="claiming"
          data-testid="public-add"
          @click="onAdd"
        />
      </div>

      <RecipeHero
        :recipe="recipe"
        :servings="scaler.servings.value"
        :base-servings="scaler.baseServings.value"
        :can-scale="scaler.canScale.value"
        :is-scaled="scaler.isScaled.value"
        @update:servings="scaler.setServings"
      />

      <div class="flex flex-wrap items-center gap-2 print:hidden">
        <UButton icon="i-lucide-chef-hat" size="sm" :label="$t('recipeDetail.actions.cook')" :disabled="!hasSteps" data-testid="public-cook" @click="cookingOpen = true" />
        <UButton icon="i-lucide-printer" color="neutral" variant="ghost" size="sm" :label="$t('recipeDetail.actions.print')" @click="print" />
      </div>

      <div class="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12">
        <RecipeIngredients :sections="ingredientSections" :factor="scaler.factor.value" class="print:break-inside-avoid" />
        <RecipeSteps :sections="instructionSections" />
      </div>

      <section v-if="recipe.notes.trim()" :aria-labelledby="notesId" class="space-y-3 print:break-inside-avoid">
        <h2 :id="notesId" class="font-serif text-2xl font-semibold text-highlighted">{{ $t('recipeDetail.notes.title') }}</h2>
        <div class="flex gap-3 rounded-xl border border-default bg-muted p-4">
          <UIcon name="i-lucide-lightbulb" class="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <p class="whitespace-pre-wrap leading-7 text-default">{{ recipe.notes }}</p>
        </div>
      </section>
    </article>

    <RecipeCookingMode v-if="recipe" v-model:open="cookingOpen" :recipe="recipe" :factor="scaler.factor.value" />

    <AuthModal :is-open="showLogin" @close="showLogin = false" @success="onLoggedIn" />
  </div>
</template>

<script setup lang="ts">
import { uuidSchema } from '#shared/schemas/common'
import { sectionsWithIngredients, sectionsWithInstructions } from '#shared/utils/recipes'
import { sharingErrorKey } from '#shared/utils/recipeRights'
import { sharedToRecipe } from '#shared/utils/sharedRecipe'

/**
 * Page publique d'une recette partagée par lien (`/r/<jeton>`, v2), SANS compte : lecture seule, mode cuisine, auteur par son
 * pseudonyme, `noindex`. « Ajouter à mon carnet » demande la connexion puis appelle `claim_shared_recipe` (droit « copy » et
 * entrée de carnet). Un jeton mal formé, inconnu ou révoqué donne la même page neutre. Réservée à la v2 (404 sinon).
 */
definePageMeta({
  middleware: () => {
    if (!useV2()) return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true }))
  }
})

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const toast = useToast()
const authStore = useAuthStore()
const sharing = useSharing()
const { lang, localizeFull } = useRecipeLocale()
const notesId = useId()

const token = computed(() => {
  const value = route.params.token
  const raw = Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
  return uuidSchema.safeParse(raw).success ? raw : null
})

const { data: shared, status } = await useAsyncData(
  () => `shared-recipe:${token.value}:${locale.value}`,
  async () => (token.value ? await sharing.getSharedRecipe({ token: token.value, locale: lang.value }).catch(() => null) : null),
  { default: () => null, watch: [token, locale] }
)

const recipe = computed(() => (shared.value && token.value ? localizeFull(sharedToRecipe(shared.value, `shared:${token.value}`)) : null))
const ingredientSections = computed(() => sectionsWithIngredients(recipe.value?.sections ?? []))
const instructionSections = computed(() => sectionsWithInstructions(recipe.value?.sections ?? []))
const hasSteps = computed(() => instructionSections.value.length > 0)
const scaler = useServingsScaler(recipe)
const cookingOpen = ref(false)
const print = () => { if (import.meta.client) window.print() }

// Jamais indexée ; introuvable : vrai 404 pour les robots et les liens cassés, sans rien dire de plus.
useResponseHeader('X-Robots-Tag').value = 'noindex, nofollow'
if (import.meta.server && !shared.value) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404)
}

// « Ajouter à mon carnet » : connexion d'abord si besoin, puis claim_shared_recipe.
const showLogin = ref(false)
const claiming = ref(false)

async function claim(): Promise<void> {
  if (!token.value) return
  claiming.value = true
  try {
    const recipeId = await sharing.claimSharedRecipe({ token: token.value })
    toast.add({ title: t('publicRecipe.added'), color: 'success', icon: 'i-lucide-check' })
    await navigateTo(localePath(`/recettes/${recipeId}`))
  } catch (cause) {
    const key = sharingErrorKey(cause)
    toast.add({ title: t(key === 'errors.generic' || key === 'errors.sharing.notFound' ? 'publicRecipe.addError' : key), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    claiming.value = false
  }
}

function onAdd(): void {
  if (!authStore.isAuthenticated) {
    showLogin.value = true
    return
  }
  void claim()
}

async function onLoggedIn(): Promise<void> {
  showLogin.value = false
  await nextTick()
  await claim()
}

useHead({
  title: () => recipe.value?.title ?? t('publicRecipe.notFound.title'),
  meta: [
    { name: 'robots', content: 'noindex, nofollow' },
    { name: 'description', content: () => recipe.value?.description || t('publicRecipe.documentDescription') }
  ]
})
</script>
