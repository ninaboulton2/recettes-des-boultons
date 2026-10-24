<template>
  <div class="mx-auto max-w-3xl space-y-10">
    <header>
      <h1 class="font-serif text-3xl font-semibold text-highlighted md:text-4xl">{{ $t('settings.title') }}</h1>
      <p class="mt-2 text-muted">{{ $t('settings.subtitle') }}</p>
    </header>

    <!-- Profil -->
    <section class="space-y-4" aria-labelledby="profile-heading">
      <h2 id="profile-heading" class="font-serif text-xl font-semibold text-highlighted">{{ $t('settings.profile.title') }}</h2>
      <form class="space-y-4 rounded-xl border border-default p-4 md:p-5" novalidate @submit.prevent="saveProfile">
        <div class="space-y-1.5">
          <label for="settings-display-name" class="block text-sm font-medium text-default">{{ $t('settings.profile.displayName') }}</label>
          <UInput id="settings-display-name" v-model="displayName" maxlength="60" class="w-full" :color="nameError ? 'error' : undefined" aria-describedby="settings-name-help" data-testid="settings-display-name" @update:model-value="nameError = null" />
          <p id="settings-name-help" class="text-sm" :class="nameError ? 'text-error' : 'text-muted'" :role="nameError ? 'alert' : undefined">{{ nameError ?? $t('onboarding.step1.hint') }}</p>
        </div>
        <div class="space-y-1.5">
          <label for="settings-cookbook-title" class="block text-sm font-medium text-default">{{ $t('settings.profile.cookbookTitle') }}</label>
          <UInput id="settings-cookbook-title" v-model="cookbookTitle" :maxlength="COOKBOOK_TITLE_MAX" class="w-full" />
        </div>
        <div class="flex justify-end">
          <UButton type="submit" :loading="saving === 'profile'" :label="$t('ui.common.save')" />
        </div>
      </form>
    </section>

    <!-- Thème -->
    <section class="space-y-4" aria-labelledby="theme-heading" data-testid="settings-theme">
      <h2 id="theme-heading" class="font-serif text-xl font-semibold text-highlighted">{{ $t('settings.theme.title') }}</h2>
      <p class="text-sm text-muted">{{ $t('settings.theme.description') }}</p>

      <fieldset v-if="usableGroups.length > 0" class="space-y-2">
        <legend class="text-sm font-medium text-default">{{ $t('settings.theme.source') }}</legend>
        <div class="flex flex-col gap-2">
          <label class="flex cursor-pointer items-center gap-2 text-sm">
            <input v-model="source" type="radio" name="theme-source" value="personal" data-testid="theme-source-personal"> {{ $t('settings.theme.mine') }}
          </label>
          <label v-for="group in usableGroups" :key="group.groupId" class="flex cursor-pointer items-center gap-2 text-sm">
            <input v-model="source" type="radio" name="theme-source" :value="group.groupId" :data-testid="`theme-source-${group.groupId}`">
            {{ $t('settings.theme.group', { name: group.name }) }}
          </label>
        </div>
      </fieldset>

      <ThemePicker v-if="source === 'personal'" v-model="theme" />
      <p v-else class="rounded-xl border border-default bg-muted/40 p-3 text-sm text-muted">{{ $t('settings.theme.groupInfo') }}</p>

      <div class="flex items-center justify-end gap-3">
        <p v-if="themeError" class="text-sm text-error" role="alert">{{ themeError }}</p>
        <UButton :loading="saving === 'theme'" :label="$t('settings.theme.save')" data-testid="theme-save" @click="saveTheme" />
      </div>
    </section>

    <CategoryManager />
  </div>
</template>

<script setup lang="ts">
import type { ThemeInput } from '#shared/themes'
import { parseThemeInput } from '#shared/themes'
import { COOKBOOK_TITLE_MAX, validateDisplayName } from '#shared/utils/profileErrors'
import type { MyGroup } from '#shared/utils/social'

/**
 * Réglages (v2) : profil, thème (personnel ou d'un de mes groupes), catégories. La phase 6D y ajoute la langue,
 * les notifications, la visibilité dans la recherche, l'export et la suppression du compte.
 */
definePageMeta({ middleware: 'v2-only' })

const { t } = useI18n()
const authStore = useAuthStore()
const themeStore = useThemeStore()
const { save, errorMessage } = useProfileSettings()
const { listMyGroups } = useGroups()
const { $toast } = useNuxtApp()

useHead({ title: () => t('settings.title') })

const saving = ref<null | 'profile' | 'theme'>(null)

// ---- profil
const displayName = ref(authStore.profile?.display_name ?? '')
const cookbookTitle = ref(authStore.profile?.cookbook_title ?? '')
const nameError = ref<string | null>(null)

async function saveProfile(): Promise<void> {
  const invalid = validateDisplayName(displayName.value)
  if (invalid) {
    nameError.value = t(`profile.errors.${invalid}`)
    return
  }
  saving.value = 'profile'
  try {
    await save({ displayName: displayName.value, cookbookTitle: cookbookTitle.value.trim() })
    $toast.success(t('settings.saved'))
  } catch (error) {
    nameError.value = errorMessage(error)
  } finally {
    saving.value = null
  }
}

// ---- thème
const theme = ref<ThemeInput | null>(parseThemeInput(authStore.profile?.theme_settings))
const source = ref<string>(authStore.profile?.active_theme_group_id ?? 'personal')
const themeError = ref<string | null>(null)
const groups = ref<MyGroup[]>([])
// Un groupe sans thème valide ne peut pas être choisi (il donnerait le thème par défaut).
const usableGroups = computed(() => groups.value.filter(group => parseThemeInput(group.theme) !== null))

onMounted(async () => {
  try {
    groups.value = await listMyGroups()
  } catch {
    // Groupes indisponibles : on reste sur le thème personnel.
  }
  // Un thème de groupe actif devenu invalide ou un groupe quitté : retour au choix personnel dans le formulaire.
  if (source.value !== 'personal' && !usableGroups.value.some(group => group.groupId === source.value)) source.value = 'personal'
})

// `flush: 'post'` : après le démontage du sélecteur personnel, qui retire son propre aperçu.
watch(source, (value) => {
  if (value === 'personal') {
    themeStore.setPreview(theme.value)
    return
  }
  const group = groups.value.find(candidate => candidate.groupId === value)
  themeStore.setPreview(group ? parseThemeInput(group.theme) : null)
}, { flush: 'post' })
onBeforeUnmount(() => themeStore.setPreview(null))

async function saveTheme(): Promise<void> {
  themeError.value = null
  saving.value = 'theme'
  try {
    if (source.value === 'personal') {
      await save({ ...(theme.value ? { themeSettings: theme.value } : {}), activeThemeGroupId: null })
    } else {
      // Thème du groupe en mémoire AVANT de le rendre actif : pas de retour furtif au thème par défaut.
      await themeStore.loadGroupThemes(true)
      await save({ activeThemeGroupId: source.value })
    }
    themeStore.setPreview(null)
    $toast.success(t('settings.saved'))
  } catch (error) {
    themeError.value = errorMessage(error)
  } finally {
    saving.value = null
  }
}
</script>
