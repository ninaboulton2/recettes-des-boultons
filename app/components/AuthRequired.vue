<template>
  <div class="mx-auto flex max-w-md flex-col items-center px-4 py-12 text-center">
    <div class="mb-6 flex size-16 items-center justify-center rounded-full bg-muted">
      <UIcon name="i-lucide-lock" class="size-8 text-dimmed" aria-hidden="true" />
    </div>
    <h2 class="font-serif text-2xl font-semibold text-highlighted">
      {{ $t('auth.required.title') }}
    </h2>
    <p class="mt-3 text-muted">
      {{ $t('auth.required.description') }}
    </p>
    <UButton class="mt-8" size="lg" block icon="i-lucide-log-in" :label="$t('auth.required.loginButton')" @click="emit('login')" />
    <UButton class="mt-4" variant="link" color="neutral" to="/" :label="$t('auth.required.backToHome')" />
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{ login: [] }>()
</script>
