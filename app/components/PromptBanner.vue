<template>
  <section
    class="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center"
    :aria-labelledby="titleId"
    data-testid="prompt-banner"
  >
    <UIcon :name="icon" class="hidden size-6 shrink-0 text-primary sm:block" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <h2 :id="titleId" class="text-base font-semibold text-highlighted">{{ title }}</h2>
      <p v-if="description" class="mt-0.5 text-sm text-muted">{{ description }}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <template v-for="action in actions" :key="action.key">
        <UButton
          v-if="action.to"
          :to="action.to"
          :label="action.label"
          :icon="action.icon"
          size="sm"
          :variant="action.primary === false ? 'outline' : 'solid'"
          :color="action.primary === false ? 'neutral' : 'primary'"
        />
        <UButton
          v-else
          :label="action.label"
          :icon="action.icon"
          size="sm"
          :loading="action.loading"
          :variant="action.primary === false ? 'outline' : 'solid'"
          :color="action.primary === false ? 'neutral' : 'primary'"
          @click="emit('action', action.key)"
        />
      </template>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="dismissLabel"
        data-testid="prompt-dismiss"
        @click="emit('dismiss')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PromptAction } from '~/utils/prompt'

/**
 * Bannière réutilisable (fondation commune 6A → 6E) : titre, texte facultatif, boutons d'action (lien ou événement)
 * et fermeture. Les parents décident du contenu ; ici, uniquement la présentation et l'accessibilité
 * (région nommée par son titre, bouton de fermeture étiqueté).
 */
withDefaults(defineProps<{
  title: string
  description?: string
  icon?: string
  actions?: PromptAction[]
  dismissLabel: string
}>(), {
  description: undefined,
  icon: 'i-lucide-sparkles',
  actions: () => []
})

const emit = defineEmits<{ action: [key: string], dismiss: [] }>()

const titleId = `prompt-${useId()}`
</script>
