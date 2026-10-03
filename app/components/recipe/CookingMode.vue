<template>
  <UModal v-model:open="open" fullscreen :close="false" :ui="{ content: 'bg-default' }">
    <template #content>
      <div class="flex h-full min-h-0 flex-col" data-cooking-mode>
        <!-- En-tête -->
        <header class="flex items-center gap-3 border-b border-default px-4 py-3 sm:px-6">
          <div class="min-w-0 flex-1">
            <p class="truncate font-serif text-lg font-semibold text-highlighted sm:text-xl">
              {{ recipe?.title }}
            </p>
            <p class="text-sm text-muted tabular-nums">
              <template v-if="mode.stepCount.value > 0">
                {{ $t('recipeDetail.cooking.stepOf', { current: mode.currentIndex.value + 1, total: mode.stepCount.value }) }}
              </template>
              <template v-else>{{ $t('recipeDetail.cooking.title') }}</template>
            </p>
          </div>
          <UBadge v-if="mode.wakeLockActive.value" color="primary" variant="subtle" icon="i-lucide-sun" class="hidden sm:inline-flex">
            {{ $t('recipeDetail.cooking.wakeLockOn') }}
          </UBadge>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="lg"
            :aria-label="$t('recipeDetail.cooking.exit')"
            @click="open = false"
          />
        </header>
        <UProgress :model-value="mode.progress.value" size="xs" class="rounded-none" />

        <!-- Étape courante + ingrédients de la section -->
        <div class="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-4 py-6 sm:px-6 lg:flex-row lg:gap-12 lg:px-12 lg:py-10">
          <section v-if="mode.current.value" class="flex-1 space-y-5" aria-live="polite">
            <p v-if="mode.current.value.sectionName.trim()" class="text-xs font-semibold uppercase tracking-wide text-primary">
              {{ mode.current.value.sectionName }}
            </p>
            <div class="flex items-start gap-4 sm:gap-6">
              <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-inverted tabular-nums sm:size-14 sm:text-2xl">
                {{ mode.current.value.stepNumber }}
              </span>
              <p class="text-2xl leading-relaxed text-highlighted whitespace-pre-line sm:text-3xl sm:leading-relaxed lg:text-4xl lg:leading-snug">
                {{ mode.current.value.content }}
              </p>
            </div>
          </section>
          <section v-else class="flex flex-1 items-center justify-center text-muted">
            {{ $t('recipeDetail.cooking.noSteps') }}
          </section>

          <aside v-if="ingredients.length > 0" class="shrink-0 space-y-3 border-t border-default pt-6 lg:w-80 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <h3 class="font-serif text-lg font-semibold text-highlighted">
              {{ $t('recipeDetail.cooking.ingredients') }}
              <span v-if="sectionName" class="block text-sm font-normal text-muted">{{ sectionName }}</span>
            </h3>
            <ul class="space-y-2 text-lg text-default">
              <li v-for="ingredient in ingredients" :key="ingredient.id" class="flex gap-2">
                <UIcon name="i-lucide-dot" class="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span v-if="amountLabel(ingredient, factor)" class="font-medium tabular-nums">{{ amountLabel(ingredient, factor) }}</span>{{ amountLabel(ingredient, factor) ? ' ' : '' }}{{ ingredient.name }}
                  <span v-if="ingredient.optional" class="text-sm text-muted">({{ $t('recipeDetail.ingredients.optional') }})</span>
                </span>
              </li>
            </ul>
          </aside>
        </div>

        <!-- Navigation -->
        <footer class="flex items-center justify-between gap-3 border-t border-default px-4 py-3 sm:px-6">
          <UButton
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="outline"
            size="xl"
            :label="$t('recipeDetail.cooking.prev')"
            :disabled="!mode.hasPrev.value"
            @click="mode.prev()"
          />
          <p class="hidden text-xs text-muted md:block">
            <UKbd value="arrowleft" /> <UKbd value="arrowright" /> · <UKbd value="escape" />
            <span class="ml-1">{{ $t('recipeDetail.cooking.keyboardHint') }}</span>
          </p>
          <UButton
            v-if="mode.hasNext.value"
            trailing-icon="i-lucide-chevron-right"
            size="xl"
            :label="$t('recipeDetail.cooking.next')"
            @click="mode.next()"
          />
          <UButton
            v-else
            icon="i-lucide-check"
            color="primary"
            size="xl"
            :label="$t('recipeDetail.cooking.finish')"
            @click="open = false"
          />
        </footer>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import type { Recipe } from '#shared/types'

/**
 * Mode cuisine plein écran : une étape à la fois, ingrédients de la section,
 * navigation clavier (←/→/Échap) et Wake Lock via `useCookingMode`.
 */
const props = withDefaults(defineProps<{
  recipe: Recipe | null
  factor?: number
}>(), {
  factor: 1
})

const open = defineModel<boolean>('open', { default: false })

const mode = useCookingMode(() => props.recipe)
const { amountLabel } = useIngredientLabel()

// La modale et le composable partagent le même état d'ouverture.
watch(open, (isOpen) => {
  if (isOpen && !mode.isOpen.value) mode.open(0)
  if (!isOpen && mode.isOpen.value) mode.close()
})
watch(mode.isOpen, (isOpen) => {
  open.value = isOpen
})

const ingredients = computed(() => mode.currentIngredientSection.value?.ingredients ?? [])
const sectionName = computed(() => {
  const section = mode.currentIngredientSection.value
  if (!section || section.id === mode.current.value?.sectionId) return ''
  return section.name.trim()
})
</script>
