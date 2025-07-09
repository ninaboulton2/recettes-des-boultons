<template>
  <!-- Boutons d'action -->
  <div class="mb-6 flex items-center justify-between">
    <button @click="$router.back()" class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors">
      <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Retour
    </button>
    <div class="flex items-center gap-4">
      <button 
        v-if="recipe"
        @click="addToShoppingList" 
        class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors"
      >
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
        </svg>
        Ajouter à la liste de courses
      </button>
      <button 
        v-if="recipe"
        @click="printRecipe" 
        class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors"
      >
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
        </svg>
        Imprimer
      </button>
    </div>
  </div>
  <div v-if="recipe" class="max-w-3xl mx-auto">
    <!-- Header -->
    <div class="mb-8 flex flex-col md:flex-row md:items-center">
      <div class="flex-shrink-0 mb-6 md:mb-0">
      </div>
      <div class="flex-1">
        <h1 class="text-4xl font-lobster text-gray-900 mb-2">{{ recipe.title }}</h1>
        <p class="text-gray-600 mb-4">{{ recipe.description }}</p>
        <div class="flex flex-wrap gap-4 text-sm text-gray-500 mb-2">
          <span><strong>Catégorie :</strong> {{ categoryName }}</span>
          <span><strong>Temps :</strong> {{
            typeof(recipe.prepTime) === 'string' ? recipe.prepTime : recipe.prepTime + recipe.cookTime + ' min'}}</span>          <span><strong>Portions :</strong> {{ recipe.servings }} pers.</span>
        </div>
        <!-- Tags -->
        <div class="flex flex-wrap gap-2 mb-2">
          <span 
            v-for="tag in recipe.tags" 
            :key="tag" 
            class="px-2 py-1 text-xs text-gray-600 rounded-full"
            :class="{
              'bg-green-500 text-white': tag === 'végétarien',
              'bg-emerald-600 text-white': tag === 'vegan',
              'bg-gray-100': tag !== 'végétarien' && tag !== 'vegan'
            }"
          >
            {{ tag }}
          </span>
        </div>
      </div>
    </div>

    <!-- Ingrédients -->
    <div class="mb-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-4">Ingrédients</h2>
      <ul class="list-disc list-inside space-y-1 text-gray-800">
        <li v-for="ingredient in recipe.ingredients" :key="ingredient.name">
          {{ ingredient.amount ? ingredient.amount + ' ' : '' }}{{ ingredient.unit ? ingredient.unit + ' ' : '' }}{{ ingredient.name }}
        </li>
      </ul>
    </div>

    <!-- Instructions -->
    <div class="mb-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-4">Instructions</h2>
      <ol class="list-decimal list-inside space-y-2 text-gray-800">
        <li v-for="(step, i) in recipe.instructions" :key="i">
          {{ step }}
        </li>
      </ol>
    </div>

    <!-- Notes -->
    <div v-if="recipe.notes && recipe.notes.trim()" class="mb-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-4">Notes et conseils</h2>
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div class="flex items-start">
          <svg class="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-blue-800 whitespace-pre-wrap">{{ recipe.notes }}</p>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="text-center py-16">
    <h2 class="text-2xl font-semibold text-gray-900 mb-4">Recette introuvable</h2>
    <NuxtLink to="/recettes" class="btn-primary">Retour aux recettes</NuxtLink>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { computed } from 'vue'
const recipesStore = useRecipesStore()
const shoppingStore = useShoppingStore()
const route = useRoute()

const recipeId = computed(() => route.params.id)
const recipe = computed(() => recipesStore.recipes.find(r => r.id === recipeId.value))

const categoryName = computed(() => {
  const map = {
    'soupes': 'Soupes',
    'entrees': 'Entrées, Salades, Pains et accompagnements',
    'plats': 'Plats',
    'poissons': 'Poissons',
    'viandes': 'Viandes',
    'yaourts et fromages': 'Yaourts et fromages',
    'desserts et gâteaux': 'Desserts et gâteaux',
    'boissons': 'Boissons',
    'confitures': 'Confitures'
  }
  return map[recipe.value?.category] || recipe.value?.category || ''
})

const { $toast } = useNuxtApp()

const addToShoppingList = () => {
  if (!recipe.value) return
  
  // Préparer les ingrédients avec les informations nécessaires
  const ingredients = recipe.value.ingredients.map(ingredient => ({
    name: ingredient.name,
    amount: ingredient.amount,
    unit: ingredient.unit,
    recipeId: recipe.value.id
  }))
  
  // Utiliser la nouvelle méthode qui vérifie toutes les listes
  shoppingStore.addIngredientsToLists(ingredients)
  
  // Afficher un toast de confirmation
  $toast.success(
    'Recette ajoutée !',
    `${recipe.value.title} a été ajoutée à votre liste de courses`,
    3000
  )
}

const printRecipe = () => {
  if (!recipe.value) return
  
  const printWindow = window.open('', '_blank')
  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${recipe.value.title} - Recettes des Boultons</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 30px; 
          line-height: 1.8; 
          max-width: 800px; 
          margin-left: auto; 
          margin-right: auto; 
        }
        h1 { 
          color: #1e40af; 
          font-size: 32px; 
          margin-bottom: 20px; 
          text-align: center; 
          font-weight: bold;
        }
        h2 { 
          color: #374151; 
          font-size: 24px; 
          margin-top: 30px; 
          margin-bottom: 15px; 
          text-align: center;
          font-weight: bold;
        }
        .recipe-info { 
          background: #f3f4f6; 
          padding: 20px; 
          border-radius: 12px; 
          margin: 25px 0; 
          text-align: center;
          font-size: 16px;
        }
        .recipe-info span { 
          margin-right: 25px; 
          font-weight: 500;
        }
        .tags { 
          margin: 25px 0; 
          text-align: center;
        }
        .tag { 
          background: #e5e7eb; 
          padding: 8px 16px; 
          border-radius: 20px; 
          font-size: 14px; 
          margin-right: 12px; 
          font-weight: 500;
        }
        ul { 
          margin-left: 30px; 
          font-size: 16px;
        }
        ol { 
          margin-left: 30px; 
          font-size: 16px;
        }
        li { 
          margin-bottom: 12px; 
          line-height: 1.8;
        }
        .header { 
          text-align: center; 
          margin-bottom: 40px; 
        }
        .header p {
          font-size: 18px;
          color: #6b7280;
          margin-top: 15px;
        }
        .footer {
          margin-top: 50px; 
          text-align: center; 
          font-size: 14px; 
          color: #6b7280;
          border-top: 2px solid #e5e7eb;
          padding-top: 20px;
        }
        @media print { 
          body { 
            margin: 20px; 
            font-size: 16px;
          } 
          h1 { font-size: 28px; }
          h2 { font-size: 22px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${recipe.value.title}</h1>
        <p>${recipe.value.description}</p>
      </div>
      
      <div class="recipe-info">
        <span><strong>Catégorie :</strong> ${categoryName.value}</span>
        <span><strong>Temps :</strong> ${
          typeof(recipe.value.prepTime) === 'string' ? recipe.value.prepTime : recipe.value.prepTime + recipe.value.cookTime} min</span>
        <span><strong>Portions :</strong> ${recipe.value.servings} pers.</span>
      </div>
      
      <div class="tags">
        ${recipe.value.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>
      
      <h2>Ingrédients</h2>
      <ul>
        ${recipe.value.ingredients.map(ingredient => 
          `<li>${ingredient.amount ? ingredient.amount + ' ' : ''}${ingredient.unit ? ingredient.unit + ' ' : ''}${ingredient.name}</li>`
        ).join('')}
      </ul>
      
      <h2>Instructions</h2>
      <ol>
        ${recipe.value.instructions.map(step => `<li>${step}</li>`).join('')}
      </ol>
      
      ${recipe.value.notes && recipe.value.notes.trim() ? `
      <h2>Notes et conseils</h2>
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 25px 0;">
        <p style="color: #1e40af; margin: 0; line-height: 1.8;">${recipe.value.notes}</p>
      </div>
      ` : ''}
      
      <div class="footer">
        Recettes des Boultons - ${new Date().toLocaleDateString('fr-FR')}
      </div>
    </body>
    </html>
  `
  
  printWindow.document.write(printContent)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  printWindow.close()
}

// SEO
useHead({
  title: () => recipe.value ? `${recipe.value.title} - Recettes des Boultons` : 'Recette introuvable',
  meta: [
    { name: 'description', content: () => recipe.value ? recipe.value.description : 'Recette non trouvée.' }
  ]
})
</script> 