<template>
  <UFormField :label="$t('editor.photo.label')" :help="$t('editor.photo.hint')" name="photoPath">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div class="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-default bg-muted sm:w-56">
        <img v-if="previewUrl" :src="previewUrl" alt="" class="h-full w-full object-cover">
        <div v-else class="flex h-full w-full items-center justify-center text-dimmed">
          <UIcon name="i-lucide-image" class="size-8" aria-hidden="true" />
        </div>
      </div>
      <div class="flex flex-1 flex-col gap-2">
        <UFileUpload
          :model-value="modelValue"
          :accept="RECIPE_PHOTO_ACCEPT"
          variant="button"
          size="sm"
          :label="previewUrl ? $t('editor.photo.replace') : $t('editor.photo.choose')"
          icon="i-lucide-camera"
          class="w-fit"
          @update:model-value="onFile"
        />
        <UButton
          v-if="previewUrl"
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          class="w-fit"
          :label="$t('editor.photo.remove')"
          @click="clear"
        />
        <p v-if="modelValue" class="text-xs text-primary">{{ $t('editor.photo.pending') }}</p>
        <p v-else-if="removed && currentPath" class="text-xs text-warning">{{ $t('editor.photo.removed') }}</p>
        <p v-if="invalid" class="text-xs text-error">{{ $t('editor.photo.invalid') }}</p>
      </div>
    </div>
  </UFormField>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RECIPE_PHOTO_ACCEPT } from '~/composables/useRecipePhoto'

/**
 * Champ photo de l'éditeur : aperçu de la photo actuelle (bucket) ou du
 * fichier choisi (object URL), remplacement, retrait. Le téléversement a lieu
 * à l'enregistrement (voir `RecipeEditorForm`).
 */
const props = defineProps<{
  /** Chemin actuel dans le bucket (`null` sans photo). */
  currentPath: string | null
}>()

/** Fichier choisi, en attente de téléversement. */
const modelValue = defineModel<File | null>({ default: null })
/** La photo actuelle doit être retirée à l'enregistrement. */
const removed = defineModel<boolean>('removed', { default: false })

const { publicUrl } = useRecipePhoto()
const invalid = ref(false)
const objectUrl = ref<string | null>(null)

const ACCEPTED = RECIPE_PHOTO_ACCEPT.split(',')

watch(modelValue, (file) => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = file ? URL.createObjectURL(file) : null
}, { immediate: true })

onBeforeUnmount(() => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
})

const previewUrl = computed(() => {
  if (objectUrl.value) return objectUrl.value
  if (removed.value) return null
  return publicUrl(props.currentPath)
})

const onFile = (file: File | File[] | null | undefined) => {
  const selected = Array.isArray(file) ? (file[0] ?? null) : (file ?? null)
  if (selected && !ACCEPTED.includes(selected.type)) {
    invalid.value = true
    modelValue.value = null
    return
  }
  invalid.value = false
  modelValue.value = selected
  if (selected) removed.value = false
}

const clear = () => {
  invalid.value = false
  modelValue.value = null
  removed.value = props.currentPath !== null
}
</script>
