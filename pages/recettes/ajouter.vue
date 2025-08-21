<template>
  <div class="min-h-screen bg-gray-50 py-8">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900">Ajouter une nouvelle recette</h1>
        <p class="mt-2 text-gray-600">
          Créez une nouvelle recette pour la collection des Boultons
        </p>
      </div>

      <!-- Formulaire d'ajout de recette -->
      <AdminGuard>
        <div class="bg-white rounded-lg shadow-md p-6">
          <form @submit.prevent="handleSubmit" class="space-y-6">
            <!-- Titre -->
            <div>
              <label for="title" class="block text-sm font-medium text-gray-700 mb-2">
                Titre de la recette *
              </label>
              <input
                id="title"
                v-model="recipe.title"
                type="text"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ex: Gâteau au chocolat"
              />
            </div>

            <!-- Description -->
            <div>
              <label for="description" class="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                id="description"
                v-model="recipe.description"
                rows="3"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Description courte de la recette..."
              ></textarea>
            </div>

            <!-- Catégorie -->
            <div>
              <label for="category" class="block text-sm font-medium text-gray-700 mb-2">
                Catégorie *
              </label>
              <select
                id="category"
                v-model="recipe.category"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Sélectionner une catégorie</option>
                <option value="soupes">Soupes</option>
                <option value="entrees">Entrées</option>
                <option value="plats">Plats</option>
                <option value="poissons">Poissons</option>
                <option value="viandes">Viandes</option>
                <option value="yaourts et fromages">Yaourts et fromages</option>
                <option value="desserts et gâteaux">Desserts et gâteaux</option>
                <option value="boissons">Boissons</option>
              </select>
            </div>

            <!-- Temps de préparation et cuisson -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label for="prepTime" class="block text-sm font-medium text-gray-700 mb-2">
                  Temps de préparation (minutes)
                </label>
                <input
                  id="prepTime"
                  v-model.number="recipe.prepTime"
                  type="number"
                  min="0"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label for="cookTime" class="block text-sm font-medium text-gray-700 mb-2">
                  Temps de cuisson (minutes)
                </label>
                <input
                  id="cookTime"
                  v-model.number="recipe.cookTime"
                  type="number"
                  min="0"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <!-- Nombre de personnes -->
            <div>
              <label for="servings" class="block text-sm font-medium text-gray-700 mb-2">
                Nombre de personnes
              </label>
              <input
                id="servings"
                v-model.number="recipe.servings"
                type="number"
                min="1"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <!-- Boutons d'action -->
            <div class="flex justify-end space-x-4 pt-6 border-t border-gray-200">
              <button
                type="button"
                @click="$router.back()"
                class="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                :disabled="isSubmitting"
                class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span v-if="isSubmitting">Création en cours...</span>
                <span v-else>Créer la recette</span>
              </button>
            </div>
          </form>
        </div>
      </AdminGuard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Recipe, RecipeCategory } from '~/types'

const isSubmitting = ref(false)

// Initialiser la recette vide
const recipe = ref<Partial<Recipe>>({
  title: '',
  description: '',
  category: '' as RecipeCategory,
  ingredients: [],
  instructions: [],
  prepTime: 0,
  cookTime: 0,
  servings: 4,
  image: '',
  tags: [],
  favorite: false,
  notes: ''
})

const handleSubmit = async () => {
  if (!recipe.value.title || !recipe.value.category) {
    alert('Veuillez remplir tous les champs obligatoires')
    return
  }

  isSubmitting.value = true

  try {
    // Ici, vous pouvez ajouter la logique pour sauvegarder la recette
    // Par exemple, appeler une API ou sauvegarder dans le store
    
    // Simuler un délai
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Rediriger vers la liste des recettes
    window.location.href = '/recettes'
  } catch (error) {
    console.error('Erreur lors de la création de la recette:', error)
    alert('Erreur lors de la création de la recette')
  } finally {
    isSubmitting.value = false
  }
}
</script> 