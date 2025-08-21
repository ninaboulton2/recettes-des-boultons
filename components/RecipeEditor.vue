<template>
  <Transition
    enter-active-class="ease-out duration-300"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="ease-in duration-200"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="show"
      class="fixed inset-0 z-50 overflow-y-auto"
      @click="handleBackdropClick"
    >
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <!-- Background overlay -->
        <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"></div>

        <!-- Modal panel -->
        <div class="inline-block w-full max-w-4xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl max-h-[90vh] overflow-y-auto">
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-2xl font-semibold text-gray-900">
              {{ isEditing ? 'Modifier la recette' : 'Nouvelle recette' }}
            </h3>
            <button
              @click="handleCancel"
              class="text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <!-- Form -->
          <form @submit.prevent="handleSubmit" class="space-y-6">
            <!-- Titre de la recette -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Titre de la recette *
              </label>
              <input
                v-model="form.title"
                type="text"
                required
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Nom de la recette"
              >
            </div>

            <!-- Basic Info -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Temps de préparation (min)
                </label>
                <input
                  v-model.number="form.prepTime"
                  type="number"
                  min="0"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="15"
                >
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Temps de cuisson (min)
                </label>
                <input
                  v-model.number="form.cookTime"
                  type="number"
                  min="0"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="30"
                >
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Catégorie *
                </label>
                <select
                  v-model="form.category"
                  required
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Sélectionner une catégorie</option>
                  <option value="soupes">Soupes</option>
                  <option value="entrees">Entrées, Salades, Pains et accompagnements</option>
                  <option value="plats">Plats</option>
                  <option value="poissons">Poissons</option>
                  <option value="viandes">Viandes</option>
                  <option value="yaourts et fromages">Yaourts et fromages</option>
                  <option value="desserts et gâteaux">Desserts et gâteaux</option>
                  <option value="boissons">Boissons</option>
                  <option value="confitures">Confitures</option>
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Nombre de portions
                </label>
                <input
                  v-model.number="form.servings"
                  type="number"
                  min="1"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="4"
                >
              </div>


            </div>

            <!-- Description -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                v-model="form.description"
                rows="3"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Description de la recette..."
              ></textarea>
            </div>

            <!-- Tags -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Tags (séparés par des virgules)
              </label>
              <input
                v-model="tagsInput"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="végétarien, vegan"
                @blur="updateTags"
              >
            </div>

            <!-- Ingredients -->
            <div>
              <div class="flex items-center justify-between mb-4">
                <label class="block text-sm font-medium text-gray-700">
                  Ingrédients *
                </label>
                <button
                  type="button"
                  @click="addIngredient"
                  class="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  + Ajouter un ingrédient
                </button>
              </div>
              
              <div class="space-y-3">
                <div
                  v-for="(ingredient, index) in form.ingredients"
                  :key="index"
                  class="flex items-center space-x-3"
                >
                  <input
                    v-model="ingredient.amount"
                    type="text"
                    class="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder=""
                  >
                  <input
                    v-model="ingredient.unit"
                    type="text"
                    class="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder=""
                  >
                  <input
                    v-model="ingredient.name"
                    type="text"
                    required
                    class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Nom de l'ingrédient"
                  >
                  <button
                    type="button"
                    @click="removeIngredient(index)"
                    class="text-red-500 hover:text-red-700 p-1"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Instructions -->
            <div>
              <div class="flex items-center justify-between mb-4">
                <label class="block text-sm font-medium text-gray-700">
                  Instructions *
                </label>
                <button
                  type="button"
                  @click="addInstruction"
                  class="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  + Ajouter une étape
                </button>
              </div>
              
              <div class="space-y-3">
                <div
                  v-for="(instruction, index) in form.instructions"
                  :key="index"
                  class="flex items-start space-x-3"
                >
                  <span class="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium mt-2">
                    {{ index + 1 }}
                  </span>
                  <textarea
                    v-model="form.instructions[index]"
                    rows="2"
                    required
                    class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Décrivez cette étape..."
                  ></textarea>
                  <button
                    type="button"
                    @click="removeInstruction(index)"
                    class="text-red-500 hover:text-red-700 p-1 mt-2"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Notes -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Notes et conseils
              </label>
              <textarea
                v-model="form.notes"
                rows="3"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Conseils, variantes, notes personnelles..."
              ></textarea>
            </div>

            <!-- Actions -->
            <div class="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                @click="handleCancel"
                class="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
              >
                Annuler
              </button>
              <button
                type="submit"
                class="px-6 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
              >
                {{ isEditing ? 'Modifier' : 'Créer' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  recipe: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'save'])

const recipesStore = useRecipesStore()
const { $toast } = useNuxtApp()

const isEditing = computed(() => !!props.recipe)

// Form data
const form = ref({
  title: '',
  description: '',
  category: '',
  prepTime: 0,
  cookTime: 0,
  servings: 4,
  image: '',
  tags: [],
  ingredients: [],
  instructions: [],
  notes: ''
})

const tagsInput = ref('')

// Define all functions first
const resetForm = () => {
  form.value = {
    title: '',
    description: '',
    category: '',
    prepTime: 0,
    cookTime: 0,
    servings: 4,
    image: '', // Will be set automatically based on category
    tags: [],
    ingredients: [],
    instructions: [],
    notes: ''
  }
  tagsInput.value = ''
}

const updateTags = () => {
  if (tagsInput.value.trim()) {
    form.value.tags = tagsInput.value
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)
  } else {
    form.value.tags = []
  }
}

const addIngredient = () => {
  form.value.ingredients.push({
    amount: '',
    unit: '',
    name: ''
  })
}

const removeIngredient = (index) => {
  form.value.ingredients.splice(index, 1)
}

const addInstruction = () => {
  form.value.instructions.push('')
}

const removeInstruction = (index) => {
  form.value.instructions.splice(index, 1)
}

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

const getImageForCategory = (category) => {
  const imageMap = {
    'soupes': '/images/soupes.png',
    'entrees': '/images/entrees,salades,pains,accompagnements.png',
    'plats': '/images/plats.png',
    'poissons': '/images/poissons.png',
    'viandes': '/images/viandes.png',
    'yaourts et fromages': '/images/yaourts&fromages.png',
    'desserts et gâteaux': '/images/desserts.png',
    'boissons': '/images/boissons.png',
    'confitures': '/images/confitures.png'
  }
  return imageMap[category] || '/images/plats.png' // Image par défaut
}

const handleSubmit = () => {
  // Validation
  if (!form.value.title || !form.value.category || form.value.ingredients.length === 0 || form.value.instructions.length === 0) {
    $toast.error('Erreur', 'Veuillez remplir tous les champs obligatoires', 3000)
    return
  }

  // Update tags
  updateTags()

  // Assign image based on category
  const imageUrl = getImageForCategory(form.value.category)

  // Prepare recipe data
  const recipeData = {
    ...form.value,
    image: imageUrl,
    id: props.recipe?.id || generateId(),
    createdAt: props.recipe?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    favorite: props.recipe?.favorite || false
  }

  // Save recipe
  if (isEditing.value) {
    recipesStore.updateRecipe(recipeData.id, recipeData)
    $toast.success('Succès', 'Recette modifiée avec succès !', 3000)
  } else {
    recipesStore.addRecipe(recipeData)
    $toast.success('Succès', 'Recette créée avec succès !', 3000)
  }

  emit('save', recipeData)
  handleCancel()
}

// Initialize form when recipe changes (after all functions are defined)
watch(() => props.recipe, (newRecipe) => {
  if (newRecipe) {
    // Copy recipe data but exclude image (will be set automatically based on category)
    const { image, ...recipeWithoutImage } = newRecipe
    form.value = { ...recipeWithoutImage, image: '' }
    tagsInput.value = newRecipe.tags.join(', ')
  } else {
    resetForm()
  }
}, { immediate: true })

const handleCancel = () => {
  resetForm()
  emit('close')
}

const handleBackdropClick = (event) => {
  if (event.target === event.currentTarget) {
    handleCancel()
  }
}

// Fermer avec la touche Escape
onMounted(() => {
  const handleEscape = (event) => {
    if (event.key === 'Escape' && props.show) {
      handleCancel()
    }
  }
  
  document.addEventListener('keydown', handleEscape)
  
  onUnmounted(() => {
    document.removeEventListener('keydown', handleEscape)
  })
})
</script> 