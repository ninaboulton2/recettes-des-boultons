<template>
  <div class="space-y-5">
    <fieldset>
      <legend class="mb-2 text-sm font-medium text-default">{{ $t('theme.presets') }}</legend>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" :aria-label="$t('theme.presets')">
        <label
          v-for="preset in presets"
          :key="preset.id"
          class="flex cursor-pointer items-center gap-2 rounded-lg border border-default bg-default p-2.5 text-sm transition has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary hover:bg-muted"
          :data-testid="`theme-preset-${preset.id}`"
        >
          <input
            type="radio"
            name="theme-preset"
            class="sr-only"
            :value="preset.id"
            :checked="selection === preset.id"
            @change="choosePreset(preset.id)"
          >
          <span class="size-6 shrink-0 rounded-full ring-1 ring-black/10" :style="{ backgroundColor: preset.color }" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ $t(`theme.preset.${preset.id}`) }}</span>
        </label>

        <label
          class="flex cursor-pointer items-center gap-2 rounded-lg border border-default bg-default p-2.5 text-sm transition has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary hover:bg-muted"
          data-testid="theme-preset-custom"
        >
          <input type="radio" name="theme-preset" class="sr-only" value="custom" :checked="selection === 'custom'" @change="chooseCustom">
          <span class="size-6 shrink-0 rounded-full ring-1 ring-black/10" :style="{ backgroundColor: customColor }" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ $t('theme.preset.custom') }}</span>
        </label>
      </div>
    </fieldset>

    <div v-if="selection === 'custom'" class="space-y-2" data-testid="theme-custom">
      <label for="theme-custom-hex" class="block text-sm font-medium text-default">{{ $t('theme.customColor') }}</label>
      <div class="flex items-center gap-3">
        <input
          type="color"
          class="h-10 w-14 cursor-pointer rounded-md border border-default bg-default p-1"
          :value="customColor"
          :aria-label="$t('theme.colorPicker')"
          @input="onColorInput(($event.target as HTMLInputElement).value)"
        >
        <UInput
          id="theme-custom-hex"
          :model-value="hexText"
          maxlength="7"
          placeholder="#aa4466"
          class="w-32 font-mono"
          :color="customError ? 'error' : undefined"
          :aria-invalid="customError ? 'true' : undefined"
          aria-describedby="theme-custom-hint"
          @update:model-value="onHexInput(String($event ?? ''))"
        />
      </div>
      <p id="theme-custom-hint" class="text-sm" :class="customError ? 'text-error' : 'text-muted'" :role="customError ? 'alert' : undefined">
        {{ customError ?? $t('theme.customHint') }}
      </p>
    </div>

    <!-- Aperçu : l'interface entière suit en direct (le thème est déjà appliqué) ; ici, des échantillons lisibles. -->
    <div class="flex flex-wrap items-center gap-3 rounded-xl border border-default bg-muted/40 p-3" aria-hidden="true">
      <UButton :label="$t('theme.sample.button')" tabindex="-1" />
      <UBadge :label="$t('theme.sample.badge')" variant="soft" />
      <span class="text-sm font-medium text-primary">{{ $t('theme.sample.link') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { GENERATED_PRESETS, hexColorSchema, THEME_PRESET_IDS, validateTheme, type ThemeInput, type ThemePresetId } from '#shared/themes'

/**
 * Sélecteur de thème : préréglages + couleur libre (`#rrggbb`, refusée si le contraste AA n'est pas atteint).
 * `v-model` = thème VALIDÉ (`ThemeInput`) ou `null`. Pendant le choix, l'application entière prévisualise le thème
 * (`useThemeStore().setPreview`) ; l'aperçu est retiré quand le sélecteur disparaît (le parent enregistre ou non).
 */
const model = defineModel<ThemeInput | null>({ default: null })

const { t } = useI18n()
const themeStore = useThemeStore()

const presets = computed(() => THEME_PRESET_IDS.map((id) => {
  const result = validateTheme({ preset: id })
  return { id, color: result.ok ? result.theme.edition.theme.primary[500] : '#888888' }
}))

const selection = ref<ThemePresetId | 'custom'>(model.value?.preset ?? 'terracotta')
const customColor = ref(model.value?.preset === 'custom' && model.value.primary ? model.value.primary : (GENERATED_PRESETS[0]?.primary ?? '#6f8a3a'))
const hexText = ref(customColor.value)
const customError = ref<string | null>(null)
function publish(value: ThemeInput): void {
  // Le thème ne porte que le look : un éventuel ancien `name` (données antérieures) est abandonné à l'enregistrement.
  const { name: _ignored, ...rest } = value
  model.value = rest
  themeStore.setPreview(rest)
}

function choosePreset(id: ThemePresetId): void {
  selection.value = id
  customError.value = null
  publish({ preset: id })
}

function chooseCustom(): void {
  selection.value = 'custom'
  applyCustom(customColor.value)
}

function applyCustom(hex: string): void {
  const color = hexColorSchema.safeParse(hex)
  if (!color.success) {
    customError.value = t('theme.errors.format')
    return
  }
  const candidate: ThemeInput = { preset: 'custom', primary: color.data, neutral: 'stone' }
  const result = validateTheme(candidate)
  if (!result.ok) {
    customError.value = t(`theme.errors.${result.reason}`)
    return
  }
  customError.value = null
  customColor.value = color.data
  publish(candidate)
}

function onColorInput(value: string): void {
  hexText.value = value
  applyCustom(value)
}

function onHexInput(value: string): void {
  const withHash = value.startsWith('#') ? value : `#${value}`
  hexText.value = withHash
  if (/^#[0-9a-f]{6}$/i.test(withHash)) applyCustom(withHash)
  else customError.value = t('theme.errors.format')
}

onBeforeUnmount(() => themeStore.setPreview(null))
</script>
