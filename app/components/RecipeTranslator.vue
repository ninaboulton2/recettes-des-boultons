<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <!-- Étape 1 : saisie -->
    <UCard v-if="step === 'input'">
      <form class="space-y-5" @submit.prevent="translate">
        <UFormField :label="$t('translator.form.language')" name="targetLanguage">
          <URadioGroup
            v-model="targetLanguage"
            orientation="horizontal"
            :items="languageItems"
            :disabled="isTranslating"
          />
        </UFormField>

        <UFormField
          :label="$t('translator.form.text')"
          name="recipeText"
          :hint="$t('translator.form.chars', { count: textLength, max: RECIPE_TEXT_MAX })"
          :description="$t('translator.form.hint')"
        >
          <UTextarea
            v-model="recipeText"
            class="w-full"
            :rows="14"
            autoresize
            :maxrows="30"
            :placeholder="$t('translator.form.placeholder')"
            :disabled="isTranslating"
          />
        </UFormField>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="error"
        />

        <div class="flex justify-end">
          <UButton
            type="submit"
            size="lg"
            icon="i-lucide-sparkles"
            :loading="isTranslating"
            :disabled="!canTranslate"
            :label="isTranslating ? $t('translator.form.loading') : $t('translator.form.submit')"
          />
        </div>
      </form>
    </UCard>

    <!-- Étape 2 : aperçu avant ajout -->
    <UCard v-else-if="step === 'preview' && preview">
      <template #header>
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-eye" class="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p class="font-semibold text-highlighted">{{ $t('translator.preview.title') }}</p>
            <p class="text-sm text-muted">{{ $t('translator.preview.description') }}</p>
          </div>
        </div>
      </template>

      <TranslatorRecipePreview :recipe="preview" :usage="usage" />

      <template #footer>
        <div class="space-y-3">
          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="error"
          />
          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <div class="flex gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-pencil"
                :disabled="isAdding"
                :label="$t('translator.preview.edit')"
                @click="editText"
              />
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-rotate-ccw"
                :disabled="isAdding"
                :label="$t('translator.preview.reset')"
                @click="reset"
              />
            </div>
            <UButton
              size="lg"
              icon="i-lucide-plus"
              :loading="isAdding"
              :label="isAdding ? $t('translator.preview.adding') : $t('translator.preview.add')"
              @click="handleAdd"
            />
          </div>
        </div>
      </template>
    </UCard>

    <!-- Étape 3 : recette ajoutée -->
    <UAlert
      v-else-if="step === 'done' && added"
      color="success"
      variant="subtle"
      icon="i-lucide-circle-check"
      :title="$t('translator.success.title', { title: added.title })"
      :description="$t('translator.success.description')"
      :actions="successActions"
    />
  </div>
</template>

<script setup lang="ts">
import type { AiTargetLanguage } from '#shared/schemas/ai'

/**
 * Traducteur IA : collage du texte → aperçu structuré → ajout via le store.
 * Toute la logique est dans `useTranslator()` ; ce composant ne fait que
 * l'affichage (Nuxt UI, utilitaires sémantiques uniquement).
 */
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()

const {
  recipeText,
  targetLanguage,
  isTranslating,
  isAdding,
  preview,
  usage,
  added,
  error,
  step,
  textLength,
  canTranslate,
  translate,
  addToRecipes,
  editText,
  reset
} = useTranslator()

const languageItems = computed(() =>
  (['fr', 'en'] as AiTargetLanguage[]).map(value => ({ value, label: t(`translator.form.languages.${value}`) }))
)

async function handleAdd(): Promise<void> {
  await addToRecipes()
  if (added.value) {
    toast.add({
      title: t('translator.success.title', { title: added.value.title }),
      color: 'success',
      icon: 'i-lucide-circle-check'
    })
  }
}

const successActions = computed(() => {
  if (!added.value) return []
  const recipeId = added.value.id
  return [
    { label: t('translator.success.view'), icon: 'i-lucide-book-open', onClick: () => { navigateTo(localePath(`/recettes/${recipeId}`)) } },
    { label: t('translator.success.all'), color: 'neutral' as const, variant: 'outline' as const, onClick: () => { navigateTo(localePath('/recettes')) } },
    { label: t('translator.success.another'), color: 'neutral' as const, variant: 'ghost' as const, icon: 'i-lucide-plus', onClick: () => { reset() } }
  ]
})
</script>
