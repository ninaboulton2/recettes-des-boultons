<template>
  <nav class="flex justify-center" :aria-label="$t('ui.pagination.label')">
    <!-- Mobile : pas de pages voisines (la version complète débordait à 375 px) -->
    <UPagination v-model:page="page" :total="total" :items-per-page="itemsPerPage" :sibling-count="0" show-edges size="sm" class="sm:hidden" />
    <UPagination v-model:page="page" :total="total" :items-per-page="itemsPerPage" :sibling-count="1" show-edges class="hidden sm:flex" />
  </nav>
</template>

<script setup lang="ts">
/** Pagination des listes de recettes, compacte sur mobile. */
defineProps<{ total: number, itemsPerPage: number }>()
const page = defineModel<number>('page', { required: true })
</script>
