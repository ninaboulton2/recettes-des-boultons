<template>
  <div
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!--
      Dépôt géré ici (dropzone du composant désactivée) : un fichier de type
      non pris en charge n'est pas ignoré en silence, `addFiles` l'écarte avec
      un message. Le clic / la touche Entrée ouvrent le sélecteur ; avec
      `image/*`, un téléphone propose aussi l'appareil photo.
    -->
    <UFileUpload
      :model-value="files"
      multiple
      :dropzone="false"
      :highlight="isDragging"
      :accept="RECIPE_FILE_ACCEPT"
      :disabled="disabled"
      icon="i-lucide-file-up"
      :label="$t('translator.files.label')"
      :description="$t('translator.files.description', { max: maxMb })"
      layout="list"
      class="w-full"
      :ui="{ base: 'min-h-28' }"
      @update:model-value="onUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { RECIPE_FILE_ACCEPT, RECIPE_FILE_MAX_BYTES } from '#shared/schemas/media'

/**
 * Zone de dépôt / sélecteur de fichiers du traducteur (PDF, photo, texte).
 * Ne trie rien : elle remonte les fichiers choisis (`add`) et la liste après
 * suppression d'un fichier (`update:files`) ; le tri et les limites sont dans
 * `useTranslator().addFiles`.
 */
const props = defineProps<{
  /** Photos et PDF déjà retenus (affichés sous la zone). */
  files: File[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  add: [files: File[]]
  'update:files': [files: File[]]
}>()

const maxMb = Math.round(RECIPE_FILE_MAX_BYTES / (1024 * 1024))

const isDragging = ref(false)
// dragenter / dragleave se déclenchent aussi sur les éléments enfants : on compte.
let dragDepth = 0

const hasFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes('Files') ?? false

function onDragEnter(event: DragEvent): void {
  if (props.disabled || !hasFiles(event)) return
  dragDepth += 1
  isDragging.value = true
}

function onDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) isDragging.value = false
}

function onDrop(event: DragEvent): void {
  dragDepth = 0
  isDragging.value = false
  if (props.disabled) return
  const dropped = Array.from(event.dataTransfer?.files ?? [])
  if (dropped.length > 0) emit('add', dropped)
}

/** Sélecteur de fichiers (ajout) ou bouton de suppression d'un fichier (liste plus courte). */
function onUpdate(next: File[] | null | undefined): void {
  const list = next ?? []
  const known = new Set(props.files)
  const fresh = list.filter(file => !known.has(file))
  if (fresh.length > 0) emit('add', fresh)
  else if (list.length < props.files.length) emit('update:files', list)
}
</script>
