<template>
  <div v-if="sections && sections.length > 0" class="mb-6 sm:mb-8">
    <h2 class="text-xl sm:text-2xl font-semibold text-gray-900 mb-3 sm:mb-4">Recette</h2>
    
    <div class="space-y-6">
      <div 
        v-for="section in sections" 
        :key="section.id"
        class="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm"
      >
        <!-- En-tête de la section -->
        <h3 class="text-lg sm:text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <span class="bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-medium mr-3">
            {{ getSectionTypeLabel(section.type) }}
          </span>
          {{ section.name }}
        </h3>

        <!-- Ingrédients de la section -->
        <div v-if="section.ingredients && section.ingredients.length > 0" class="mb-4">
          <h4 class="text-md font-medium text-gray-700 mb-2 flex items-center">
            <svg class="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
            </svg>
            Ingrédients
          </h4>
          <ul class="list-disc list-inside space-y-1 text-sm sm:text-base text-gray-800 ml-4">
            <li v-for="ingredient in section.ingredients" :key="ingredient.id" class="flex items-start">
              <span class="flex-1">
                {{ formatIngredient(ingredient) }}
              </span>
              <span v-if="ingredient.optional" class="text-xs text-gray-500 ml-2">(optionnel)</span>
            </li>
          </ul>
        </div>

        <!-- Instructions de la section -->
        <div v-if="section.instructions && section.instructions.length > 0">
          <h4 class="text-md font-medium text-gray-700 mb-2 flex items-center">
            <svg class="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            Instructions
          </h4>
          <ol class="list-decimal list-inside space-y-2 text-sm sm:text-base text-gray-800 ml-4">
            <li v-for="instruction in section.instructions" :key="instruction.id">
              {{ instruction.content }}
            </li>
          </ol>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  sections: {
    type: Array,
    default: () => []
  }
})

const getSectionTypeLabel = (type) => {
  const labels = {
    'ingredients': 'Ingrédients',
    'instructions': 'Instructions', 
    'mixed': 'Complet'
  }
  return labels[type] || 'Section'
}

const formatIngredient = (ingredient) => {
  let formatted = ''
  if (ingredient.amount) {
    formatted += ingredient.amount + ' '
  }
  if (ingredient.unit) {
    formatted += ingredient.unit + ' '
  }
  formatted += ingredient.name
  return formatted
}
</script>

<style scoped>
/* Styles spécifiques si nécessaire */
</style>
