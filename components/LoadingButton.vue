<template>
  <button
    :class="[
      'inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      variant === 'primary' && 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
      variant === 'secondary' && 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500',
      variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      variant === 'success' && 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
      variant === 'warning' && 'bg-orange-600 text-white hover:bg-orange-700 focus:ring-orange-500',
      size === 'sm' && 'px-3 py-1.5 text-xs',
      size === 'lg' && 'px-6 py-3 text-base'
    ]"
    :disabled="disabled || loading"
    v-bind="$attrs"
  >
    <div v-if="loading" class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
    <slot />
  </button>
</template>

<script setup>
defineProps({
  loading: {
    type: Boolean,
    default: false
  },
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'danger', 'success', 'warning'].includes(value)
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },
  disabled: {
    type: Boolean,
    default: false
  }
})
</script>
