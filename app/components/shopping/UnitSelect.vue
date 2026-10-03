<template>
  <USelectMenu
    :model-value="modelValue || NO_UNIT"
    :items="items"
    value-key="value"
    :placeholder="$t('shopping.addItem.unit')"
    :search-input="{ placeholder: $t('shopping.addItem.unitSearch') }"
    create-item
    :size="size"
    :class="props.class"
    :aria-label="$t('shopping.addItem.unit')"
    @update:model-value="onSelect"
    @create="onCreate"
  >
    <template #create-item-label="{ item }">
      {{ $t('shopping.addItem.unitFree', { unit: item }) }}
    </template>
  </USelectMenu>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface UnitOption {
  label: string
  value: string
}

/** Valeur interne de « sans unité » (Reka refuse une option à valeur vide). */
const NO_UNIT = '__none__'

/**
 * Choix d'une unité parmi le référentiel `units` (code canonique), avec saisie
 * libre (« sachet de levure ») : la valeur est alors le texte tapé, que le
 * serveur normalisera (`normalize_unit`) ou conservera tel quel.
 * `modelValue` : code d'unité, texte libre ou `''` (sans unité).
 */
const props = withDefaults(defineProps<{
  modelValue: string | null | undefined
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  class?: string
}>(), { size: 'md', class: '' })

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t, locale } = useI18n()
const { units } = useUnits()

const items = computed<UnitOption[]>(() => {
  const known: UnitOption[] = (units.value ?? []).map(unit => ({
    value: unit.code,
    label: `${unit.abbr} — ${locale.value === 'en' ? unit.label_en : unit.label_fr}`
  }))
  const current = props.modelValue ?? ''
  const extra = current !== '' && !known.some(item => item.value === current)
    ? [{ value: current, label: current }]
    : []
  return [{ value: NO_UNIT, label: t('shopping.addItem.noUnit') }, ...extra, ...known]
})

const onSelect = (value: unknown) => {
  emit('update:modelValue', typeof value === 'string' && value !== NO_UNIT ? value : '')
}

const onCreate = (value: string) => {
  emit('update:modelValue', value.trim())
}
</script>
