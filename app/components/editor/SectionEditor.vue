<template>
  <fieldset class="space-y-3 rounded-xl border border-default bg-elevated/50 p-3 sm:p-4">
    <legend class="sr-only">{{ section.name || $t('editor.sections.defaultName') }}</legend>
    <div class="flex items-center gap-2">
      <div class="flex flex-col">
        <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="xs" :aria-label="$t('editor.sections.moveUp')" :disabled="position === 0" @click="emit('move', -1)" />
        <UButton icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="xs" :aria-label="$t('editor.sections.moveDown')" :disabled="position >= count - 1" @click="emit('move', 1)" />
      </div>
      <UFormField :name="`${prefix}.name`" class="flex-1" :ui="{ error: 'text-xs' }">
        <UInput
          :model-value="section.name"
          :placeholder="$t('editor.sections.sectionName')"
          variant="ghost"
          size="lg"
          class="w-full font-serif font-medium"
          @update:model-value="patch({ name: String($event ?? '') })"
        />
      </UFormField>
      <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" :aria-label="$t('editor.sections.remove')" @click="emit('remove')" />
    </div>

    <!-- Ingrédients -->
    <template v-if="section.type === 'ingredients'">
      <p v-if="section.ingredients.length === 0" class="text-sm text-muted">{{ $t('editor.sections.emptyIngredients') }}</p>
      <div v-else class="space-y-2">
        <EditorIngredientRow
          v-for="(ingredient, i) in section.ingredients"
          :key="ingredient.key"
          :ingredient="ingredient"
          :field-prefix="`${prefix}.ingredients.${i}`"
          :can-move-up="i > 0"
          :can-move-down="i < section.ingredients.length - 1"
          @update:ingredient="patch({ ingredients: replaceAt(section.ingredients, i, $event) })"
          @move="patch({ ingredients: moveItem(section.ingredients, i, $event) })"
          @remove="patch({ ingredients: section.ingredients.filter((_, j) => j !== i) })"
        />
      </div>
      <UButton icon="i-lucide-plus" :label="$t('editor.sections.addIngredient')" color="neutral" variant="soft" size="sm" @click="addIngredient" />
    </template>

    <!-- Étapes (glisser-déposer par la poignée + boutons) -->
    <template v-else>
      <p v-if="section.instructions.length === 0" class="text-sm text-muted">{{ $t('editor.sections.emptySteps') }}</p>
      <ol v-else class="space-y-2">
        <li
          v-for="(step, i) in section.instructions"
          :key="step.key"
          :draggable="dragArmed === i"
          class="rounded-lg transition-colors"
          :class="{ 'ring-2 ring-primary/40 bg-primary/5': dragOver === i && dragIndex !== null && dragIndex !== i, 'opacity-60': dragIndex === i }"
          @dragstart="onDragStart(i, $event)"
          @dragover.prevent="dragOver = i"
          @dragleave="dragOver = null"
          @drop.prevent="onDrop(i)"
          @dragend="resetDrag"
        >
          <EditorStepRow
            :step="step"
            :index="i"
            :field-prefix="`${prefix}.instructions.${i}`"
            :can-move-up="i > 0"
            :can-move-down="i < section.instructions.length - 1"
            @update:step="patch({ instructions: replaceAt(section.instructions, i, $event) })"
            @move="patch({ instructions: moveItem(section.instructions, i, $event) })"
            @remove="patch({ instructions: section.instructions.filter((_, j) => j !== i) })"
            @arm-drag="dragArmed = i"
          />
        </li>
      </ol>
      <UButton icon="i-lucide-plus" :label="$t('editor.sections.addStep')" color="neutral" variant="soft" size="sm" @click="addStep" />
    </template>
  </fieldset>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import EditorIngredientRow from './IngredientRow.vue'
import EditorStepRow from './StepRow.vue'
import { newIngredient, newStep, type FormSection } from './RecipeEditorForm.vue'

/**
 * Une section du formulaire (ingrédients OU étapes) : nom, lignes,
 * réordonnancement (boutons + glisser-déposer des étapes), ajout/suppression.
 * Toutes les modifications remontent par `update:section` (objet neuf).
 */
const props = defineProps<{
  section: FormSection
  /** Index dans `state.sections` (noms de champs UForm). */
  index: number
  /** Position et nombre de sections du même type (boutons monter/descendre). */
  position: number
  count: number
}>()

const emit = defineEmits<{
  'update:section': [value: FormSection]
  'move': [direction: -1 | 1]
  'remove': []
}>()

const prefix = computed(() => `sections.${props.index}`)

const patch = (changes: Partial<FormSection>) => {
  emit('update:section', { ...props.section, ...changes })
}

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  return items.map((item, i) => (i === index ? value : item))
}

function moveItem<T>(items: T[], from: number, direction: -1 | 1): T[] {
  const to = from + direction
  if (to < 0 || to >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  if (moved !== undefined) next.splice(to, 0, moved)
  return next
}

const addIngredient = () => patch({ ingredients: [...props.section.ingredients, newIngredient()] })
const addStep = () => patch({ instructions: [...props.section.instructions, newStep()] })

// --- Glisser-déposer des étapes (dans la section) ---------------------------
const dragArmed = ref<number | null>(null)
const dragIndex = ref<number | null>(null)
const dragOver = ref<number | null>(null)

const onDragStart = (index: number, event: DragEvent) => {
  if (dragArmed.value !== index) {
    event.preventDefault()
    return
  }
  dragIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

const onDrop = (target: number) => {
  const from = dragIndex.value
  if (from !== null && from !== target) {
    const next = [...props.section.instructions]
    const [moved] = next.splice(from, 1)
    if (moved !== undefined) next.splice(target, 0, moved)
    patch({ instructions: next })
  }
  resetDrag()
}

const resetDrag = () => {
  dragArmed.value = null
  dragIndex.value = null
  dragOver.value = null
}
</script>
