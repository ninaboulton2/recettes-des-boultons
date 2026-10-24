<template>
  <CookbookPage v-if="v2" />
  <RecipesListV1 v-else />
</template>

<script setup lang="ts">
// v2 : Mon carnet (list_cookbook) ; v1 : la liste des recettes d'origine, inchangée (components/RecipesListV1.vue).
const v2 = useV2()
</script>
