<template>
  <div class="fixed top-4 right-4 z-50 space-y-4">
    <Toast
      v-for="toast in toasts"
      :key="toast.id"
      :show="true"
      :title="toast.title"
      :message="toast.message"
      :type="toast.type"
      :duration="toast.duration"
      @close="removeToast(toast.id)"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Toast from './Toast.vue'

const toasts = ref([])
let nextId = 1

const addToast = (toast) => {
  const id = nextId++
  const newToast = {
    id,
    ...toast
  }
  toasts.value.push(newToast)
  
  // Auto-remove après la durée spécifiée
  if (toast.duration !== 0) {
    setTimeout(() => {
      removeToast(id)
    }, toast.duration || 3000)
  }
}

const removeToast = (id) => {
  const index = toasts.value.findIndex(toast => toast.id === id)
  if (index > -1) {
    toasts.value.splice(index, 1)
  }
}

// Exposer les méthodes pour une utilisation globale
const showToast = (title, message = '', type = 'info', duration = 3000) => {
  addToast({ title, message, type, duration })
}

const showSuccessToast = (title, message = '', duration = 3000) => {
  showToast(title, message, 'success', duration)
}

const showErrorToast = (title, message = '', duration = 3000) => {
  showToast(title, message, 'error', duration)
}

const showInfoToast = (title, message = '', duration = 3000) => {
  showToast(title, message, 'info', duration)
}

// Exposer les méthodes globalement
if (process.client) {
  window.$toast = {
    show: showToast,
    success: showSuccessToast,
    error: showErrorToast,
    info: showInfoToast
  }
}

defineExpose({
  show: showToast,
  success: showSuccessToast,
  error: showErrorToast,
  info: showInfoToast
})
</script> 