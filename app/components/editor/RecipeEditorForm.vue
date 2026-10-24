<template>
  <UForm
    :schema="formSchema"
    :state="state"
    :validate="validateSections"
    :validate-on="['blur', 'change']"
    class="space-y-8"
    @submit="onSubmit"
    @error="onError"
  >
    <!-- Langue éditée : le texte d'origine ; la traduction est régénérée à l'enregistrement (0016). -->
    <UAlert
      v-if="recipe"
      data-testid="editor-language"
      color="neutral"
      variant="subtle"
      icon="i-lucide-languages"
      :title="$t('editor.language.title', { lang: $t(`editor.language.${recipe.lang}`) })"
      :description="$t('editor.language.description', { other: $t(`editor.language.${recipe.lang === 'fr' ? 'en' : 'fr'}`) })"
    />

    <!-- Informations générales -->
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField :label="$t('editor.fields.title')" name="title" required class="sm:col-span-2">
        <UInput v-model="state.title" :placeholder="$t('editor.fields.titlePlaceholder')" size="lg" class="w-full" />
      </UFormField>
      <!-- v2 : MA catégorie et la visibilité (auteur seulement) ; un éditeur « modifier l'original » n'y touche pas -->
      <RecipeV2Options
        v-if="v2 && isOwner"
        v-model:category-id="state.categoryId"
        v-model:visibility="state.visibility"
        class="sm:col-span-2"
      />
      <UFormField v-else-if="!v2" :label="$t('editor.fields.category')" name="category" required>
        <USelectMenu
          v-model="state.category"
          :items="categoryItems"
          value-key="value"
          :placeholder="$t('editor.fields.categoryPlaceholder')"
          :search-input="false"
          class="w-full"
        />
      </UFormField>
      <UFormField :label="$t('editor.fields.servings')" name="servings">
        <UInputNumber v-model="state.servings" :min="0" :max="99" class="w-full" />
      </UFormField>
      <UFormField :label="$t('editor.fields.prepTime')" name="prepTime">
        <UInputNumber v-model="state.prepTime" :min="0" :step="5" class="w-full" />
      </UFormField>
      <UFormField :label="$t('editor.fields.cookTime')" name="cookTime">
        <UInputNumber v-model="state.cookTime" :min="0" :step="5" class="w-full" />
      </UFormField>
      <UFormField :label="$t('editor.fields.description')" name="description" class="sm:col-span-2">
        <UTextarea v-model="state.description" :rows="2" autoresize :placeholder="$t('editor.fields.descriptionPlaceholder')" class="w-full" />
      </UFormField>
      <UFormField :label="$t('editor.fields.tags')" name="tags" class="sm:col-span-2">
        <UInputTags v-model="state.tags" :placeholder="$t('editor.fields.tagsPlaceholder')" add-on-blur class="w-full" />
      </UFormField>
    </div>

    <EditorPhotoField v-model="pendingPhoto" v-model:removed="photoRemoved" :current-path="recipe?.photoPath ?? null" />

    <!-- Sections d'ingrédients puis d'étapes -->
    <section v-for="kind in SECTION_KINDS" :key="kind" class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h3 class="font-serif text-xl font-semibold text-highlighted">
          {{ kind === 'ingredients' ? $t('editor.sections.ingredientsTitle') : $t('editor.sections.stepsTitle') }}
        </h3>
        <UButton icon="i-lucide-plus" :label="$t('editor.sections.addSection')" color="neutral" variant="outline" size="sm" @click="addSection(kind)" />
      </div>
      <UFormField :name="kind === 'ingredients' ? 'sections.ingredients' : 'sections.instructions'" :ui="{ error: 'text-sm' }">
        <div class="space-y-3">
          <EditorSectionEditor
            v-for="(entry, position) in sectionsOf(kind)"
            :key="entry.section.key"
            :section="entry.section"
            :index="entry.index"
            :position="position"
            :count="sectionsOf(kind).length"
            @update="updateSection(entry.index, $event)"
            @move="moveSection(entry.index, $event)"
            @remove="removeSection(entry.index)"
          />
        </div>
      </UFormField>
    </section>

    <UFormField :label="$t('editor.fields.notes')" name="notes">
      <UTextarea v-model="state.notes" :rows="3" autoresize :placeholder="$t('editor.fields.notesPlaceholder')" class="w-full" />
    </UFormField>

    <div class="flex items-center justify-end gap-2 border-t border-default pt-4">
      <UButton :label="$t('editor.actions.cancel')" color="neutral" variant="ghost" :disabled="saving" @click="emit('cancel')" />
      <UButton type="submit" :label="isEditing ? $t('editor.actions.save') : $t('editor.actions.create')" icon="i-lucide-save" :loading="saving" />
    </div>
  </UForm>
</template>

<script lang="ts">
// Les deux blocs <script> forment un seul module : tous les imports vivent ici.
import { computed, reactive, ref } from 'vue'
import type { FormError, FormErrorEvent } from '@nuxt/ui'
import { z } from 'zod'
import { RECIPE_CATEGORIES, type Recipe, type RecipeInput, type RecipeSectionInput, type SectionType } from '#shared/types'
import { recipeInputSchema, type UnitCode } from '#shared/schemas'
import { categoryI18nKey } from '#shared/utils/recipes'
import { formSnapshot, isFormDirty } from '~/utils/formDirty'
import type { RecipeAccess } from '#shared/utils/recipeRights'
import EditorPhotoField from './PhotoField.vue'
import EditorSectionEditor from './SectionEditor.vue'

/** Modèle du formulaire : même forme que `recipeInputSchema` + clés stables (`key`) pour les listes. */
export interface FormIngredient {
  key: string
  name: string
  amount: string
  unit: string
  unitCode?: UnitCode | null
  optional: boolean
}
export interface FormStep { key: string, content: string }
export type FormSectionType = Exclude<SectionType, 'mixed'>
export interface FormSection {
  key: string
  name: string
  type: FormSectionType
  ingredients: FormIngredient[]
  instructions: FormStep[]
}
/** Transformation d'une section appliquée sur l'état courant du formulaire. */
export type SectionUpdater = (section: FormSection) => FormSection
export interface RecipeFormState {
  title: string
  category: string
  /** v2 : identifiant de MA catégorie (`''` = aucune) et visibilité (auteur seulement). */
  categoryId: string
  visibility: 'private' | 'groups'
  description: string
  notes: string
  prepTime: number | null
  cookTime: number | null
  servings: number | null
  tags: string[]
  photoPath: string | null
  sections: FormSection[]
}

const newKey = () => Math.random().toString(36).slice(2, 10)
export const newIngredient = (): FormIngredient => ({ key: newKey(), name: '', amount: '', unit: '', optional: false })
export const newStep = (): FormStep => ({ key: newKey(), content: '' })
export const newSection = (type: FormSectionType): FormSection => ({ key: newKey(), name: '', type, ingredients: [], instructions: [] })
</script>

<script setup lang="ts">
/**
 * Formulaire de recette (création / modification) : `UForm` + `recipeInputSchema`,
 * sections d'ingrédients et d'étapes, photo (téléversée à l'enregistrement),
 * soumission via `useRecipesStore().addRecipe / updateRecipe`.
 */
const props = defineProps<{
  recipe: Recipe | null
  /** v2 : mes droits sur la recette éditée (`recipe_access`) ; absent pour une création. */
  access?: RecipeAccess | null
}>()
const emit = defineEmits<{ saved: [recipe: Recipe], cancel: [] }>()

const SECTION_KINDS: readonly FormSectionType[] = ['ingredients', 'instructions']
const recipesStore = useRecipesStore()
const toast = useToast()
const { t } = useI18n()
const { uploadPhoto, removePhoto } = useRecipePhoto()
const v2 = useV2()
const { categories } = useCategories()
// L'état du formulaire porte `categoryId` ('' = aucune) : le schéma d'écriture l'attend en identifiant, d'où cette variante pour la validation.
// En v2 le texte `category` n'est plus saisi : il est dérivé du nom de MA catégorie à l'envoi (`toRecipeInput`).
const formSchema = (v2
  ? recipeInputSchema.extend({ categoryId: z.string().nullish(), category: z.string().nullish() })
  : recipeInputSchema.extend({ categoryId: z.string().nullish() })) as unknown as typeof recipeInputSchema
/** v2 : l'auteur règle catégorie et visibilité ; une création est toujours « mienne » ; accès inconnu = prudence (rien). */
const isOwner = computed(() => !props.recipe || props.access?.permission === 'author')

const isEditing = computed(() => props.recipe !== null)
const saving = ref(false)
const pendingPhoto = ref<File | null>(null)
const photoRemoved = ref(false)

/** Une section `mixed` (0005) devient une section d'ingrédients + une d'étapes du même nom. */
function fromRecipe(recipe: Recipe | null, access: RecipeAccess | null | undefined): RecipeFormState {
  const sections: FormSection[] = []
  for (const section of recipe?.sections ?? []) {
    const ingredients = section.ingredients.map(ingredient => ({
      key: newKey(), name: ingredient.name, amount: ingredient.amount ?? '', unit: ingredient.unit ?? '', optional: ingredient.optional
    }))
    const instructions = section.instructions.map(instruction => ({ key: newKey(), content: instruction.content }))
    if (section.type !== 'instructions' && (ingredients.length > 0 || section.type === 'ingredients')) {
      sections.push({ key: newKey(), name: section.name, type: 'ingredients', ingredients, instructions: [] })
    }
    if (section.type !== 'ingredients' && (instructions.length > 0 || section.type === 'instructions')) {
      sections.push({ key: newKey(), name: section.name, type: 'instructions', ingredients: [], instructions })
    }
  }
  if (!recipe) sections.push(newSection('ingredients'), newSection('instructions'))
  return {
    title: recipe?.title ?? '',
    category: recipe?.category ?? '',
    categoryId: access?.categoryId ?? '',
    visibility: access?.visibility ?? 'groups',
    description: recipe?.description ?? '',
    notes: recipe?.notes ?? '',
    prepTime: recipe?.prepTime ?? null,
    cookTime: recipe?.cookTime ?? null,
    servings: recipe?.servings ?? null,
    tags: [...(recipe?.tags ?? [])],
    photoPath: recipe?.photoPath ?? null,
    sections
  }
}

const state = reactive<RecipeFormState>(fromRecipe(props.recipe, props.access))

// Instantané pris à l'ouverture ; l'état est « modifié » dès qu'il s'en écarte.
const initialSnapshot = ref(formSnapshot(state))
const isDirty = computed(() => isFormDirty(state, initialSnapshot.value, pendingPhoto.value !== null || photoRemoved.value))
defineExpose({ isDirty })

const categoryItems = computed<Array<{ label: string, value: string }>>(() =>
  RECIPE_CATEGORIES.map(category => ({ label: t(categoryI18nKey(category)), value: category }))
)

const sectionsOf = (type: FormSectionType) =>
  state.sections.map((section, index) => ({ section, index })).filter(entry => entry.section.type === type)

const updateSection = (index: number, updater: SectionUpdater) => {
  state.sections = state.sections.map((section, i) => (i === index ? updater(section) : section))
}
const removeSection = (index: number) => {
  state.sections = state.sections.filter((_, i) => i !== index)
}
const addSection = (type: FormSectionType) => {
  state.sections = [...state.sections, newSection(type)]
}
/** Échange avec la section voisine du même type. */
const moveSection = (index: number, direction: -1 | 1) => {
  const section = state.sections[index]
  if (!section) return
  const siblings = sectionsOf(section.type)
  const position = siblings.findIndex(entry => entry.index === index)
  const target = siblings[position + direction]
  if (!target) return
  const next = [...state.sections]
  next[index] = target.section
  next[target.index] = section
  state.sections = next
}

/** Au moins un ingrédient et une étape (en plus du schéma Zod). */
const validateSections = (current: Partial<z.input<typeof recipeInputSchema>>): FormError[] => {
  const errors: FormError[] = []
  // v2 : une recette neuve est rangée dans une de MES catégories (s'il en existe).
  if (v2 && isOwner.value && !props.recipe && categories.value.length > 0 && !state.categoryId) {
    errors.push({ name: 'categoryId', message: t('editor.validation.needCategory') })
  }
  const sections = current.sections ?? []
  if (!sections.some(section => section.type === 'ingredients' && (section.ingredients?.length ?? 0) > 0)) {
    errors.push({ name: 'sections.ingredients', message: t('editor.validation.needIngredients') })
  }
  const stepText = (step: string | { content: string }) => (typeof step === 'string' ? step : step.content)
  if (!sections.some(section => section.type === 'instructions' && (section.instructions ?? []).some(step => stepText(step).trim() !== ''))) {
    errors.push({ name: 'sections.instructions', message: t('editor.validation.needSteps') })
  }
  return errors
}

function toRecipeInput(photoPath: string | null): RecipeInput {
  const ordered = [...sectionsOf('ingredients'), ...sectionsOf('instructions')].map(entry => entry.section)
  const sections: RecipeSectionInput[] = ordered.map((section, orderIndex) => ({
    name: section.name.trim(),
    type: section.type,
    orderIndex,
    ingredients: section.ingredients.map((ingredient, i) => ({
      name: ingredient.name.trim(),
      amount: ingredient.amount.trim() || null,
      unit: ingredient.unit.trim() || null,
      optional: ingredient.optional,
      orderIndex: i
    })),
    instructions: section.instructions
      .filter(step => step.content.trim() !== '')
      .map((step, i) => ({ content: step.content.trim(), orderIndex: i }))
  }))
  // v2 : le texte `category` suit le nom de MA catégorie (champ historique NOT NULL) ; `categoryId` et `visibility` ne partent
  // que pour l'auteur (la base les ignore pour un éditeur, mais on ne les envoie pas).
  const ownCategory = v2 && isOwner.value ? categories.value.find(category => category.id === state.categoryId) : undefined
  const v2Fields = v2 && isOwner.value
    ? { categoryId: state.categoryId || null, visibility: state.visibility }
    : {}
  return {
    ...v2Fields,
    title: state.title.trim(),
    category: v2 ? (ownCategory?.name ?? (state.category || t('editor.fields.noCategoryText'))) : state.category,
    description: state.description.trim(),
    notes: state.notes.trim(),
    prepTime: state.prepTime,
    cookTime: state.cookTime,
    servings: state.servings,
    tags: state.tags.map(tag => tag.trim()).filter(Boolean),
    sections,
    photoPath
  }
}

const onError = (event: FormErrorEvent) =>
  toast.add({ title: t('editor.validation.fixErrors'), description: event.errors[0]?.message, color: 'warning', icon: 'i-lucide-circle-alert' })

const onSubmit = async () => {
  if (saving.value) return
  saving.value = true
  const previousPath = props.recipe?.photoPath ?? null
  // La traduction automatique peut échouer sans que l'enregistrement échoue (0016).
  let translationFailed = false
  const noteTranslation = () => {
    if (recipesStore.lastTranslation?.status === 'failed') translationFailed = true
  }
  try {
    let saved: Recipe
    if (props.recipe) {
      // Modification : la photo est téléversée d'abord (l'identifiant est connu).
      let photoPath = photoRemoved.value ? null : previousPath
      if (pendingPhoto.value) photoPath = await uploadPhoto(props.recipe.id, pendingPhoto.value)
      saved = await recipesStore.updateRecipe(props.recipe.id, toRecipeInput(photoPath))
      noteTranslation()
      // v1 : le navigateur supprime l'ancien objet ; v2 : c'est le serveur (/api/update-recipe), un éditeur n'a pas ce droit
      if (!v2 && previousPath && previousPath !== photoPath) await removePhoto(previousPath).catch(() => undefined)
      toast.add({ title: t('editor.toasts.updated'), color: 'success', icon: 'i-lucide-check' })
    } else {
      // Création : la recette d'abord (pour son identifiant), puis la photo.
      saved = await recipesStore.addRecipe(toRecipeInput(null))
      noteTranslation()
      if (pendingPhoto.value) {
        try {
          const photoPath = await uploadPhoto(saved.id, pendingPhoto.value)
          saved = await recipesStore.updateRecipe(saved.id, toRecipeInput(photoPath))
          noteTranslation()
        } catch (photoError) {
          console.warn('[éditeur] photo non téléversée', photoError)
          toast.add({ title: t('editor.toasts.photoError'), color: 'warning', icon: 'i-lucide-image-off' })
        }
      }
      toast.add({ title: t('editor.toasts.created'), color: 'success', icon: 'i-lucide-check' })
    }
    // Enregistré : plus rien à perdre, la fermeture ne doit pas demander confirmation.
    initialSnapshot.value = formSnapshot(state)
    pendingPhoto.value = null
    photoRemoved.value = false
    if (translationFailed) {
      toast.add({
        title: t('editor.toasts.translationFailed'),
        description: t('editor.toasts.translationFailedHint'),
        color: 'warning',
        icon: 'i-lucide-languages'
      })
    }
    emit('saved', saved)
  } catch (error) {
    toast.add({ title: t('editor.toasts.error'), description: toUserMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    saving.value = false
  }
}
</script>
