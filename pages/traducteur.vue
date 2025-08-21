<template>
  <div class="min-h-screen bg-gray-50 py-12">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Bouton retour -->
      <div class="mb-6">
        <button @click="$router.back()" class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Retour
        </button>
      </div>
      
      <!-- Header -->
      <div class="text-center mb-12">
        <h1 class="text-4xl font-lobster text-gray-900 mb-4">
          Ajouter une recette
        </h1>
        <p class="text-xl text-gray-600 max-w-3xl mx-auto">
          Rentrer le texte brut d'une recette pour l'intégrer dans l'application (par exemple depuis le Google Drive des Recettes des Boultons)
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