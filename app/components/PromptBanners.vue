<template>
  <div v-if="prompts.length > 0" class="space-y-3" data-testid="prompt-banners">
    <PromptBanner
      v-for="prompt in prompts"
      :key="`${prompt.kind}:${prompt.targetId}`"
      :title="titleOf(prompt)"
      :description="descriptionOf(prompt)"
      :icon="prompt.kind === 'new_recipe' ? 'i-lucide-chef-hat' : 'i-lucide-sparkles'"
      :actions="actionsOf(prompt)"
      :dismiss-label="$t('prompts.dismiss')"
      @action="key => onAction(prompt, key)"
      @dismiss="onDismiss(prompt)"
    />
  </div>
</template>

<script setup lang="ts">
import type { PendingPrompt } from '#shared/utils/cookbook'
import type { PromptAction } from '~/utils/prompt'

/**
 * Bannières de Mon carnet (v2, connecté ; plus sur l'accueil) à partir de `pending_prompts` :
 *  - `author_recipes` : « Explorer les recettes de X » → page de X (phase 6B : boutons « ajouter » / « tout ajouter ») ;
 *  - `new_recipe` : « X a ajouté une recette » → voir la fiche, ajouter au carnet.
 * Fermer = `dismiss_prompt` (la bannière ne revient plus ; la page de X reste accessible).
 */
const { t } = useI18n()
const localePath = useLocalePath()
const { $toast } = useNuxtApp()
const { prompts, dismiss, addRecipe } = usePendingPrompts()

const author = (prompt: PendingPrompt) => prompt.authorName ?? t('prompts.someone')

const titleOf = (prompt: PendingPrompt) => prompt.kind === 'new_recipe'
  ? t('prompts.newRecipe.title', { author: author(prompt) })
  : t('prompts.authorRecipes.title', { author: author(prompt) })

const descriptionOf = (prompt: PendingPrompt) => prompt.kind === 'new_recipe'
  ? (prompt.title ?? undefined)
  : t('prompts.authorRecipes.description', prompt.recipeCount)

const addingId = ref<string | null>(null)

const actionsOf = (prompt: PendingPrompt): PromptAction[] => prompt.kind === 'new_recipe'
  ? [
      { key: 'add', label: t('prompts.newRecipe.add'), icon: 'i-lucide-plus', loading: addingId.value === prompt.targetId },
      ...(prompt.recipeId ? [{ key: 'view', label: t('prompts.newRecipe.view'), to: localePath(`/recettes/${prompt.recipeId}`), primary: false }] : [])
    ]
  : [{ key: 'explore', label: t('prompts.authorRecipes.explore', { author: author(prompt) }), icon: 'i-lucide-arrow-right', to: localePath(`/explorer/${prompt.authorId}`) }]

async function onAction(prompt: PendingPrompt, key: string): Promise<void> {
  if (key !== 'add') return
  addingId.value = prompt.targetId
  try {
    await addRecipe(prompt)
    $toast.success(t('prompts.newRecipe.added'))
  } catch {
    $toast.error(t('prompts.error'))
  } finally {
    addingId.value = null
  }
}

async function onDismiss(prompt: PendingPrompt): Promise<void> {
  try {
    await dismiss(prompt)
  } catch {
    $toast.error(t('prompts.error'))
  }
}
</script>
