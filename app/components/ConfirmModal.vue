<template>
  <UModal
    :open="show"
    :title="title"
    :description="message"
    @update:open="onUpdateOpen"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="cancelText" @click="handleCancel" />
        <UButton color="error" :label="confirmText" :loading="loading" @click="emit('confirm')" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
/**
 * Modale de confirmation (API inchangée pour les pages existantes) :
 * props `show`, `title`, `message`, `confirmText`, `cancelText` ;
 * émet `confirm`, et `cancel` + `close` à l'annulation (bouton, Échap, fond).
 */
withDefaults(defineProps<{
  show?: boolean
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** Affiche un état de chargement sur le bouton de confirmation. */
  loading?: boolean
}>(), {
  show: false,
  title: 'Confirmation',
  message: 'Êtes-vous sûr de vouloir effectuer cette action ?',
  confirmText: 'Confirmer',
  cancelText: 'Annuler',
  loading: false
})

const emit = defineEmits<{
  confirm: []
  cancel: []
  close: []
}>()

const handleCancel = () => {
  emit('cancel')
  emit('close')
}

const onUpdateOpen = (open: boolean) => {
  if (!open) handleCancel()
}
</script>
