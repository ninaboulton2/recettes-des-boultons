<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <!-- Logo -->
          <div class="flex items-center">
            <NuxtLink to="/" class="flex items-center space-x-3">
              <img src="/images/logo.png" alt="Logo" class="h-10">
              <span class="text-2xl font-lobster" style="color: rgb(123, 136, 189);">{{ $t('meta.title') }}</span>
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
                {{ $t('navigation.home') }}
              </NuxtLink>
              <NuxtLink 
                to="/recettes" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path.startsWith('/recettes') }"
              >
                {{ $t('navigation.recipes') }}
              </NuxtLink>
              <NuxtLink 
                to="/favoris" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path === '/favoris' }"
              >
                {{ $t('navigation.favorites') }}
              </NuxtLink>
              <NuxtLink 
                to="/courses" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path.startsWith('/courses') }"
              >
                {{ $t('navigation.shopping') }}
              </NuxtLink>
              <NuxtLink 
                to="/planning" 
                class="nav-link"
                :class="{ 'nav-link-active': $route.path === '/planning' }"
              >
                {{ $t('navigation.planning') }}
              </NuxtLink>
              
              <!-- Language Switcher -->
              <div class="ml-4">
                <LanguageSwitcher />
              </div>
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
              {{ $t('navigation.home') }}
            </NuxtLink>
            <NuxtLink 
              to="/recettes" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path.startsWith('/recettes') }"
              @click="mobileMenuOpen = false"
            >
              {{ $t('navigation.recipes') }}
            </NuxtLink>
            <NuxtLink 
              to="/favoris" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path === '/favoris' }"
              @click="mobileMenuOpen = false"
            >
              {{ $t('navigation.favorites') }}
            </NuxtLink>
            <NuxtLink 
              to="/courses" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path.startsWith('/courses') }"
              @click="mobileMenuOpen = false"
            >
              {{ $t('navigation.shopping') }}
            </NuxtLink>
            <NuxtLink 
              to="/planning" 
              class="nav-link block px-3 py-2"
              :class="{ 'nav-link-active': $route.path === '/planning' }"
              @click="mobileMenuOpen = false"
            >
              {{ $t('navigation.planning') }}
            </NuxtLink>
            
            <!-- Mobile Language Switcher -->
            <div class="border-t border-gray-200 pt-2 mt-2">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </nav>
    </header>

    <!-- Main content -->
    <main v-if="$route.path === '/'" class="w-full flex-1">
      <slot />
    </main>
    <main v-else class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="bg-white border-t border-gray-200 mt-auto">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="text-center text-gray-600">
          <p>{{ $t('footer.copyright', { year: new Date().getFullYear() }) }}</p>
        </div>
      </div>
    </footer>

    <!-- Toast Container -->
    <ToastContainer ref="toastContainer" />
  </div>
</template>

<script setup>
import ToastContainer from '@/components/ToastContainer.vue'

const mobileMenuOpen = ref(false)
const toastContainer = ref()

// Setup global toast container
onMounted(() => {
  if (process.client) {
    window.$toastContainer = toastContainer.value
  }
})
</script> 