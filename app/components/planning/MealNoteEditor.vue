<template>
  <div class="text-xs">
    <template v-if="!editing">
      <button
        v-if="modelValue"
        type="button"
        class="flex w-full items-start gap-1.5 rounded-lg bg-muted px-2 py-1.5 text-left text-default hover:bg-accented print:bg-transparent print:px-0"
        :aria-label="$t('planning.note.edit')"
        @click="startEditing"
      >
        <UIcon name="i-lucide-sticky-note" class="mt-0.5 size-3.5 shrink-0 text-muted print:hidden" />
        <span class="whitespace-pre-line break-words">{{ modelValue }}</span>
      </button>
      <UButton
        v-else
        :label="label"
        icon="i-lucide-sticky-note"
        color="neutral"
        variant="ghost"
        size="xs"
        class="w-full justify-start text-muted print:hidden"
        @click="startEditing"
      />
    </template>

    <form v-else class="space-y-1.5" @submit.prevent="save">
      <UTextarea
        ref="textarea"
        v-model="draft"
        :placeholder="$t('planning.note.placeholder')"
        :rows="3"
        autoresize
        size="sm"
        class="w-full"
        :aria-label="label"
        @keydown.esc.prevent="cancel"
        @keydown.meta.enter.prevent="save"
        @keydown.ctrl.enter.prevent="save"
      />
      <div class="flex justify-end gap-1">
        <UButton :label="$t('planning.note.cancel')" color="neutral" variant="ghost" size="xs" @click="cancel" />
        <UButton :label="$t('planning.note.save')" type="submit" size="xs" :loading="saving" />
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'

/**
 * Note d'un jour ou d'un créneau : affichage compact, édition en place
 * (Entrée+Cmd/Ctrl pour enregistrer, Échap pour annuler). Un contenu vide
 * supprime la note.
 */
const props = defineProps<{
  modelValue: string | null | undefined
  /** Libellé du bouton d'ajout et de la zone de saisie (ex. « Note du jour »). */
  label: string
}>()

const emit = defineEmits<{
  /** Contenu à enregistrer (`null` : suppression). Doit renvoyer une promesse résolue à la fin. */
  save: [content: string | null, done: () => void]
}>()

const editing = ref(false)
const saving = ref(false)
const draft = ref('')
const textarea = ref<{ textareaRef?: HTMLTextAreaElement } | null>(null)

const startEditing = async () => {
  draft.value = props.modelValue ?? ''
  editing.value = true
  await nextTick()
  textarea.value?.textareaRef?.focus()
}

const cancel = () => {
  editing.value = false
  draft.value = ''
}

const save = () => {
  const content = draft.value.trim()
  if (content === (props.modelValue ?? '')) {
    cancel()
    return
  }
  saving.value = true
  emit('save', content === '' ? null : content, () => {
    saving.value = false
    editing.value = false
  })
}
</script>
