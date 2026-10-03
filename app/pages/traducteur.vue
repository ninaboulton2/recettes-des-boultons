<template>
  <div class="min-h-screen bg-default py-10">
    <UContainer class="max-w-3xl">
      <div class="mb-6">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          :label="$t('translator.back')"
          @click="goBack"
        />
      </div>

      <header class="mb-8 text-center">
        <h1 class="font-serif text-4xl text-highlighted">{{ $t('translator.title') }}</h1>
        <p class="mx-auto mt-3 max-w-2xl text-muted">{{ $t('translator.subtitle') }}</p>
      </header>

      <RecipeTranslator />
    </UContainer>
  </div>
</template>

<script setup lang="ts">
/**
 * Page /traducteur (administrateurs) : ajout d'une recette depuis un texte
 * brut via l'IA. La garde `requiresAdmin` n'est qu'un confort d'affichage :
 * le serveur revérifie (`requireAdmin`).
 */
definePageMeta({ requiresAdmin: true })

const { t } = useI18n()
const router = useRouter()

useHead({
  title: `${t('translator.title')} - Recettes des Boultons`,
  meta: [{ name: 'description', content: t('translator.subtitle') }]
})

function goBack(): void {
  if (window.history.length > 1) router.back()
  else navigateTo('/recettes')
}
</script>
