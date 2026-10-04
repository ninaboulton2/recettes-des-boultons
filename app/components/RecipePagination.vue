<template>
  <nav class="flex justify-center" :aria-label="$t('ui.pagination.label')">
    <!--
      Mobile : pas de pages voisines (la version complète débordait à 375 px).
      Boutons fournis par les slots : les libellés accessibles par défaut
      (« First Page », « Page 2 »…) sont écrits en dur en anglais dans
      reka-ui et ne suivent pas la locale de UApp.
    -->
    <UPagination
      v-for="layout in layouts"
      :key="layout.key"
      v-model:page="page"
      :total="total"
      :items-per-page="itemsPerPage"
      :sibling-count="layout.siblingCount"
      show-edges
      :size="layout.size"
      :class="layout.class"
    >
      <template #first>
        <UButton color="neutral" variant="outline" :size="layout.size" icon="i-lucide-chevrons-left" :aria-label="$t('ui.pagination.first')" />
      </template>
      <template #prev>
        <UButton color="neutral" variant="outline" :size="layout.size" icon="i-lucide-chevron-left" :aria-label="$t('ui.pagination.previous')" />
      </template>
      <template #item="{ item, page: current }">
        <UButton
          v-if="item.type === 'page'"
          :color="current === item.value ? 'primary' : 'neutral'"
          :variant="current === item.value ? 'solid' : 'outline'"
          :size="layout.size"
          :label="String(item.value)"
          :aria-label="$t('ui.pagination.page', { page: item.value })"
          :ui="{ label: 'min-w-5 text-center' }"
          square
        />
      </template>
      <template #next>
        <UButton color="neutral" variant="outline" :size="layout.size" icon="i-lucide-chevron-right" :aria-label="$t('ui.pagination.next')" />
      </template>
      <template #last>
        <UButton color="neutral" variant="outline" :size="layout.size" icon="i-lucide-chevrons-right" :aria-label="$t('ui.pagination.last')" />
      </template>
    </UPagination>
  </nav>
</template>

<script setup lang="ts">
/** Pagination des listes de recettes, compacte sur mobile. */
defineProps<{ total: number, itemsPerPage: number }>()
const page = defineModel<number>('page', { required: true })

const layouts = [
  { key: 'mobile', siblingCount: 0, size: 'sm', class: 'sm:hidden' },
  { key: 'desktop', siblingCount: 1, size: 'md', class: 'hidden sm:flex' }
] as const
</script>
