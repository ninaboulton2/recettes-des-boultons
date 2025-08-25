<template>
  <div>
    <!-- Modal de connexion -->
    <LoginModal
      v-if="!showSignUp"
      :is-open="isOpen"
      @close="$emit('close')"
      @success="$emit('success')"
      @switch-to-sign-up="showSignUp = true"
    />

    <!-- Modal d'inscription -->
    <SignUpModal
      v-else
      :is-open="isOpen"
      @close="$emit('close')"
      @success="$emit('success')"
      @switch-to-login="showSignUp = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import LoginModal from './LoginModal.vue'
import SignUpModal from './SignUpModal.vue'

interface Props {
  isOpen: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'success'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const showSignUp = ref(false)

// Reset to login when modal opens
watch(() => props.isOpen, (newValue) => {
  if (newValue) {
    showSignUp.value = false
  }
})
</script>
