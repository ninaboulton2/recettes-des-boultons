<template>
  <form
    class="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-default bg-default p-3 sm:grid-cols-[1fr_6rem_11rem_auto] print:hidden"
    :aria-label="$t('shopping.addItem.title')"
    @submit.prevent="submit"
  >
    <UInput
      ref="nameInput"
      v-model="name"
      :placeholder="$t('shopping.addItem.namePlaceholder')"
      :aria-label="$t('shopping.addItem.name')"
      icon="i-lucide-shopping-basket"
      class="col-span-2 sm:col-span-1"
      :size="size"
      maxlength="200"
      required
    />
    <UInput
      v-model="amount"
      :placeholder="$t('shopping.addItem.quantity')"
      :aria-label="$t('shopping.addItem.quantity')"
      inputmode="decimal"
      :size="size"
      maxlength="50"
    />
    <ShoppingUnitSelect v-model="unit" :size="size" class="min-w-0" />
    <UButton
      type="submit"
      :label="$t('shopping.addItem.button')"
      icon="i-lucide-plus"
      :size="size"
      :loading="submitting"
      :disabled="!name.trim()"
      class="col-span-2 justify-center sm:col-span-1"
    />
  </form>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'

export interface AddItemPayload {
  name: string
  amount: string | null
  unit: string | null
}

/**
 * Saisie d'un article : nom, quantité (texte libre : « 2 », « 1/2 »…) et unité
 * (référentiel ou saisie libre). La fusion avec un article existant est faite en base.
 */
withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg' | 'xl'
}>(), { size: 'md' })

const emit = defineEmits<{
  /** `done(true)` vide le formulaire ; `done(false)` conserve la saisie. */
  submit: [payload: AddItemPayload, done: (success: boolean) => void]
}>()

const name = ref('')
const amount = ref('')
const unit = ref('')
const submitting = ref(false)
const nameInput = ref<{ inputRef?: HTMLInputElement } | null>(null)

const submit = () => {
  const trimmedName = name.value.trim()
  if (!trimmedName || submitting.value) return
  submitting.value = true
  emit('submit', {
    name: trimmedName,
    amount: amount.value.trim() || null,
    unit: unit.value.trim() || null
  }, async (success) => {
    submitting.value = false
    if (success) {
      name.value = ''
      amount.value = ''
      unit.value = ''
      await nextTick()
      nameInput.value?.inputRef?.focus()
    }
  })
}
</script>
