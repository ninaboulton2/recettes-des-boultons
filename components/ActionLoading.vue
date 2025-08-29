<template>
  <div class="flex items-center justify-center">
    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600 mr-2"></div>
    <span class="text-sm text-gray-600">{{ message || 'Chargement...' }}</span>
  </div>
</template>

<script setup>
defineProps({
  message: {
    type: String,
    default: 'Chargement...'
  }
})
</script>
