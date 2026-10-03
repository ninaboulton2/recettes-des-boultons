<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-languages"
      :label="locale.toUpperCase()"
      :aria-label="$t('ui.language.label')"
    />
  </UDropdownMenu>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

/** Sélecteur de langue (FR / EN) : navigation vers la route localisée. */
const { locale, locales, setLocale } = useI18n()

const items = computed<DropdownMenuItem[]>(() =>
  locales.value.map(entry => ({
    label: entry.name ?? entry.code,
    icon: locale.value === entry.code ? 'i-lucide-check' : undefined,
    disabled: locale.value === entry.code,
    onSelect: () => { void setLocale(entry.code) }
  }))
)
</script>
