<template>
  <div class="inline-flex items-center gap-2" role="status" aria-live="polite">
    <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-primary" aria-hidden="true" />
    <span class="text-sm text-muted">{{ message || $t('ui.common.loading') }}</span>
  </div>
</template>

<script setup lang="ts">
/** Indicateur de chargement compact, en ligne. */
withDefaults(defineProps<{ message?: string }>(), { message: '' })
</script>
