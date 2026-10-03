<template>
  <div class="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[5rem_9rem_minmax(0,1fr)_auto]">
    <UFormField :name="`${fieldPrefix}.amount`" :ui="{ error: 'text-xs' }">
      <UInput
        :model-value="ingredient.amount"
        :placeholder="$t('editor.ingredient.amountPlaceholder')"
        :aria-label="$t('editor.ingredient.amount')"
        inputmode="decimal"
        class="w-full"
        @update:model-value="patch({ amount: String($event ?? '') })"
      />
    </UFormField>

    <UFormField :name="`${fieldPrefix}.unit`" class="col-span-3 sm:col-span-1 sm:order-none order-last" :ui="{ error: 'text-xs' }">
      <USelectMenu
        :model-value="ingredient.unit"
        :items="unitItems"
        value-key="value"
        :placeholder="$t('editor.ingredient.unitPlaceholder')"
        :aria-label="$t('editor.ingredient.unit')"
        :search-input="{ placeholder: $t('editor.ingredient.unitSearch') }"
        create-item
        class="w-full"
        @update:model-value="patch({ unit: $event ?? '' })"
        @create="patch({ unit: $event.trim() })"
      >
        <template #create-item-label="{ item }">
          {{ $t('editor.ingredient.unitCreate', { unit: item }) }}
        </template>
      </USelectMenu>
    </UFormField>

    <UFormField :name="`${fieldPrefix}.name`" :ui="{ error: 'text-xs' }">
      <UInput
        :model-value="ingredient.name"
        :placeholder="$t('editor.ingredient.namePlaceholder')"
        :aria-label="$t('editor.ingredient.name')"
        class="w-full"
        @update:model-value="patch({ name: String($event ?? '') })"
      />
    </UFormField>

    <div class="flex items-center gap-0.5 pt-1">
      <UTooltip :text="$t('editor.ingredient.optional')">
        <UCheckbox
          :model-value="ingredient.optional"
          :aria-label="$t('editor.ingredient.optional')"
          class="mx-1"
          @update:model-value="patch({ optional: $event === true })"
        />
      </UTooltip>
      <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="xs" :aria-label="$t('editor.sections.moveUp')" :disabled="!canMoveUp" @click="emit('move', -1)" />
      <UButton icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="xs" :aria-label="$t('editor.sections.moveDown')" :disabled="!canMoveDown" @click="emit('move', 1)" />
      <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs" :aria-label="$t('editor.ingredient.remove')" @click="emit('remove')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FormIngredient } from './RecipeEditorForm.vue'

/**
 * Ligne d'ingrédient : quantité (texte libre), unité (référentiel `units`
 * avec saisie libre), nom, optionnel, monter/descendre, supprimer.
 */
const props = defineProps<{
  ingredient: FormIngredient
  /** Préfixe des noms de champs UForm (`sections.0.ingredients.2`). */
  fieldPrefix: string
  canMoveUp: boolean
  canMoveDown: boolean
}>()

const emit = defineEmits<{
  'update:ingredient': [value: FormIngredient]
  'move': [direction: -1 | 1]
  'remove': []
}>()

const { units } = useUnits()
const { locale, t } = useI18n()

interface UnitItem { label: string, value: string }

const unitItems = computed<UnitItem[]>(() => {
  const items: UnitItem[] = [{ label: t('editor.ingredient.unitNone'), value: '' }]
  for (const unit of units.value ?? []) {
    const longLabel = locale.value === 'en' ? unit.label_en : unit.label_fr
    items.push({ label: unit.abbr === longLabel ? unit.abbr : `${unit.abbr} — ${longLabel}`, value: unit.abbr })
  }
  // Unité saisie librement (ou héritée) absente du référentiel : on l'affiche telle quelle.
  const current = props.ingredient.unit.trim()
  if (current && !items.some(item => item.value === current)) {
    items.push({ label: current, value: current })
  }
  return items
})

const patch = (changes: Partial<FormIngredient>) => {
  emit('update:ingredient', { ...props.ingredient, ...changes })
}
</script>
