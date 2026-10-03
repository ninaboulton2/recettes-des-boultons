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
                  placeholder="15 (optionnel)"
                  @input="form.prepTime = form.prepTime === '' ? null : form.prepTime"
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
                  placeholder="30 (optionnel)"
                  @input="form.cookTime = form.cookTime === '' ? null : form.cookTime"
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
                  placeholder="4 (optionnel)"
                  @input="form.servings = form.servings === '' ? null : form.servings"
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
                  @click="addSection('ingredients')"
                  class="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  + Ajouter une section
                </button>
              </div>
              
              <div class="space-y-6">
                <div
                  v-for="(section, sectionIndex) in sectionsWithIngredients"
                  :key="sectionIndex"
                  class="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2 flex-1">
                      <!-- Boutons de réorganisation -->
                      <div class="flex flex-col gap-1" title="Réorganiser l'ordre des sections">
                        <button
                          type="button"
                          @click="moveSectionUp(sectionIndex, 'ingredients')"
                          :disabled="sectionIndex === 0"
                          :class="[
                            'p-1 rounded transition-colors relative group',
                            sectionIndex === 0 
                              ? 'text-gray-300 cursor-not-allowed' 
                              : 'text-gray-600 hover:text-primary-600 hover:bg-gray-100'
                          ]"
                          title="Déplacer cette section vers le haut (avant la section précédente)"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>
                          </svg>
                          <span class="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                            Déplacer vers le haut
                          </span>
                        </button>
                        <button
                          type="button"
                          @click="moveSectionDown(sectionIndex, 'ingredients')"
                          :disabled="sectionIndex === sectionsWithIngredients.length - 1"
                          :class="[
                            'p-1 rounded transition-colors relative group',
                            sectionIndex === sectionsWithIngredients.length - 1
                              ? 'text-gray-300 cursor-not-allowed' 
                              : 'text-gray-600 hover:text-primary-600 hover:bg-gray-100'
                          ]"
                          title="Déplacer cette section vers le bas (après la section suivante)"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                          </svg>
                          <span class="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                            Déplacer vers le bas
                          </span>
                        </button>
                      </div>
                      <input
                        v-model="section.name"
                        type="text"
                        class="text-lg font-medium text-gray-700 bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none px-2 py-1 flex-1"
                        placeholder="Nom de la section (ex: Pour la pâte)"
                      >
                    </div>
                    <button
                      type="button"
                      @click="removeSection(sectionIndex, 'ingredients')"
                      class="text-red-500 hover:text-red-700 p-1"
                      title="Supprimer la section"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                      </svg>
                </button>
              </div>
              
              <div class="space-y-3">
                <div
                      v-for="(ingredient, index) in section.ingredients"
                  :key="index"
                  class="flex items-center space-x-3"
                >
                  <input
                    v-model="ingredient.amount"
                    type="text"
                        class="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                    placeholder=""
                  >
                  <input
                    v-model="ingredient.unit"
                    type="text"
                        class="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                    placeholder=""
                  >
                  <input
                    v-model="ingredient.name"
                    type="text"
                    required
                        class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                    placeholder="Nom de l'ingrédient"
                  >
                  <button
                    type="button"
                        @click="removeIngredientFromSection(sectionIndex, index)"
                    class="text-red-500 hover:text-red-700 p-1"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                  </button>
                    </div>
                    <button
                      type="button"
                      @click="addIngredientToSection(sectionIndex)"
                      class="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      + Ajouter un ingrédient
                    </button>
                  </div>
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
                  @click="addSection('instructions')"
                  class="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  + Ajouter une section
                </button>
              </div>
              
              <div class="space-y-6">
                <div
                  v-for="(section, sectionIndex) in sectionsWithInstructions"
                  :key="sectionIndex"
                  class="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2 flex-1">
                      <!-- Boutons de réorganisation -->
                      <div class="flex flex-col gap-1" title="Réorganiser l'ordre des sections">
                        <button
                          type="button"
                          @click="moveSectionUp(sectionIndex, 'instructions')"
                          :disabled="sectionIndex === 0"
                          :class="[
                            'p-1 rounded transition-colors relative group',
                            sectionIndex === 0 
                              ? 'text-gray-300 cursor-not-allowed' 
                              : 'text-gray-600 hover:text-primary-600 hover:bg-gray-100'
                          ]"
                          title="Déplacer cette section vers le haut (avant la section précédente)"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>
                          </svg>
                          <span class="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                            Déplacer vers le haut
                          </span>
                        </button>
                        <button
                          type="button"
                          @click="moveSectionDown(sectionIndex, 'instructions')"
                          :disabled="sectionIndex === sectionsWithInstructions.length - 1"
                          :class="[
                            'p-1 rounded transition-colors relative group',
                            sectionIndex === sectionsWithInstructions.length - 1
                              ? 'text-gray-300 cursor-not-allowed' 
                              : 'text-gray-600 hover:text-primary-600 hover:bg-gray-100'
                          ]"
                          title="Déplacer cette section vers le bas (après la section suivante)"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                          </svg>
                          <span class="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                            Déplacer vers le bas
                          </span>
                        </button>
                      </div>
                      <input
                        v-model="section.name"
                        type="text"
                        class="text-lg font-medium text-gray-700 bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none px-2 py-1 flex-1"
                        placeholder="Nom de la section (ex: Préparation)"
                      >
                    </div>
                    <button
                      type="button"
                      @click="removeSection(sectionIndex, 'instructions')"
                      class="text-red-500 hover:text-red-700 p-1"
                      title="Supprimer la section"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                      </svg>
                    </button>
                  </div>
                  
                  <div 
                    class="space-y-3"
                    @dragover.prevent="handleSectionDragOver($event, sectionIndex)"
                    @drop="handleSectionDrop($event, sectionIndex)"
                    @dragenter.prevent="handleSectionDragEnter($event, sectionIndex)"
                    @dragleave="handleSectionDragLeave($event)"
                    :class="[
                      'min-h-[60px] rounded-lg p-2 transition-all',
                      dragOverSectionIndex === sectionIndex && draggedSectionIndex !== null && draggedSectionIndex !== sectionIndex
                        ? 'bg-primary-50 border-2 border-primary-500 border-dashed'
                        : ''
                    ]"
                  >
                    <div
                      v-for="(instruction, index) in section.instructions"
                      :key="`${section.id || sectionIndex}-${index}`"
                      draggable="true"
                      @dragstart="handleInstructionDragStart($event, sectionIndex, index)"
                      @dragover.prevent="handleInstructionDragOver($event)"
                      @drop="handleInstructionDrop($event, sectionIndex, index)"
                      @dragenter.prevent="handleInstructionDragEnter($event, sectionIndex, index)"
                      @dragleave="handleInstructionDragLeave($event)"
                      :class="[
                        'flex items-start space-x-3 cursor-move transition-all rounded-lg p-2 -m-2',
                        dragOverInstructionIndex === index && dragOverSectionIndex === sectionIndex
                          ? 'bg-primary-50 border-t-2 border-primary-500'
                          : 'hover:bg-gray-50'
                      ]"
                >
                  <span class="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium mt-2">
                    {{ index + 1 }}
                  </span>
                  <textarea
                        :value="typeof section.instructions[index] === 'string' ? section.instructions[index] : section.instructions[index]?.content || ''"
                        @input="updateInstructionContent(sectionIndex, index, $event.target.value)"
                    rows="2"
                    required
                        class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                    placeholder="Décrivez cette étape..."
                        @mousedown.stop
                  ></textarea>
                  <button
                    type="button"
                        @click="removeInstructionFromSection(sectionIndex, index)"
                    class="text-red-500 hover:text-red-700 p-1 mt-2"
                        @mousedown.stop
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                  </button>
                </div>
                    <div 
                      v-if="section.instructions.length === 0 && draggedSectionIndex !== null"
                      class="text-center py-4 text-sm text-gray-500 border-2 border-dashed border-gray-300 rounded-lg"
                    >
                      Déposez une instruction ici
                    </div>
                    <button
                      type="button"
                      @click="addInstructionToSection(sectionIndex)"
                      class="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      + Ajouter une étape
                    </button>
                  </div>
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
  prepTime: null,
  cookTime: null,
  servings: null,
  image: '',
  tags: [],
  ingredients: [],
  instructions: [],
  notes: '',
  sections: []
})

const tagsInput = ref('')

// Sections organisées pour l'affichage
const sectionsWithIngredients = computed(() => {
  if (!form.value.sections || form.value.sections.length === 0) {
    // Si pas de sections, créer une section par défaut avec les ingrédients
    if (form.value.ingredients && form.value.ingredients.length > 0) {
      return [{
        name: 'Ingrédients',
        type: 'ingredients',
        orderIndex: 0,
        ingredients: form.value.ingredients.map(ing => ({
          name: ing.name || '',
          amount: ing.amount || '',
          unit: ing.unit || '',
          optional: ing.optional || false,
          orderIndex: 0
        }))
      }]
    }
    return []
  }
  
  // Filtrer les sections de type 'ingredients' ou 'mixed' qui ont des ingrédients OU qui sont vides (nouvelles sections)
  // IMPORTANT: Ne pas utiliser .map() car cela crée de nouveaux objets et casse les références
  // On modifie directement les sections pour s'assurer que ingredients est un tableau
  const filtered = form.value.sections
    .filter(section => 
      (section.type === 'ingredients' || section.type === 'mixed') &&
      (section.ingredients !== undefined)
    )
  
  // S'assurer que ingredients est toujours un tableau (même vide)
  filtered.forEach(section => {
    if (!Array.isArray(section.ingredients)) {
      section.ingredients = []
    }
  })
  
  return filtered.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
})

const sectionsWithInstructions = computed(() => {
  if (!form.value.sections || form.value.sections.length === 0) {
    // Si pas de sections, créer une section par défaut avec les instructions
    if (form.value.instructions && form.value.instructions.length > 0) {
      return [{
        name: 'Préparation',
        type: 'instructions',
        orderIndex: 0,
        instructions: form.value.instructions.map((inst, idx) => 
          typeof inst === 'string' ? inst : inst.content || ''
        )
      }]
    }
    return []
  }
  
  // Filtrer les sections de type 'instructions' ou 'mixed' qui ont des instructions OU qui sont vides (nouvelles sections)
  // IMPORTANT: Ne pas utiliser .map() car cela crée de nouveaux objets et casse les références
  // On modifie directement les sections pour s'assurer que instructions est un tableau
  const filtered = form.value.sections
    .filter(section => 
      (section.type === 'instructions' || section.type === 'mixed') &&
      (section.instructions !== undefined)
    )
  
  // S'assurer que instructions est toujours un tableau (même vide)
  filtered.forEach(section => {
    if (!Array.isArray(section.instructions)) {
      section.instructions = []
    }
  })
  
  return filtered.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
})

// Define all functions first
const resetForm = () => {
  form.value = {
    title: '',
    description: '',
    category: '',
    prepTime: null,
    cookTime: null,
    servings: null,
    image: '', // Will be set automatically based on category
    tags: [],
    ingredients: [],
    instructions: [],
    notes: '',
    sections: []
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

// Gestion des sections
const addSection = (type) => {
  if (!form.value.sections) {
    form.value.sections = []
  }
  
  // Calculer le prochain orderIndex en fonction des sections existantes du même type
  const existingSectionsOfType = form.value.sections.filter(s => s.type === type)
  const nextOrderIndex = existingSectionsOfType.length > 0
    ? Math.max(...existingSectionsOfType.map(s => s.orderIndex || 0)) + 1
    : form.value.sections.length
  
  const newSection = {
    name: type === 'ingredients' ? 'Nouvelle section' : 'Nouvelle section',
    type: type,
    orderIndex: nextOrderIndex,
    ingredients: type === 'ingredients' ? [] : [],
    instructions: type === 'instructions' ? [] : []
  }
  
  form.value.sections.push(newSection)
  console.log('Section ajoutée:', newSection)
  console.log('Sections actuelles:', form.value.sections)
}

const removeSection = (sectionIndex, type) => {
  const sections = type === 'ingredients' ? sectionsWithIngredients.value : sectionsWithInstructions.value
  const section = sections[sectionIndex]
  
  if (!section) {
    console.error('Section non trouvée à l\'index', sectionIndex)
    return
  }
  
  // Les computed properties retournent des références aux objets dans form.value.sections
  // On peut donc utiliser findIndex avec une comparaison de référence directe
  const index = form.value.sections.findIndex(s => {
    // Pour les sections avec ID, comparer par ID
    if (section.id && s.id) {
      return s.id === section.id
    }
    // Pour les sections sans ID (nouvelles), comparer par référence directe
    // ou par orderIndex et type (plus fiable si le nom a été modifié)
    return s === section || (s.type === section.type && s.orderIndex === section.orderIndex)
  })
  
  if (index !== -1) {
    form.value.sections.splice(index, 1)
    console.log('Section supprimée:', section.name || 'Section sans nom')
  } else {
    console.error('Section non trouvée dans form.sections:', section)
    // Fallback : utiliser filter pour supprimer la section
    form.value.sections = form.value.sections.filter(s => {
      if (section.id && s.id) {
        return s.id !== section.id
      }
      // Pour les nouvelles sections, comparer par orderIndex et type
      return !(s.type === section.type && s.orderIndex === section.orderIndex)
    })
    console.log('Section supprimée par filtrage (fallback)')
  }
}

// Fonctions pour réorganiser les sections
const moveSectionUp = (sectionIndex, type) => {
  if (sectionIndex === 0) return // Déjà en première position
  
  const sections = type === 'ingredients' ? sectionsWithIngredients.value : sectionsWithInstructions.value
  const section = sections[sectionIndex]
  const prevSection = sections[sectionIndex - 1]
  
  if (!section || !prevSection) return
  
  // Échanger les orderIndex
  const tempOrderIndex = section.orderIndex
  section.orderIndex = prevSection.orderIndex
  prevSection.orderIndex = tempOrderIndex
  
  // Trier form.value.sections par orderIndex pour maintenir l'ordre
  form.value.sections.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
}

const moveSectionDown = (sectionIndex, type) => {
  const sections = type === 'ingredients' ? sectionsWithIngredients.value : sectionsWithInstructions.value
  
  if (sectionIndex === sections.length - 1) return // Déjà en dernière position
  
  const section = sections[sectionIndex]
  const nextSection = sections[sectionIndex + 1]
  
  if (!section || !nextSection) return
  
  // Échanger les orderIndex
  const tempOrderIndex = section.orderIndex
  section.orderIndex = nextSection.orderIndex
  nextSection.orderIndex = tempOrderIndex
  
  // Trier form.value.sections par orderIndex pour maintenir l'ordre
  form.value.sections.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
}

// Variables pour le drag and drop des instructions
const draggedInstructionIndex = ref(null)
const draggedSectionIndex = ref(null)
const dragOverInstructionIndex = ref(null)
const dragOverSectionIndex = ref(null)

// Gestion du drag and drop des instructions
const handleInstructionDragStart = (event, sectionIndex, instructionIndex) => {
  draggedSectionIndex.value = sectionIndex
  draggedInstructionIndex.value = instructionIndex
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', '') // Nécessaire pour Firefox
  // Ne pas modifier l'opacité pour éviter le style grisé
}

const handleInstructionDragOver = (event) => {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

const handleInstructionDragEnter = (event, sectionIndex, instructionIndex) => {
  if (draggedSectionIndex.value === null) return
  
  // Ne pas mettre en surbrillance si c'est la même instruction
  if (draggedSectionIndex.value === sectionIndex && draggedInstructionIndex.value === instructionIndex) {
    return
  }
  
  dragOverSectionIndex.value = sectionIndex
  dragOverInstructionIndex.value = instructionIndex
}

const handleInstructionDragLeave = (event) => {
  // Ne réinitialiser que si on quitte vraiment l'élément (pas juste un enfant)
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX
  const y = event.clientY
  
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    dragOverSectionIndex.value = null
    dragOverInstructionIndex.value = null
  }
}

const handleInstructionDrop = (event, targetSectionIndex, targetInstructionIndex) => {
  event.preventDefault()
  
  if (draggedSectionIndex.value === null || draggedInstructionIndex.value === null) {
    resetDragState()
    return
  }
  
  const sourceSectionIndex = draggedSectionIndex.value
  const sourceInstructionIndex = draggedInstructionIndex.value
  
  // Si c'est la même position, ne rien faire
  if (sourceSectionIndex === targetSectionIndex && sourceInstructionIndex === targetInstructionIndex) {
    resetDragState()
    return
  }
  
  const sourceSection = sectionsWithInstructions.value[sourceSectionIndex]
  const targetSection = sectionsWithInstructions.value[targetSectionIndex]
  
  if (!sourceSection || !targetSection || !sourceSection.instructions || !targetSection.instructions) {
    resetDragState()
    return
  }
  
  // Récupérer l'instruction déplacée et normaliser en objet
  let instructionToMove = sourceSection.instructions[sourceInstructionIndex]
  
  // Normaliser l'instruction en objet si c'est une string
  if (typeof instructionToMove === 'string') {
    instructionToMove = {
      content: instructionToMove,
      orderIndex: sourceInstructionIndex
    }
  } else if (!instructionToMove || typeof instructionToMove !== 'object') {
    instructionToMove = {
      content: instructionToMove?.content || '',
      orderIndex: sourceInstructionIndex
    }
  }
  
  // Insérer l'instruction à sa nouvelle position
  if (sourceSectionIndex === targetSectionIndex) {
    // Même section : déplacer dans le même tableau
    // Supprimer d'abord l'élément source
    sourceSection.instructions.splice(sourceInstructionIndex, 1)
    
    // Ajuster l'index de destination si nécessaire
    let insertIndex = targetInstructionIndex
    if (sourceInstructionIndex < targetInstructionIndex) {
      // On déplace vers le bas : l'index de destination diminue de 1 car on a supprimé l'élément source
      insertIndex = targetInstructionIndex - 1
    } else {
      // On déplace vers le haut : l'index reste le même
      insertIndex = targetInstructionIndex
    }
    
    // Insérer à la nouvelle position
    sourceSection.instructions.splice(insertIndex, 0, instructionToMove)
    
    // Mettre à jour les orderIndex et normaliser toutes les instructions
    sourceSection.instructions.forEach((inst, idx) => {
      if (typeof inst === 'string') {
        sourceSection.instructions[idx] = {
          content: inst,
          orderIndex: idx
        }
      } else if (inst && typeof inst === 'object') {
        inst.orderIndex = idx
      }
    })
  } else {
    // Section différente : supprimer de la source et insérer dans la cible
    sourceSection.instructions.splice(sourceInstructionIndex, 1)
    targetSection.instructions.splice(targetInstructionIndex, 0, instructionToMove)
    
    // Mettre à jour les orderIndex de la section source et normaliser
    sourceSection.instructions.forEach((inst, idx) => {
      if (typeof inst === 'string') {
        sourceSection.instructions[idx] = {
          content: inst,
          orderIndex: idx
        }
      } else if (inst && typeof inst === 'object') {
        inst.orderIndex = idx
      }
    })
    
    // Mettre à jour les orderIndex de la section cible et normaliser
    targetSection.instructions.forEach((inst, idx) => {
      if (typeof inst === 'string') {
        targetSection.instructions[idx] = {
          content: inst,
          orderIndex: idx
        }
      } else if (inst && typeof inst === 'object') {
        inst.orderIndex = idx
      }
    })
  }
  
  resetDragState()
}

const resetDragState = () => {
  draggedSectionIndex.value = null
  draggedInstructionIndex.value = null
  dragOverSectionIndex.value = null
  dragOverInstructionIndex.value = null
}

// Gestion du drag and drop au niveau de la section (pour déplacer vers une section vide)
const handleSectionDragOver = (event, sectionIndex) => {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

const handleSectionDragEnter = (event, sectionIndex) => {
  if (draggedSectionIndex.value === null) return
  
  // Ne pas mettre en surbrillance si c'est la même section
  if (draggedSectionIndex.value === sectionIndex) {
    return
  }
  
  dragOverSectionIndex.value = sectionIndex
  dragOverInstructionIndex.value = null // Pas d'instruction spécifique, juste la section
}

const handleSectionDragLeave = (event) => {
  // Ne réinitialiser que si on quitte vraiment l'élément (pas juste un enfant)
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX
  const y = event.clientY
  
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    // Ne réinitialiser que si on n'est pas en train de survoler une instruction
    if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) {
      dragOverSectionIndex.value = null
      dragOverInstructionIndex.value = null
    }
  }
}

const handleSectionDrop = (event, targetSectionIndex) => {
  event.preventDefault()
  event.stopPropagation()
  
  if (draggedSectionIndex.value === null || draggedInstructionIndex.value === null) {
    resetDragState()
    return
  }
  
  const sourceSectionIndex = draggedSectionIndex.value
  const sourceInstructionIndex = draggedInstructionIndex.value
  
  // Si c'est la même section, ne rien faire (géré par handleInstructionDrop)
  if (sourceSectionIndex === targetSectionIndex) {
    resetDragState()
    return
  }
  
  const sourceSection = sectionsWithInstructions.value[sourceSectionIndex]
  const targetSection = sectionsWithInstructions.value[targetSectionIndex]
  
  if (!sourceSection || !targetSection || !sourceSection.instructions) {
    resetDragState()
    return
  }
  
  // S'assurer que targetSection.instructions existe
  if (!targetSection.instructions) {
    targetSection.instructions = []
  }
  
  // Récupérer l'instruction déplacée et normaliser en objet
  let instructionToMove = sourceSection.instructions[sourceInstructionIndex]
  
  // Normaliser l'instruction en objet si c'est une string
  if (typeof instructionToMove === 'string') {
    instructionToMove = {
      content: instructionToMove,
      orderIndex: sourceInstructionIndex
    }
  } else if (!instructionToMove || typeof instructionToMove !== 'object') {
    instructionToMove = {
      content: instructionToMove?.content || '',
      orderIndex: sourceInstructionIndex
    }
  }
  
  // Supprimer de la source
  sourceSection.instructions.splice(sourceInstructionIndex, 1)
  
  // Ajouter à la fin de la section cible
  const newIndex = targetSection.instructions.length
  targetSection.instructions.push(instructionToMove)
  instructionToMove.orderIndex = newIndex
  
  // Mettre à jour les orderIndex de la section source et normaliser
  sourceSection.instructions.forEach((inst, idx) => {
    if (typeof inst === 'string') {
      sourceSection.instructions[idx] = {
        content: inst,
        orderIndex: idx
      }
    } else if (inst && typeof inst === 'object') {
      inst.orderIndex = idx
    }
  })
  
  // Mettre à jour les orderIndex de la section cible et normaliser
  targetSection.instructions.forEach((inst, idx) => {
    if (typeof inst === 'string') {
      targetSection.instructions[idx] = {
        content: inst,
        orderIndex: idx
      }
    } else if (inst && typeof inst === 'object') {
      inst.orderIndex = idx
    }
  })
  
  resetDragState()
}

// Fonction pour mettre à jour le contenu d'une instruction
const updateInstructionContent = (sectionIndex, instructionIndex, value) => {
  const section = sectionsWithInstructions.value[sectionIndex]
  if (!section || !section.instructions) return
  
  const instruction = section.instructions[instructionIndex]
  if (typeof instruction === 'string') {
    // Convertir en objet si c'est une string
    section.instructions[instructionIndex] = {
      content: value,
      orderIndex: instructionIndex
    }
  } else if (instruction && typeof instruction === 'object') {
    // Mettre à jour le contenu
    instruction.content = value
  } else {
    // Créer un nouvel objet
    section.instructions[instructionIndex] = {
      content: value,
      orderIndex: instructionIndex
    }
  }
}

const addIngredientToSection = (sectionIndex) => {
  const section = sectionsWithIngredients.value[sectionIndex]
  if (section) {
    if (!section.ingredients) {
      section.ingredients = []
    }
    section.ingredients.push({
      name: '',
    amount: '',
    unit: '',
      optional: false,
      orderIndex: section.ingredients.length
    })
  }
}

const removeIngredientFromSection = (sectionIndex, ingredientIndex) => {
  const section = sectionsWithIngredients.value[sectionIndex]
  if (section && section.ingredients) {
    section.ingredients.splice(ingredientIndex, 1)
  }
}

const addInstructionToSection = (sectionIndex) => {
  const section = sectionsWithInstructions.value[sectionIndex]
  if (section) {
    if (!section.instructions) {
      section.instructions = []
    }
    const newIndex = section.instructions.length
    section.instructions.push({
      content: '',
      orderIndex: newIndex
    })
  }
}

const removeInstructionFromSection = (sectionIndex, instructionIndex) => {
  const section = sectionsWithInstructions.value[sectionIndex]
  if (section && section.instructions) {
    section.instructions.splice(instructionIndex, 1)
    
    // Mettre à jour les orderIndex après suppression
    section.instructions.forEach((inst, idx) => {
      if (typeof inst === 'string') {
        section.instructions[idx] = {
          content: inst,
          orderIndex: idx
        }
      } else if (inst && typeof inst === 'object') {
        inst.orderIndex = idx
      }
    })
  }
}

// Fonctions de compatibilité (ancien format)
const addIngredient = () => {
  if (sectionsWithIngredients.value.length === 0) {
    addSection('ingredients')
  }
  const firstSection = sectionsWithIngredients.value[0]
  addIngredientToSection(0)
}

const removeIngredient = (index) => {
  // Cette fonction n'est plus utilisée mais gardée pour compatibilité
  if (sectionsWithIngredients.value.length > 0) {
    const firstSection = sectionsWithIngredients.value[0]
    if (firstSection.ingredients && firstSection.ingredients[index]) {
      removeIngredientFromSection(0, index)
    }
  }
}

const addInstruction = () => {
  if (sectionsWithInstructions.value.length === 0) {
    addSection('instructions')
  }
  addInstructionToSection(0)
}

const removeInstruction = (index) => {
  // Cette fonction n'est plus utilisée mais gardée pour compatibilité
  if (sectionsWithInstructions.value.length > 0) {
    const firstSection = sectionsWithInstructions.value[0]
    if (firstSection.instructions && firstSection.instructions[index]) {
      removeInstructionFromSection(0, index)
    }
  }
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

const handleSubmit = async () => {
  // Validation
  const hasIngredients = sectionsWithIngredients.value.length > 0 && 
    sectionsWithIngredients.value.some(s => s.ingredients && s.ingredients.length > 0)
  const hasInstructions = sectionsWithInstructions.value.length > 0 && 
    sectionsWithInstructions.value.some(s => s.instructions && s.instructions.length > 0)
  
  if (!form.value.title || !form.value.category || !hasIngredients || !hasInstructions) {
    $toast.error('Erreur', 'Veuillez remplir tous les champs obligatoires', 3000)
    return
  }

  // Update tags
  updateTags()

  // Assign image based on category
  const imageUrl = getImageForCategory(form.value.category)

  // Préparer les sections avec orderIndex correct
  const sections = []
  let orderIndex = 0
  
  // Ajouter les sections d'ingrédients
  sectionsWithIngredients.value.forEach(section => {
    sections.push({
      ...section,
      type: 'ingredients',
      orderIndex: orderIndex++,
      ingredients: section.ingredients.map((ing, idx) => ({
        ...ing,
        orderIndex: idx
      })),
      instructions: []
    })
  })
  
  // Ajouter les sections d'instructions
  sectionsWithInstructions.value.forEach(section => {
    sections.push({
      ...section,
      type: 'instructions',
      orderIndex: orderIndex++,
      ingredients: [],
      instructions: section.instructions.map((inst, idx) => ({
        content: typeof inst === 'string' ? inst : inst.content || inst,
        orderIndex: idx
      }))
    })
  })

  // Prepare recipe data
  const recipeData = {
    title: form.value.title,
    description: form.value.description,
    category: form.value.category,
    prepTime: form.value.prepTime,
    cookTime: form.value.cookTime,
    servings: form.value.servings,
    image: imageUrl,
    tags: form.value.tags,
    notes: form.value.notes,
    sections: sections,
    id: props.recipe?.id || generateId(),
    createdAt: props.recipe?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    favorite: props.recipe?.favorite || false
  }

  console.log('Données de la recette à sauvegarder:', recipeData)
  console.log('Sections:', sections)

  // Save recipe
  if (isEditing.value) {
    try {
      console.log('Mise à jour de la recette:', recipeData.id)
      const updatedRecipe = await recipesStore.updateRecipe(recipeData.id, recipeData)
      console.log('Recette mise à jour avec succès:', updatedRecipe)
    $toast.success('Succès', 'Recette modifiée avec succès !', 3000)
      emit('save', updatedRecipe || recipeData)
      handleCancel()
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error)
      $toast.error('Erreur', `Erreur lors de la modification de la recette: ${error.message || 'Erreur inconnue'}`, 5000)
    }
  } else {
    try {
      console.log('Création de la recette')
      const addedRecipe = await recipesStore.addRecipe(recipeData)
      console.log('Recette créée avec succès:', addedRecipe)
    $toast.success('Succès', 'Recette créée avec succès !', 3000)
      emit('save', addedRecipe || recipeData)
  handleCancel()
    } catch (error) {
      console.error('Erreur lors de l\'ajout:', error)
      $toast.error('Erreur', `Erreur lors de la création de la recette: ${error.message || 'Erreur inconnue'}`, 5000)
    }
  }
}

// Initialize form when recipe changes (after all functions are defined)
watch(() => props.recipe, (newRecipe) => {
  if (newRecipe) {
    // Copy recipe data but exclude image (will be set automatically based on category)
    const { image, ...recipeWithoutImage } = newRecipe
    
    // Si la recette a des sections, les utiliser directement
    let sections = []
    if (newRecipe.sections && Array.isArray(newRecipe.sections) && newRecipe.sections.length > 0) {
      sections = newRecipe.sections.map(section => ({
        id: section.id,
        name: section.name || '',
        type: section.type || 'mixed',
        orderIndex: section.orderIndex || 0,
        ingredients: (section.ingredients || []).map(ing => ({
          id: ing.id,
          name: ing.name || '',
          amount: ing.amount || '',
          unit: ing.unit || '',
          optional: ing.optional || false,
          orderIndex: ing.orderIndex || 0
        })),
        instructions: (section.instructions || []).map(inst => 
          typeof inst === 'string' ? inst : inst.content || ''
        )
      }))
    } else {
      // Ancien format : créer des sections à partir des ingrédients et instructions
      if (newRecipe.ingredients && Array.isArray(newRecipe.ingredients) && newRecipe.ingredients.length > 0) {
        sections.push({
          name: 'Ingrédients',
          type: 'ingredients',
          orderIndex: 0,
          ingredients: newRecipe.ingredients.map(ing => ({
            name: ing.name || '',
            amount: ing.amount || '',
            unit: ing.unit || '',
            optional: ing.optional || false,
            orderIndex: 0
          })),
          instructions: []
        })
      }
      
      if (newRecipe.instructions && Array.isArray(newRecipe.instructions) && newRecipe.instructions.length > 0) {
        sections.push({
          name: 'Préparation',
          type: 'instructions',
          orderIndex: sections.length,
          ingredients: [],
          instructions: newRecipe.instructions.map(inst => 
            typeof inst === 'string' ? inst : inst.content || ''
          )
        })
      }
    }
    
    form.value = {
      ...recipeWithoutImage,
      image: '', // Will be set automatically based on category
      sections: sections,
      category: newRecipe.category || '', // S'assurer que la catégorie est bien récupérée
      prepTime: newRecipe.prepTime || 0,
      cookTime: newRecipe.cookTime || 0,
      servings: newRecipe.servings || 4,
      tags: newRecipe.tags || [],
      notes: newRecipe.notes || '',
      // Garder pour compatibilité
      ingredients: [],
      instructions: []
    }
    
    tagsInput.value = (newRecipe.tags && Array.isArray(newRecipe.tags)) 
      ? newRecipe.tags.join(', ') 
      : ''
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