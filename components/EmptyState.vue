<template>
  <div class="text-center py-12">
    <div class="max-w-md mx-auto">
      <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="iconPath"></path>
      </svg>
      <h3 class="text-lg font-semibold text-gray-900 mb-2">
        {{ title }}
      </h3>
      <p class="text-gray-600 mb-4">
        {{ message }}
      </p>
      <slot name="action">
        <button v-if="actionText && actionHandler" @click="actionHandler" class="btn-primary">
          {{ actionText }}
        </button>
      </slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  iconPath: {
    type: String,
    default: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z'
  },
  actionText: {
    type: String,
    default: ''
  },
  actionHandler: {
    type: Function,
    default: null
  }
})
</script>
