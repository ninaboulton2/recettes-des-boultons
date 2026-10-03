<template>
  <div class="space-y-6">
    <!-- En-tête : titre, catégorie, temps, portions, tags -->
    <div>
      <h2 class="font-serif text-2xl text-highlighted">{{ recipe.title }}</h2>
      <p v-if="recipe.description" class="mt-1 text-muted">{{ recipe.description }}</p>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <UBadge color="primary" variant="subtle" icon="i-lucide-tag">{{ recipe.category }}</UBadge>
        <UBadge v-if="recipe.prepTime != null" color="neutral" variant="subtle" icon="i-lucide-timer">
          {{ $t('translator.preview.prepTime') }} {{ $t('translator.preview.minutes', { n: recipe.prepTime }) }}
        </UBadge>
        <UBadge v-if="recipe.cookTime != null" color="neutral" variant="subtle" icon="i-lucide-flame">
          {{ $t('translator.preview.cookTime') }} {{ $t('translator.preview.minutes', { n: recipe.cookTime }) }}
        </UBadge>
        <UBadge v-if="recipe.servings != null" color="neutral" variant="subtle" icon="i-lucide-users">
          {{ $t('translator.preview.servingsCount', { n: recipe.servings }) }}
        </UBadge>
        <UBadge v-for="tag in recipe.tags ?? []" :key="tag" color="neutral" variant="outline">{{ tag }}</UBadge>
      </div>
    </div>

    <UAlert
      v-if="unknownUnitNames.length > 0"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="$t('translator.preview.unknownUnits', { names: unknownUnitNames.join(', ') })"
    />

    <!-- Sections -->
    <section v-for="(section, index) in sections" :key="index" class="space-y-3">
      <USeparator v-if="section.name" :label="section.name" />
      <USeparator v-else />

      <div v-if="section.ingredients.length > 0">
        <h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          {{ $t('translator.preview.ingredients') }}
        </h3>
        <ul class="space-y-1">
          <li v-for="(ingredient, i) in section.ingredients" :key="i" class="flex items-baseline gap-2 text-default">
            <UIcon name="i-lucide-check" class="size-4 shrink-0 translate-y-0.5 text-primary" />
            <span>
              <span v-if="formatQuantity(ingredient)" class="mr-1 font-semibold text-highlighted">{{ formatQuantity(ingredient) }}</span>
              <span>{{ ingredient.name }}</span>
              <span v-if="ingredient.optional" class="text-muted"> ({{ $t('translator.preview.optional') }})</span>
            </span>
          </li>
        </ul>
      </div>

      <div v-if="section.instructions.length > 0">
        <h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          {{ $t('translator.preview.steps') }}
        </h3>
        <ol class="space-y-2">
          <li v-for="(step, i) in section.instructions" :key="i" class="flex gap-3 text-default">
            <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{{ i + 1 }}</span>
            <span>{{ step }}</span>
          </li>
        </ol>
      </div>
    </section>

    <div v-if="recipe.notes" class="rounded-lg bg-muted p-4 text-sm text-default">
      <p class="mb-1 font-semibold text-highlighted">{{ $t('translator.preview.notes') }}</p>
      <p class="whitespace-pre-line">{{ recipe.notes }}</p>
    </div>

    <p v-if="usage" class="text-xs text-muted">
      {{ $t('translator.preview.usage', { model: usage.model, input: usage.inputTokens, output: usage.outputTokens }) }}<template v-if="usage.estimatedCostUsd != null">{{ $t('translator.preview.usageCost', { cost: usage.estimatedCostUsd.toFixed(4) }) }}</template>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { RecipeInput, RecipeIngredientInput } from '#shared/schemas/recipe'
import type { TranslateUsageInfo } from '#shared/schemas/ai'

/**
 * Aperçu lecture seule d'un `RecipeInput` renvoyé par le traducteur, avant
 * ajout. Les unités sont affichées par leur libellé canonique (`useUnits`) ;
 * les unités sans code (`unitText` conservé dans `unit`) sont signalées.
 */
const props = defineProps<{
  recipe: RecipeInput
  usage?: TranslateUsageInfo | null
}>()

const { unitLabel } = useUnits()

interface PreviewSection {
  name: string
  ingredients: RecipeIngredientInput[]
  instructions: string[]
}

const sections = computed<PreviewSection[]>(() =>
  (props.recipe.sections ?? []).map(section => ({
    name: section.name?.trim() ?? '',
    ingredients: section.ingredients ?? [],
    instructions: (section.instructions ?? []).map(step => (typeof step === 'string' ? step : step.content))
  }))
)

const unknownUnitNames = computed(() =>
  sections.value
    .flatMap(section => section.ingredients)
    .filter(ingredient => !ingredient.unitCode && ingredient.unit)
    .map(ingredient => `${ingredient.name} (« ${ingredient.unit} »)`)
)

function formatAmount(amount: RecipeIngredientInput['amount']): string {
  if (amount === null || amount === undefined) return ''
  if (typeof amount === 'number') return Number.isInteger(amount) ? String(amount) : String(Math.round(amount * 100) / 100).replace('.', ',')
  return amount
}

function formatQuantity(ingredient: RecipeIngredientInput): string {
  const amount = formatAmount(ingredient.amount)
  const unit = unitLabel(ingredient.unitCode ?? null, ingredient.unit ?? null)
  return [amount, unit].filter(part => part !== '').join(' ')
}
</script>
