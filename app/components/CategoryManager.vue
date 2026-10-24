<template>
  <section class="space-y-4" aria-labelledby="categories-heading" data-testid="category-manager">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="categories-heading" class="font-serif text-xl font-semibold text-highlighted">{{ $t('categoriesManager.title') }}</h2>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="missingSuggestions > 0"
          color="neutral"
          variant="outline"
          icon="i-lucide-sparkles"
          :label="$t('categoriesManager.addSuggested', missingSuggestions)"
          :loading="busy === 'suggest'"
          @click="addSuggested"
        />
        <UButton icon="i-lucide-plus" :label="$t('categoriesManager.add')" :disabled="!canAdd" data-testid="category-add" @click="openCreate" />
      </div>
    </div>
    <p class="text-sm text-muted">{{ $t('categoriesManager.description') }}</p>

    <p v-if="loadError" class="text-sm text-error" role="alert">{{ loadError }}</p>

    <EmptyState v-if="store.items.length === 0 && !store.loading" icon="i-lucide-tags" :title="$t('categoriesManager.empty.title')" :message="$t('categoriesManager.empty.description')" />

    <ul v-else class="divide-y divide-default rounded-xl border border-default" data-testid="category-list">
      <li v-for="(category, index) in store.items" :key="category.id" class="flex items-center gap-3 p-3" data-testid="category-item">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted" :style="category.color ? { color: category.color } : undefined">
          <UIcon :name="category.icon" class="size-5" :class="category.color ? '' : 'text-primary'" aria-hidden="true" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium text-highlighted">{{ label(category) }}</span>
          <span v-if="category.nameFr && category.nameEn && category.nameFr !== category.nameEn" class="block truncate text-sm text-muted">
            {{ locale === 'en' ? category.nameFr : category.nameEn }}
          </span>
        </span>
        <div class="flex shrink-0 items-center">
          <UButton
            color="neutral" variant="ghost" size="sm" icon="i-lucide-arrow-up"
            :aria-label="$t('categoriesManager.moveUp', { name: label(category) })"
            :disabled="index === 0 || busy !== null" @click="move(category.id, -1)"
          />
          <UButton
            color="neutral" variant="ghost" size="sm" icon="i-lucide-arrow-down"
            :aria-label="$t('categoriesManager.moveDown', { name: label(category) })"
            :disabled="index === store.items.length - 1 || busy !== null" @click="move(category.id, 1)"
          />
          <UButton
            color="neutral" variant="ghost" size="sm" icon="i-lucide-pencil"
            :aria-label="$t('categoriesManager.edit', { name: label(category) })"
            @click="openEdit(category)"
          />
          <UButton
            color="error" variant="ghost" size="sm" icon="i-lucide-trash-2"
            :aria-label="$t('categoriesManager.delete', { name: label(category) })"
            @click="toDelete = category"
          />
        </div>
      </li>
    </ul>

    <!-- Création / modification (Échap ferme : comportement de UModal) -->
    <UModal
      v-model:open="editorOpen"
      :title="editingId ? $t('categoriesManager.editor.editTitle') : $t('categoriesManager.editor.createTitle')"
      :description="$t('categoriesManager.editor.description')"
    >
      <template #body>
        <form id="category-form" class="space-y-4" novalidate @submit.prevent="submit">
          <div class="space-y-1.5">
            <label for="category-name-fr" class="block text-sm font-medium text-default">{{ $t('categoriesManager.editor.nameFr') }}</label>
            <UInput id="category-name-fr" v-model="form.nameFr" :maxlength="CATEGORY_NAME_MAX" class="w-full" data-testid="category-name-fr" />
          </div>
          <div class="space-y-1.5">
            <label for="category-name-en" class="block text-sm font-medium text-default">{{ $t('categoriesManager.editor.nameEn') }}</label>
            <UInput id="category-name-en" v-model="form.nameEn" :maxlength="CATEGORY_NAME_MAX" class="w-full" data-testid="category-name-en" />
          </div>
          <p v-if="formError" class="text-sm text-error" role="alert">{{ formError }}</p>

          <fieldset>
            <legend class="mb-2 text-sm font-medium text-default">{{ $t('categoriesManager.editor.icon') }}</legend>
            <div class="grid max-h-44 grid-cols-6 gap-1.5 overflow-y-auto sm:grid-cols-8" role="radiogroup">
              <label
                v-for="icon in CATEGORY_ICON_CHOICES"
                :key="icon"
                class="flex size-10 cursor-pointer items-center justify-center rounded-lg border border-default hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
                :title="icon.replace('i-lucide-', '')"
              >
                <input v-model="form.icon" type="radio" name="category-icon" class="sr-only" :value="icon" :aria-label="icon.replace('i-lucide-', '')">
                <UIcon :name="icon" class="size-5" aria-hidden="true" />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend class="mb-2 text-sm font-medium text-default">{{ $t('categoriesManager.editor.color') }}</legend>
            <div class="flex flex-wrap items-center gap-2" role="radiogroup">
              <label
                class="flex h-8 cursor-pointer items-center rounded-full border border-default px-3 text-sm hover:bg-muted has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
              >
                <input v-model="form.color" type="radio" name="category-color" class="sr-only" value="">
                {{ $t('categoriesManager.editor.noColor') }}
              </label>
              <label
                v-for="color in CATEGORY_COLOR_CHOICES"
                :key="color"
                class="size-8 cursor-pointer rounded-full ring-1 ring-black/10 has-[:checked]:ring-2 has-[:checked]:ring-offset-2 has-[:checked]:ring-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
                :style="{ backgroundColor: color }"
              >
                <input v-model="form.color" type="radio" name="category-color" class="sr-only" :value="color" :aria-label="color">
              </label>
            </div>
          </fieldset>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="$t('ui.common.cancel')" @click="editorOpen = false" />
          <UButton type="submit" form="category-form" :loading="busy === 'save'" :label="$t('ui.common.save')" data-testid="category-save" />
        </div>
      </template>
    </UModal>

    <!-- Suppression -->
    <UModal
      :open="toDelete !== null"
      :title="$t('categoriesManager.deleteModal.title')"
      :description="toDelete ? $t('categoriesManager.deleteModal.message', { name: label(toDelete) }) : ''"
      @update:open="value => !value && (toDelete = null)"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="$t('ui.common.cancel')" @click="toDelete = null" />
          <UButton color="error" icon="i-lucide-trash-2" :loading="busy === 'delete'" :label="$t('ui.common.delete')" data-testid="category-confirm-delete" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </section>
</template>

<script setup lang="ts">
import {
  CATEGORY_COLOR_CHOICES,
  CATEGORY_ICON_CHOICES,
  CATEGORY_NAME_MAX,
  DEFAULT_CATEGORY_ICON,
  categoryFieldsSchema
} from '#shared/schemas/categories'
import { canAddCategory, categoryLabel, SUGGESTED_CATEGORIES, type MyCategory } from '#shared/utils/categories'

/**
 * Mes catégories : liste, création, renommage (français / anglais), icône, couleur, ordre (flèches), suppression.
 * Écrit directement dans `categories` (politiques de 0019) via `useCategoriesStore`. Les modales se ferment avec Échap.
 */
const { t, locale } = useI18n()
const store = useCategoriesStore()
const { $toast } = useNuxtApp()

const busy = ref<null | 'save' | 'delete' | 'move' | 'suggest'>(null)
const loadError = ref<string | null>(null)
const label = (category: MyCategory) => categoryLabel(category, locale.value)

const canAdd = computed(() => canAddCategory(store.items.length))
const missingSuggestions = computed(() => {
  const have = new Set(store.items.map(category => category.slug))
  return SUGGESTED_CATEGORIES.filter(suggestion => !have.has(suggestion.slug)).length
})

onMounted(() => { void store.load() })

// ---- création / modification
const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const formError = ref<string | null>(null)
const form = reactive({ nameFr: '', nameEn: '', icon: DEFAULT_CATEGORY_ICON as string, color: '' })

function openCreate(): void {
  editingId.value = null
  Object.assign(form, { nameFr: locale.value === 'en' ? '' : '', nameEn: '', icon: DEFAULT_CATEGORY_ICON, color: '' })
  formError.value = null
  editorOpen.value = true
}

function openEdit(category: MyCategory): void {
  editingId.value = category.id
  Object.assign(form, { nameFr: category.nameFr ?? '', nameEn: category.nameEn ?? '', icon: category.icon, color: category.color ?? '' })
  formError.value = null
  editorOpen.value = true
}

async function submit(): Promise<void> {
  const parsed = categoryFieldsSchema.safeParse({ nameFr: form.nameFr, nameEn: form.nameEn, icon: form.icon, color: form.color })
  if (!parsed.success) {
    formError.value = parsed.error.issues.some(issue => issue.path[0] === 'nameFr' && issue.message === 'un nom est requis')
      ? t('categoriesManager.errors.nameRequired')
      : t('categoriesManager.errors.invalid')
    return
  }
  busy.value = 'save'
  try {
    if (editingId.value) await store.update(editingId.value, parsed.data)
    else await store.create(parsed.data)
    editorOpen.value = false
    $toast.success(t(editingId.value ? 'categoriesManager.updated' : 'categoriesManager.created'))
  } catch {
    formError.value = t('categoriesManager.errors.save')
  } finally {
    busy.value = null
  }
}

// ---- suppression
const toDelete = ref<MyCategory | null>(null)
async function confirmDelete(): Promise<void> {
  if (!toDelete.value) return
  busy.value = 'delete'
  try {
    await store.remove(toDelete.value.id)
    toDelete.value = null
    $toast.success(t('categoriesManager.deleted'))
  } catch {
    $toast.error(t('categoriesManager.errors.delete'))
  } finally {
    busy.value = null
  }
}

// ---- ordre
async function move(id: string, direction: -1 | 1): Promise<void> {
  busy.value = 'move'
  try {
    await store.move(id, direction)
  } catch {
    $toast.error(t('categoriesManager.errors.move'))
    await store.load(true)
  } finally {
    busy.value = null
  }
}

// ---- suggestions
async function addSuggested(): Promise<void> {
  busy.value = 'suggest'
  try {
    await store.addSuggestions()
  } catch {
    $toast.error(t('categoriesManager.errors.save'))
  } finally {
    busy.value = null
  }
}
</script>
