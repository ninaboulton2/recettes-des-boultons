<template>
  <!-- v2 : photo PRIVÉE, adresse signée (change à chaque signature) → <img> natif, jamais NuxtImg : l'optimiseur d'images
       (Vercel / ipx) compterait une nouvelle image source à chaque signature et ne pourrait pas la mettre en cache. La photo
       est déjà réduite au téléversement (1 600 px, WebP) et le navigateur la garde en cache tant que l'adresse reste la même. -->
  <img
    v-if="url && v2"
    :src="url"
    alt=""
    :width="width"
    :height="height"
    loading="lazy"
    decoding="async"
    referrerpolicy="no-referrer"
  >
  <!-- v1 : URL publique du bucket, optimisée par @nuxt/image (inchangé) -->
  <NuxtImg
    v-else-if="url"
    :src="url"
    alt=""
    :sizes="sizes"
    :width="width"
    :height="height"
    :densities="densities"
    fit="cover"
    format="webp"
    loading="lazy"
    decoding="async"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * Photo d'une recette : v1 = URL publique + NuxtImg ; v2 = URL signée + <img>. Donner soit `src` (déjà résolue par `usePhotoSrc`,
 * quand le parent a besoin de savoir s'il y a une photo), soit `path` (chemin du bucket : la résolution se fait ici).
 * Ne rend rien tant qu'il n'y a pas d'adresse (l'appelant garde son repli).
 */
const props = defineProps<{
  src?: string | null
  path?: string | null
  width?: number
  height?: number
  sizes?: string
  densities?: string
}>()

const v2 = useV2()
const resolved = usePhotoSrc(() => props.path)
const url = computed(() => props.src ?? resolved.value)
</script>
