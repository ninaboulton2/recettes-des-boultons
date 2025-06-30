<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <!-- Logo -->
          <div class="flex items-center">
            <NuxtLink to="/" class="flex items-center space-x-3">
              <img src="/images/logo.png" alt="Logo" class="h-10 w-10">
              <span class="text-2xl font-lobster text-primary-600">Recettes des Boultons</span>
            </NuxtLink>
          </div>

          <!-- Navigation -->
          <div class="hidden md:block">
            <div class="ml-10 flex items-baseline space-x-4">
              <NuxtLink 
                to="/" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path === '/' }"
              >
                Accueil
              </NuxtLink>
              <NuxtLink 
                to="/recettes" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path.startsWith('/recettes') }"
              >
                Recettes
              </NuxtLink>
              <NuxtLink 
                to="/favoris" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path === '/favoris' }"
              >
                Favoris
              </NuxtLink>
              <NuxtLink 
                to="/courses" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path.startsWith('/courses') }"
              >
                Courses
              </NuxtLink>
              <NuxtLink 
                to="/planning" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path === '/planning' }"
              >
                Planning
              </NuxtLink>
            </div>
          </div>

          <!-- Mobile menu button -->
          <div class="md:hidden">
            <button 
              @click="mobileMenuOpen = !mobileMenuOpen"
              class="text-gray-700 hover:text-primary-600 focus:outline-none focus:text-primary-600"
            >
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path v-if="!mobileMenuOpen" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Mobile menu -->
        <div v-show="mobileMenuOpen" class="md:hidden">
          <div class="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t border-gray-200">
            <NuxtLink 
              to="/" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path === '/' }"
              @click="mobileMenuOpen = false"
            >
              Accueil
            </NuxtLink>
            <NuxtLink 
              to="/recettes" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path.startsWith('/recettes') }"
              @click="mobileMenuOpen = false"
            >
              Recettes
            </NuxtLink>
            <NuxtLink 
              to="/favoris" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path === '/favoris' }"
              @click="mobileMenuOpen = false"
            >
              Favoris
            </NuxtLink>
            <NuxtLink 
              to="/courses" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path.startsWith('/courses') }"
              @click="mobileMenuOpen = false"
            >
              Courses
            </NuxtLink>
            <NuxtLink 
              to="/planning" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path === '/planning' }"
              @click="mobileMenuOpen = false"
            >
              Planning
            </NuxtLink>
          </div>
        </div>
      </nav>
    </header>

    <!-- Main content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="bg-white border-t border-gray-200 mt-auto">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="text-center text-gray-600">
          <p>&copy; {{ new Date().getFullYear() }} Recettes des Boultons. Tous droits réservés.</p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
const mobileMenuOpen = ref(false)
</script> 