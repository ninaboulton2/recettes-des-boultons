<template>
  <UButton
    :color="COLORS[variant]"
    :variant="variant === 'secondary' ? 'soft' : 'solid'"
    :size="SIZES[size]"
    :loading="loading"
    :disabled="disabled"
    v-bind="$attrs"
  >
    <slot />
  </UButton>
</template>

<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'warning'
type Size = 'sm' | 'md' | 'lg'

/** Bouton avec état de chargement (API historique conservée, rendu <UButton>). */
withDefaults(defineProps<{
  loading?: boolean
  variant?: Variant
  size?: Size
  disabled?: boolean
}>(), {
  loading: false,
  variant: 'primary',
  size: 'md',
  disabled: false
})

const COLORS: Record<Variant, ButtonProps['color']> = {
  primary: 'primary',
  secondary: 'neutral',
  danger: 'error',
  success: 'success',
  warning: 'warning'
}

const SIZES: Record<Size, ButtonProps['size']> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg'
}
</script>
