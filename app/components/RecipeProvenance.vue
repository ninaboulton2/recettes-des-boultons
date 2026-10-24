<template>
  <UBadge
    :color="provenance.kind === 'mine' ? 'primary' : 'neutral'"
    :variant="provenance.kind === 'mine' ? 'soft' : 'subtle'"
    size="sm"
    :icon="icon"
    :label="label"
    class="max-w-full"
    :ui="{ label: 'truncate' }"
    data-testid="recipe-provenance"
    :data-provenance="provenance.kind"
  />
</template>

<script setup lang="ts">
import type { Provenance } from '#shared/utils/recipeRights'

/**
 * Badge de provenance d'une carte du carnet (v2) : « À moi », « Ajoutée — de X » ou « Copie de … ».
 * Texte seulement dans le badge : jamais d'identifiant ni d'adresse.
 */
const props = defineProps<{ provenance: Provenance }>()
const { t } = useI18n()

const label = computed(() => {
  const provenance = props.provenance
  if (provenance.kind === 'mine') return t('cookbook.provenance.mine')
  if (provenance.kind === 'added') return t('cookbook.provenance.added', { author: provenance.authorName ?? t('prompts.someone') })
  return provenance.originalTitle
    ? t('cookbook.provenance.copyOf', { title: provenance.originalTitle })
    : t('cookbook.provenance.copy')
})

const icon = computed(() =>
  props.provenance.kind === 'mine' ? 'i-lucide-user' : props.provenance.kind === 'added' ? 'i-lucide-bookmark' : 'i-lucide-copy'
)
</script>
