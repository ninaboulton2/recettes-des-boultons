<template>
  <div class="flex flex-col items-center justify-center py-12 px-4">
    <div class="text-center max-w-md">
      <!-- Icône de cadenas -->
      <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 mb-6">
        <svg class="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
        </svg>
      </div>
      
      <!-- Titre -->
      <h2 class="text-2xl font-bold text-gray-900 mb-4">
        {{ $t('auth.required.title') }}
      </h2>
      
      <!-- Description -->
      <p class="text-gray-600 mb-8">
        {{ $t('auth.required.description') }}
      </p>
      
      <!-- Bouton de connexion -->
      <button
        @click="$emit('login')"
        class="w-full bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
      >
        {{ $t('auth.required.loginButton') }}
      </button>
      
      <!-- Lien vers la page d'accueil -->
      <div class="mt-6">
        <NuxtLink 
          to="/" 
          class="text-blue-600 hover:text-blue-500 font-medium"
        >
          {{ $t('auth.required.backToHome') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup>
defineEmits(['login'])
</script>
