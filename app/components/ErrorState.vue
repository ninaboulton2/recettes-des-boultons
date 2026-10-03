<template>
  <div class="mx-auto flex max-w-md flex-col items-center py-12 text-center" role="alert">
    <div class="mb-4 flex size-14 items-center justify-center rounded-full bg-error/10">
      <UIcon name="i-lucide-triangle-alert" class="size-7 text-error" aria-hidden="true" />
    </div>
    <h3 class="font-serif text-xl font-semibold text-highlighted">{{ title || $t('ui.error.loadTitle') }}</h3>
    <p class="mt-2 text-sm text-muted">{{ message }}</p>
    <UButton
      v-if="retryAction"
      class="mt-6"
      color="neutral"
      variant="outline"
      icon="i-lucide-refresh-cw"
      :label="retryText || $t('ui.common.retry')"
      @click="retryAction"
    />
  </div>
</template>

<script setup lang="ts">
/** État d'erreur avec bouton « Réessayer » optionnel. */
withDefaults(defineProps<{
  title?: string
  message: string
  retryAction?: (() => void) | null
  retryText?: string
}>(), {
  title: '',
  retryAction: null,
  retryText: ''
})
</script>
