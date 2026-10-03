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
        <div class="fixed inset-0 transition-opacity bg-gray-500/75"></div>

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
                  :value="form.prepTime ?? ''"
                  type="number"
                  min="0"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="15 (optionnel)"
                  @input="form.prepTime = parseNullableNumber(($event.target as HTMLInputElement).value)"
                >
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Temps de cuisson (min)
                </label>
                <input
                  :value="form.cookTime ?? ''"
                  type="number"
                  min="0"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="30 (optionnel)"
                  @input="form.cookTime = parseNullableNumber(($event.target as HTMLInputElement).value)"
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
                  :value="form.servings ?? ''"
                  type="number"
                  min="1"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="4 (optionnel)"
                  @input="form.servings = parseNullableNumber(($event.target as HTMLInputElement).value)"
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
                        class="text-lg font-medium text-gray-700 bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-hidden px-2 py-1 flex-1"
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
                        class="text-lg font-medium text-gray-700 bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-hidden px-2 py-1 flex-1"
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
                    @dragover.prevent="handleSectionDragOver($event)"
                    @drop="handleSectionDrop($event, sectionIndex)"
                    @dragenter.prevent="handleSectionDragEnter(sectionIndex)"
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
                      @dragenter.prevent="handleInstructionDragEnter(sectionIndex, index)"
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
                        :value="instructionContent(instruction)"
                        @input="updateInstructionContent(sectionIndex, index, ($event.target as HTMLTextAreaElement).value)"
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
                class="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
              >
                Annuler
              </button>
              <button
                type="submit"
                class="px-6 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
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

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Recipe, RecipeInput, RecipeSectionInput, SectionType } from '#shared/types'
import { categoryImage } from '#shared/utils/recipes'

/** Formulaire : les quantités restent du texte libre, les étapes du texte. */
interface FormIngredient {
  id?: string
  name: string
  amount: string
  unit: string
  optional: boolean
  orderIndex: number
}

interface FormInstruction {
  content: string
  orderIndex: number
}

interface FormSection {
  id?: string
  name: string
  type: SectionType
  orderIndex: number
  ingredients: FormIngredient[]
  instructions: FormInstruction[]
}

interface RecipeForm {
  title: string
  description: string
  category: string
  prepTime: number | null
  cookTime: number | null
  servings: number | null
  image: string
  tags: string[]
  notes: string
  sections: FormSection[]
}

const props = withDefaults(defineProps<{
  show?: boolean
  /** Recette complète (avec sections) à modifier ; `null` pour une création. */
  recipe?: Recipe | null
}>(), {
  show: false,
  recipe: null
})

const emit = defineEmits<{
  close: []
  save: [recipe: Recipe | RecipeInput]
}>()

const recipesStore = useRecipesStore()
const { $toast } = useNuxtApp()

const isEditing = computed(() => !!props.recipe)

const emptyForm = (): RecipeForm => ({
  title: '',
  description: '',
  category: '',
  prepTime: null,
  cookTime: null,
  servings: null,
  image: '', // Will be set automatically based on category
  tags: [],
  notes: '',
  sections: []
})

// Form data
const form = ref<RecipeForm>(emptyForm())

const tagsInput = ref('')

const parseNullableNumber = (value: string): number | null => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

const byOrderIndex = (a: FormSection, b: FormSection) => a.orderIndex - b.orderIndex

// Sections organisées pour l'affichage.
// IMPORTANT : ne pas utiliser .map() ici, les computed renvoient des références
// aux objets de form.sections pour que l'édition en place fonctionne.
const sectionsWithIngredients = computed(() =>
  form.value.sections
    .filter(section => section.type === 'ingredients' || section.type === 'mixed')
    .sort(byOrderIndex)
)

const sectionsWithInstructions = computed(() =>
  form.value.sections
    .filter(section => section.type === 'instructions' || section.type === 'mixed')
    .sort(byOrderIndex)
)

const instructionContent = (instruction: FormInstruction) => instruction.content

// Define all functions first
const resetForm = () => {
  form.value = emptyForm()
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
const addSection = (type: SectionType) => {
  // Calculer le prochain orderIndex en fonction des sections existantes du même type
  const existingSectionsOfType = form.value.sections.filter(s => s.type === type)
  const nextOrderIndex = existingSectionsOfType.length > 0
    ? Math.max(...existingSectionsOfType.map(s => s.orderIndex)) + 1
    : form.value.sections.length

  form.value.sections.push({
    name: 'Nouvelle section',
    type,
    orderIndex: nextOrderIndex,
    ingredients: [],
    instructions: []
  })
}

const sectionsOfType = (type: SectionType) =>
  type === 'ingredients' ? sectionsWithIngredients.value : sectionsWithInstructions.value

const removeSection = (sectionIndex: number, type: SectionType) => {
  const section = sectionsOfType(type)[sectionIndex]
  if (!section) {
    console.error('Section non trouvée à l\'index', sectionIndex)
    return
  }

  // Les computed renvoient des références aux objets de form.sections :
  // comparaison par identifiant si présent, sinon par référence.
  const index = form.value.sections.findIndex(s =>
    section.id && s.id ? s.id === section.id : s === section
  )

  if (index !== -1) {
    form.value.sections.splice(index, 1)
  }
}

// Fonctions pour réorganiser les sections
const moveSectionUp = (sectionIndex: number, type: SectionType) => {
  if (sectionIndex === 0) return // Déjà en première position

  const sections = sectionsOfType(type)
  const section = sections[sectionIndex]
  const prevSection = sections[sectionIndex - 1]

  if (!section || !prevSection) return

  // Échanger les orderIndex
  const tempOrderIndex = section.orderIndex
  section.orderIndex = prevSection.orderIndex
  prevSection.orderIndex = tempOrderIndex

  // Trier form.sections par orderIndex pour maintenir l'ordre
  form.value.sections.sort(byOrderIndex)
}

const moveSectionDown = (sectionIndex: number, type: SectionType) => {
  const sections = sectionsOfType(type)

  if (sectionIndex === sections.length - 1) return // Déjà en dernière position

  const section = sections[sectionIndex]
  const nextSection = sections[sectionIndex + 1]

  if (!section || !nextSection) return

  // Échanger les orderIndex
  const tempOrderIndex = section.orderIndex
  section.orderIndex = nextSection.orderIndex
  nextSection.orderIndex = tempOrderIndex

  // Trier form.sections par orderIndex pour maintenir l'ordre
  form.value.sections.sort(byOrderIndex)
}

// Variables pour le drag and drop des instructions
const draggedInstructionIndex = ref<number | null>(null)
const draggedSectionIndex = ref<number | null>(null)
const dragOverInstructionIndex = ref<number | null>(null)
const dragOverSectionIndex = ref<number | null>(null)

const renumber = (instructions: FormInstruction[]) => {
  instructions.forEach((instruction, idx) => {
    instruction.orderIndex = idx
  })
}

const isOutside = (event: DragEvent) => {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return true
  const rect = target.getBoundingClientRect()
  const { clientX: x, clientY: y } = event
  return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom
}

// Gestion du drag and drop des instructions
const handleInstructionDragStart = (event: DragEvent, sectionIndex: number, instructionIndex: number) => {
  draggedSectionIndex.value = sectionIndex
  draggedInstructionIndex.value = instructionIndex
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', '') // Nécessaire pour Firefox
  }
  // Ne pas modifier l'opacité pour éviter le style grisé
}

const handleInstructionDragOver = (event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

const handleInstructionDragEnter = (sectionIndex: number, instructionIndex: number) => {
  if (draggedSectionIndex.value === null) return

  // Ne pas mettre en surbrillance si c'est la même instruction
  if (draggedSectionIndex.value === sectionIndex && draggedInstructionIndex.value === instructionIndex) {
    return
  }

  dragOverSectionIndex.value = sectionIndex
  dragOverInstructionIndex.value = instructionIndex
}

const handleInstructionDragLeave = (event: DragEvent) => {
  // Ne réinitialiser que si on quitte vraiment l'élément (pas juste un enfant)
  if (isOutside(event)) {
    dragOverSectionIndex.value = null
    dragOverInstructionIndex.value = null
  }
}

const handleInstructionDrop = (event: DragEvent, targetSectionIndex: number, targetInstructionIndex: number) => {
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
  const instructionToMove = sourceSection?.instructions[sourceInstructionIndex]

  if (!sourceSection || !targetSection || !instructionToMove) {
    resetDragState()
    return
  }

  sourceSection.instructions.splice(sourceInstructionIndex, 1)

  if (sourceSectionIndex === targetSectionIndex) {
    // Même section : l'index de destination recule de 1 si on déplace vers le bas
    const insertIndex = sourceInstructionIndex < targetInstructionIndex
      ? targetInstructionIndex - 1
      : targetInstructionIndex
    sourceSection.instructions.splice(insertIndex, 0, instructionToMove)
    renumber(sourceSection.instructions)
  } else {
    // Section différente : insérer dans la cible
    targetSection.instructions.splice(targetInstructionIndex, 0, instructionToMove)
    renumber(sourceSection.instructions)
    renumber(targetSection.instructions)
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
const handleSectionDragOver = (event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

const handleSectionDragEnter = (sectionIndex: number) => {
  if (draggedSectionIndex.value === null) return

  // Ne pas mettre en surbrillance si c'est la même section
  if (draggedSectionIndex.value === sectionIndex) {
    return
  }

  dragOverSectionIndex.value = sectionIndex
  dragOverInstructionIndex.value = null // Pas d'instruction spécifique, juste la section
}

const handleSectionDragLeave = (event: DragEvent) => {
  // Ne réinitialiser que si on quitte vraiment l'élément (pas juste un enfant)
  if (!isOutside(event)) return
  const target = event.currentTarget
  const related = event.relatedTarget
  if (!(related instanceof Node) || !(target instanceof HTMLElement) || !target.contains(related)) {
    dragOverSectionIndex.value = null
    dragOverInstructionIndex.value = null
  }
}

const handleSectionDrop = (event: DragEvent, targetSectionIndex: number) => {
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
  const instructionToMove = sourceSection?.instructions[sourceInstructionIndex]

  if (!sourceSection || !targetSection || !instructionToMove) {
    resetDragState()
    return
  }

  // Supprimer de la source, ajouter à la fin de la section cible
  sourceSection.instructions.splice(sourceInstructionIndex, 1)
  targetSection.instructions.push(instructionToMove)
  renumber(sourceSection.instructions)
  renumber(targetSection.instructions)

  resetDragState()
}

// Fonction pour mettre à jour le contenu d'une instruction
const updateInstructionContent = (sectionIndex: number, instructionIndex: number, value: string) => {
  const section = sectionsWithInstructions.value[sectionIndex]
  if (!section) return

  const instruction = section.instructions[instructionIndex]
  if (instruction) {
    instruction.content = value
  } else {
    section.instructions[instructionIndex] = { content: value, orderIndex: instructionIndex }
  }
}

const addIngredientToSection = (sectionIndex: number) => {
  const section = sectionsWithIngredients.value[sectionIndex]
  if (section) {
    section.ingredients.push({
      name: '',
      amount: '',
      unit: '',
      optional: false,
      orderIndex: section.ingredients.length
    })
  }
}

const removeIngredientFromSection = (sectionIndex: number, ingredientIndex: number) => {
  const section = sectionsWithIngredients.value[sectionIndex]
  if (section) {
    section.ingredients.splice(ingredientIndex, 1)
  }
}

const addInstructionToSection = (sectionIndex: number) => {
  const section = sectionsWithInstructions.value[sectionIndex]
  if (section) {
    section.instructions.push({
      content: '',
      orderIndex: section.instructions.length
    })
  }
}

const removeInstructionFromSection = (sectionIndex: number, instructionIndex: number) => {
  const section = sectionsWithInstructions.value[sectionIndex]
  if (section) {
    section.instructions.splice(instructionIndex, 1)
    renumber(section.instructions)
  }
}

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Erreur inconnue')

const handleSubmit = async () => {
  // Validation
  const hasIngredients = sectionsWithIngredients.value.some(s => s.ingredients.length > 0)
  const hasInstructions = sectionsWithInstructions.value.some(s => s.instructions.length > 0)

  if (!form.value.title || !form.value.category || !hasIngredients || !hasInstructions) {
    $toast.error('Erreur', 'Veuillez remplir tous les champs obligatoires', 3000)
    return
  }

  // Update tags
  updateTags()

  // Assign image based on category
  const imageUrl = categoryImage(form.value.category)

  // Préparer les sections avec orderIndex correct
  const sections: RecipeSectionInput[] = []
  let orderIndex = 0

  // Ajouter les sections d'ingrédients
  sectionsWithIngredients.value.forEach((section) => {
    sections.push({
      id: section.id,
      name: section.name,
      type: 'ingredients',
      orderIndex: orderIndex++,
      ingredients: section.ingredients.map((ingredient, idx) => ({
        ...ingredient,
        orderIndex: idx
      })),
      instructions: []
    })
  })

  // Ajouter les sections d'instructions
  sectionsWithInstructions.value.forEach((section) => {
    sections.push({
      id: section.id,
      name: section.name,
      type: 'instructions',
      orderIndex: orderIndex++,
      ingredients: [],
      instructions: section.instructions.map((instruction, idx) => ({
        content: instruction.content,
        orderIndex: idx
      }))
    })
  })

  // Prepare recipe data
  const recipeData: RecipeInput = {
    title: form.value.title,
    description: form.value.description,
    category: form.value.category,
    prepTime: form.value.prepTime,
    cookTime: form.value.cookTime,
    servings: form.value.servings,
    image: imageUrl,
    tags: form.value.tags,
    notes: form.value.notes,
    sections,
    id: props.recipe?.id || generateId(),
    createdAt: props.recipe?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  // Save recipe
  if (isEditing.value && props.recipe) {
    try {
      const updatedRecipe = await recipesStore.updateRecipe(props.recipe.id, recipeData)
      $toast.success('Succès', 'Recette modifiée avec succès !', 3000)
      emit('save', updatedRecipe || recipeData)
      handleCancel()
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error)
      $toast.error('Erreur', `Erreur lors de la modification de la recette: ${errorMessage(error)}`, 5000)
    }
  } else {
    try {
      const addedRecipe = await recipesStore.addRecipe(recipeData)
      $toast.success('Succès', 'Recette créée avec succès !', 3000)
      emit('save', addedRecipe || recipeData)
      handleCancel()
    } catch (error) {
      console.error('Erreur lors de l\'ajout:', error)
      $toast.error('Erreur', `Erreur lors de la création de la recette: ${errorMessage(error)}`, 5000)
    }
  }
}

// Initialize form when recipe changes (after all functions are defined).
// Les sections viennent du modèle structuré (recipe_sections) : plus de repli JSONB.
watch(() => props.recipe, (newRecipe) => {
  if (newRecipe) {
    form.value = {
      title: newRecipe.title,
      description: newRecipe.description,
      category: newRecipe.category,
      prepTime: newRecipe.prepTime,
      cookTime: newRecipe.cookTime,
      servings: newRecipe.servings,
      image: '', // Will be set automatically based on category
      tags: [...newRecipe.tags],
      notes: newRecipe.notes,
      sections: newRecipe.sections.map(section => ({
        id: section.id,
        name: section.name,
        type: section.type,
        orderIndex: section.orderIndex,
        ingredients: section.ingredients.map(ingredient => ({
          id: ingredient.id,
          name: ingredient.name,
          amount: ingredient.amount ?? '',
          unit: ingredient.unit ?? '',
          optional: ingredient.optional,
          orderIndex: ingredient.orderIndex
        })),
        instructions: section.instructions.map(instruction => ({
          content: instruction.content,
          orderIndex: instruction.orderIndex
        }))
      }))
    }

    tagsInput.value = newRecipe.tags.join(', ')
  } else {
    resetForm()
  }
}, { immediate: true })

const handleCancel = () => {
  resetForm()
  emit('close')
}

const handleBackdropClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget) {
    handleCancel()
  }
}

// Fermer avec la touche Escape
const handleEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.show) {
    handleCancel()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleEscape)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscape)
})
</script>
