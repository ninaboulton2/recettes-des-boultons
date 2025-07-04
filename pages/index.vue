<template>
  <div class="w-full min-h-screen">
    <!-- Hero Section - Diagonal Blue/White FULL WIDTH -->
    <div class="relative min-h-screen w-full diagonal-bg overflow-hidden flex items-center justify-center">
      <div class="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center justify-between min-h-screen">
        <!-- Texte à gauche -->
        <div class="flex-1 flex flex-col justify-center items-start lg:items-start py-16 lg:py-0">
          <h1 class="text-5xl md:text-6xl font-lobster text-white mb-6 drop-shadow-lg">
            Recettes des Boultons
          </h1>
          <p class="text-lg md:text-xl text-white mb-8 max-w-md">
            Retrouvez ici toutes les recettes préférées des Boultons !
          </p>
          <div class="flex flex-col sm:flex-row gap-4">
            <NuxtLink to="/recettes" class="btn-primary text-lg px-8 py-3 shadow-lg">
              Voir les recettes
            </NuxtLink>
            <NuxtLink to="/traducteur" class="btn-secondary text-lg px-8 py-3 shadow-lg">
              Ajouter une recette
            </NuxtLink>
          </div>
        </div>
        <!-- Illustration à droite -->
        <div class="flex-1 flex justify-center items-center w-full lg:w-auto mt-12 lg:mt-0">
          <div class="bg-white rounded-3xl shadow-2xl p-8 md:p-12 flex items-center justify-center" style="max-width: 500px;">
            <img 
              src="/images/boultons.png" 
              alt="Famille Boultons" 
              class="w-full h-auto object-contain"
              style="max-width: 420px;"
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Categories Section -->
    <section class="py-16 w-full">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <h2 class="text-4xl font-lobster text-gray-900 mb-4">
            Explorez nos catégories
          </h2>
          <p class="text-xl text-gray-600 max-w-3xl mx-auto">
            Découvrez nos recettes organisées par catégories pour trouver facilement ce qui vous plaît
          </p>
        </div>
        <CategoryGrid :categories="categories" />
      </div>
    </section>

    <!-- Features Section -->
    <section class="py-16 bg-white w-full">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12">
          <h2 class="text-4xl font-lobster text-gray-900 mb-4">
            Fonctionnalités
          </h2>
          <p class="text-xl text-gray-600">
            Tout ce dont vous avez besoin pour organiser vos repas
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div class="text-center">
            <div class="bg-primary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-gray-900 mb-2">Recettes détaillées</h3>
            <p class="text-gray-600">Instructions pas à pas, temps de préparation et ingrédients précis</p>
          </div>

          <div class="text-center">
            <div class="bg-secondary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-secondary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-gray-900 mb-2">Listes de courses</h3>
            <p class="text-gray-600">Générez automatiquement vos listes de courses à partir des recettes</p>
          </div>

          <div class="text-center">
            <div class="bg-primary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-gray-900 mb-2">Planning hebdomadaire</h3>
            <p class="text-gray-600">Organisez vos repas de la semaine et planifiez vos menus</p>
          </div>

          <div class="text-center">
            <div class="bg-secondary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-secondary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-gray-900 mb-2">Traducteur IA</h3>
            <p class="text-gray-600">Convertissez et ajoutez automatiquement vos recettes depuis Google Drive</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import CategoryGrid from '@/components/CategoryGrid.vue'
// Définition des catégories
const categories = [
  {
    id: 'soupes',
    name: 'Soupes',
    description: 'Soupes chaudes et froides pour toutes les saisons',
    image: '/images/soupes.png'
  },
  {
    id: 'entrees',
    name: 'Entrées, Salades, Pains et accompagnements',
    description: 'Entrées fraîches et accompagnements savoureux',
    image: '/images/entrees,salades,pains,accompagnements.png'
  },
  {
    id: 'plats',
    name: 'Plats',
    description: 'Plats principaux équilibrés et délicieux',
    image: '/images/plats.png'
  },
  {
    id: 'poissons',
    name: 'Poissons',
    description: 'Recettes de poissons frais et savoureux',
    image: '/images/poissons.png'
  },
  {
    id: 'viandes',
    name: 'Viandes',
    description: 'Plats de viandes traditionnels et modernes',
    image: '/images/viandes.png'
  },
  {
    id: 'yaourts et fromages',
    name: 'Yaourts et fromages',
    description: 'Produits laitiers et fromages artisanaux',
    image: '/images/yaourts&fromages.png'
  },
  {
    id: 'desserts',
    name: 'Desserts',
    description: 'Desserts sucrés et pâtisseries maison',
    image: '/images/desserts.png'
  },
  {
    id: 'boissons',
    name: 'Boissons',
    description: 'Boissons rafraîchissantes et cocktails',
    image: '/images/boissons.png'
  }
]

// SEO
useHead({
  title: 'Accueil - Recettes des Boultons',
  meta: [
    { name: 'description', content: 'Découvrez les recettes préférées de la famille Boultons. Soupes, plats, desserts et plus encore !' }
  ]
})
</script> 