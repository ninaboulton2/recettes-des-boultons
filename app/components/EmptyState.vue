<template>
  <div class="mx-auto flex max-w-md flex-col items-center py-12 text-center">
    <div class="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
      <UIcon :name="icon" class="size-7 text-dimmed" aria-hidden="true" />
    </div>
    <h3 class="font-serif text-xl font-semibold text-highlighted">{{ title }}</h3>
    <p class="mt-2 text-sm text-muted">{{ message }}</p>
    <div class="mt-6">
      <slot name="action">
        <UButton v-if="actionText && actionHandler" :label="actionText" @click="actionHandler" />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * État vide. `icon` : icône Lucide (`i-lucide-*`). `iconPath` (ancien chemin
 * SVG) est accepté pour compatibilité mais ignoré.
 */
withDefaults(defineProps<{
  title: string
  message: string
  icon?: string
  iconPath?: string
  actionText?: string
  actionHandler?: (() => void) | null
}>(), {
  icon: 'i-lucide-inbox',
  iconPath: '',
  actionText: '',
  actionHandler: null
})
</script>
