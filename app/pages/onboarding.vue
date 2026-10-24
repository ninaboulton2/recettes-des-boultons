<template>
  <div class="mx-auto max-w-xl space-y-6 py-4 md:py-8">
    <header class="space-y-3 text-center">
      <p class="text-sm font-medium text-muted" data-testid="onboarding-progress">
        {{ $t('onboarding.progress', { step, total: TOTAL_STEPS }) }}
      </p>
      <ol class="flex justify-center gap-2" :aria-label="$t('onboarding.steps')">
        <li
          v-for="n in TOTAL_STEPS"
          :key="n"
          class="h-1.5 w-10 rounded-full"
          :class="n <= step ? 'bg-primary' : 'bg-accented'"
          :aria-current="n === step ? 'step' : undefined"
        />
      </ol>
      <h1 ref="heading" tabindex="-1" class="font-serif text-3xl font-semibold text-highlighted focus:outline-none md:text-4xl" data-testid="onboarding-title">
        {{ $t(`onboarding.step${step}.title`) }}
      </h1>
      <p class="text-muted">{{ $t(`onboarding.step${step}.description`) }}</p>
    </header>

    <form class="space-y-5 rounded-xl border border-default bg-default p-5 md:p-6" novalidate @submit.prevent="next">
      <!-- 1. Pseudonyme (obligatoire) -->
      <div v-if="step === 1" class="space-y-2">
        <label for="onboarding-display-name" class="block text-sm font-medium text-default">{{ $t('onboarding.step1.label') }}</label>
        <UInput
          id="onboarding-display-name"
          v-model="displayName"
          maxlength="60"
          autocomplete="nickname"
          autofocus
          class="w-full"
          icon="i-lucide-user"
          :color="nameError ? 'error' : undefined"
          :aria-invalid="nameError ? 'true' : undefined"
          aria-describedby="onboarding-name-help"
          data-testid="onboarding-display-name"
          @update:model-value="nameError = null"
        />
        <p id="onboarding-name-help" class="text-sm" :class="nameError ? 'text-error' : 'text-muted'" :role="nameError ? 'alert' : undefined" data-testid="onboarding-name-help">
          {{ nameError ?? $t('onboarding.step1.hint') }}
        </p>
      </div>

      <!-- 2. Titre du carnet -->
      <div v-else-if="step === 2" class="space-y-2">
        <label for="onboarding-cookbook-title" class="block text-sm font-medium text-default">{{ $t('onboarding.step2.label') }}</label>
        <UInput
          id="onboarding-cookbook-title"
          v-model="cookbookTitle"
          :maxlength="COOKBOOK_TITLE_MAX"
          class="w-full"
          icon="i-lucide-book-open"
          :color="titleError ? 'error' : undefined"
          :aria-invalid="titleError ? 'true' : undefined"
          aria-describedby="onboarding-title-help"
          data-testid="onboarding-cookbook-title"
          @update:model-value="titleError = null"
        />
        <p id="onboarding-title-help" class="text-sm" :class="titleError ? 'text-error' : 'text-muted'" :role="titleError ? 'alert' : undefined">
          {{ titleError ?? $t('onboarding.step2.hint') }}
        </p>
      </div>

      <!-- 3. Thème (+ catégories de départ) -->
      <div v-else class="space-y-5">
        <ThemePicker v-model="theme" />
        <UCheckbox v-model="withSuggestions" :label="$t('onboarding.step3.suggestions')" :description="$t('onboarding.step3.suggestionsHint')" />
      </div>

      <p v-if="formError" class="text-sm text-error" role="alert">{{ formError }}</p>

      <div class="flex items-center justify-between gap-3">
        <UButton v-if="step > 1" type="button" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :label="$t('onboarding.back')" :disabled="busy" @click="back" />
        <span v-else />
        <UButton
          type="submit"
          :loading="busy"
          :label="step === TOTAL_STEPS ? $t('onboarding.finish') : $t('onboarding.next')"
          :trailing-icon="step === TOTAL_STEPS ? 'i-lucide-check' : 'i-lucide-arrow-right'"
          data-testid="onboarding-next"
        />
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import type { ThemeInput } from '#shared/themes'
import { COOKBOOK_TITLE_MAX, profileErrorKey, validateDisplayName } from '#shared/utils/profileErrors'

/**
 * Accueil d'un nouveau compte (v2) en 3 écrans : pseudonyme (obligatoire) → titre du carnet → thème (et catégories
 * de départ). Chaque « Suivant » enregistre son écran (`update_my_profile`) : les erreurs d'unicité / de caractères de
 * la base s'affichent tout de suite sous le champ, et une personne qui quitte en route retrouve ce qu'elle a saisi.
 * « Terminer » renseigne `onboarded_at` ; le middleware `v2-onboarding` n'envoie plus ici ensuite.
 */
definePageMeta({ middleware: 'v2-only' })

const TOTAL_STEPS = 3

const { t } = useI18n()
const localePath = useLocalePath()
const authStore = useAuthStore()
const categoriesStore = useCategoriesStore()
const { save } = useProfileSettings()
const { $toast } = useNuxtApp()

useHead({ title: () => t('onboarding.documentTitle'), meta: [{ name: 'robots', content: 'noindex' }] })

const step = ref(1)
const heading = ref<HTMLElement | null>(null)
const busy = ref(false)
const formError = ref<string | null>(null)

const displayName = ref(authStore.profile?.display_name ?? '')
const nameError = ref<string | null>(null)
const cookbookTitle = ref(authStore.profile?.cookbook_title ?? '')
const titleError = ref<string | null>(null)
const theme = ref<ThemeInput | null>(null)
const withSuggestions = ref(true)

const messageFor = (error: unknown) => t(`profile.errors.${profileErrorKey(error)}`)

async function saveStep(): Promise<boolean> {
  formError.value = null
  if (step.value === 1) {
    const invalid = validateDisplayName(displayName.value)
    if (invalid) {
      nameError.value = t(`profile.errors.${invalid}`)
      return false
    }
    try {
      await save({ displayName: displayName.value })
    } catch (error) {
      nameError.value = messageFor(error)
      return false
    }
    // Proposition « Recettes de {pseudonyme} » tant que le titre est vide
    if (!cookbookTitle.value.trim()) cookbookTitle.value = t('onboarding.step2.suggestion', { name: displayName.value.trim() })
    return true
  }
  if (step.value === 2) {
    if (cookbookTitle.value.trim().length > COOKBOOK_TITLE_MAX) {
      titleError.value = t('profile.errors.titleLength')
      return false
    }
    try {
      await save({ cookbookTitle: cookbookTitle.value.trim() })
    } catch (error) {
      titleError.value = messageFor(error)
      return false
    }
    return true
  }
  // 3 : thème (personnel) puis fin de l'accueil
  try {
    await save({
      ...(theme.value ? { themeSettings: theme.value, activeThemeGroupId: null } : {}),
      completeOnboarding: true
    })
  } catch (error) {
    formError.value = messageFor(error)
    return false
  }
  if (withSuggestions.value && categoriesStore.items.length === 0) {
    try {
      await categoriesStore.addSuggestions()
    } catch {
      // L'accueil est terminé : les catégories se rajoutent depuis les réglages.
      $toast.error(t('onboarding.step3.suggestionsError'))
    }
  }
  return true
}

async function next(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    if (!(await saveStep())) return
    if (step.value < TOTAL_STEPS) {
      step.value += 1
      await nextTick()
      heading.value?.focus()
      return
    }
    $toast.success(t('onboarding.done'))
    await navigateTo(localePath('/'))
  } finally {
    busy.value = false
  }
}

async function back(): Promise<void> {
  if (step.value <= 1) return
  formError.value = null
  step.value -= 1
  await nextTick()
  heading.value?.focus()
}

onMounted(() => { void categoriesStore.load() })
</script>
