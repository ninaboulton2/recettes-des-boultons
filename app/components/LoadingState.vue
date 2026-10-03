<template>
  <div class="flex flex-col items-center justify-center gap-3 py-12 text-center" role="status" aria-live="polite">
    <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" aria-hidden="true" />
    <p class="text-sm text-muted">{{ message || $t('ui.common.loading') }}</p>
  </div>
</template>

<script setup lang="ts">
/** État de chargement pleine largeur (spinner + message). */
withDefaults(defineProps<{ message?: string }>(), { message: '' })
</script>
