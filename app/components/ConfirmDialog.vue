<template>
  <UModal
    :open="open"
    :title="title"
    :description="description"
    :ui="{ footer: 'justify-end' }"
    @update:open="value => emit('update:open', value)"
  >
    <template v-if="$slots.default" #body>
      <slot />
    </template>
    <template #footer>
      <UButton :label="cancelLabel ?? $t('ui.common.cancel')" color="neutral" variant="ghost" data-testid="confirm-cancel" @click="emit('update:open', false)" />
      <UButton :label="confirmLabel" :color="color" :loading="loading" data-testid="confirm-ok" @click="emit('confirm')" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
/**
 * Confirmation avant une action qui ne se défait pas (retirer un ami ou un membre, passer le rôle de créateur, supprimer
 * un groupe, quitter). Échap et le bouton « Annuler » ferment (comportement de la modale). Le parent ferme après succès.
 */
withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  color?: 'primary' | 'error' | 'neutral'
  loading?: boolean
}>(), { description: undefined, cancelLabel: undefined, color: 'error', loading: false })

const emit = defineEmits<{ 'update:open': [value: boolean], 'confirm': [] }>()
</script>
