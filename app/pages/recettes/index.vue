<template>
  <CookbookPage v-if="v2" />
  <RecipesListV1 v-else />
</template>

<script setup lang="ts">
// v2 : Mon carnet (list_cookbook) ; v1 : la liste des recettes d'origine, inchangée (components/RecipesListV1.vue).
const v2 = useV2()
// v2 : « Mon carnet » est dans la barre de navigation du visiteur ; sans compte, la connexion s'ouvre puis ramène ici (sans effet en v1).
definePageMeta({ middleware: 'v2-members' })
</script>
