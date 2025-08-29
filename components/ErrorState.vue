<template>
  <div class="text-center py-12">
    <div class="max-w-md mx-auto">
      <svg class="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
      </svg>
      <h3 class="text-lg font-semibold text-red-900 mb-2">
        {{ title || 'Erreur de chargement' }}
      </h3>
      <p class="text-red-600 mb-4">
        {{ message }}
      </p>
      <button v-if="retryAction" @click="retryAction" class="btn-primary">
        {{ retryText || 'Réessayer' }}
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: 'Erreur de chargement'
  },
  message: {
    type: String,
    required: true
  },
  retryAction: {
    type: Function,
    default: null
  },
  retryText: {
    type: String,
    default: 'Réessayer'
  }
})
</script>
