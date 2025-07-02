<template>
  <div class="min-h-screen bg-gray-50 py-12">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="text-center mb-12">
        <h1 class="text-4xl font-lobster text-gray-900 mb-4">
          Ajouter une recette
        </h1>
        <p class="text-xl text-gray-600 max-w-3xl mx-auto">
          Ajouter une recette depuis Google Drive pour l'intégrer dans l'application
        </p>
      </div>
      <!-- Composant traducteur -->
      <RecipeTranslator />

    </div>
  </div>
</template>

<script setup>
import RecipeTranslator from '@/components/RecipeTranslator.vue'

// SEO
useHead({
  title: 'Traducteur de Recettes - Recettes des Boultons',
  meta: [
    { name: 'description', content: 'Convertissez vos recettes depuis Google Drive en format JSON structuré pour les intégrer dans votre application de recettes.' }
  ]
})
</script> 