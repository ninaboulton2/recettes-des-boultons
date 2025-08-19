<template>
  <div class="relative" data-language-dropdown>
    <!-- Desktop Language Switcher -->
    <div class="hidden md:block">
      <button
        @click="dropdownOpen = !dropdownOpen"
        class="nav-link flex items-center space-x-1"
      >
        <span>{{ currentFlag }}</span>
        <span>{{ currentCode }}</span>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>
      
      <!-- Dropdown -->
      <div v-if="dropdownOpen" class="absolute right-0 mt-2 w-40 bg-white border border-gray-300 rounded-lg shadow-lg z-50">
        <div class="py-1">
          <button
            @click="changeLanguage('fr')"
            class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
            :class="{ 'bg-primary-50 text-primary-600': locale === 'fr' }"
          >
            <span>🇫🇷</span>
            <span>Français</span>
          </button>
          <div class="px-4 py-2 text-sm text-gray-500 border-t border-gray-200">
            <div class="flex items-center space-x-2">
              <span>🇺🇸</span>
              <span>English</span>
            </div>
            <div class="text-xs text-gray-400 mt-1 italic">Coming soon...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile Language Switcher -->
    <div class="md:hidden">
      <div class="flex space-x-2">
        <button
          @click="changeLanguage('fr')"
          class="flex-1 px-3 py-2 text-sm rounded-lg border"
          :class="locale === 'fr' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300'"
        >
          🇫🇷 Français
        </button>
        <button
          disabled
          class="flex-1 px-3 py-2 text-sm rounded-lg border bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
        >
          🇺🇸 English
          <div class="text-xs italic">Coming soon...</div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const dropdownOpen = ref(false)

// Computed properties for current language display
const currentFlag = computed(() => {
  return locale.value === 'fr' ? '🇫🇷' : '🇺🇸'
})

const currentCode = computed(() => {
  return locale.value === 'fr' ? 'FR' : 'EN'
})

// Function to change language (only French is functional for now)
const changeLanguage = (lang) => {
  if (lang === 'fr') {
    locale.value = lang
    dropdownOpen.value = false
  }
  // English is disabled for now
}

// Close dropdown when clicking outside
onMounted(() => {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-language-dropdown]')) {
      dropdownOpen.value = false
    }
  })
})
</script> 