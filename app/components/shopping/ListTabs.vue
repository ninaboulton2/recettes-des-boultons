<template>
  <div class="flex items-center gap-2 print:hidden">
    <!-- Mobile : menu déroulant ; grand écran : onglets.
         `contain: inline-size` : le libellé (nowrap) ne dicte pas la largeur minimale de la page. -->
    <div class="min-w-0 flex-1 [contain:inline-size] md:hidden">
      <USelectMenu
        :model-value="modelValue ?? undefined"
        :items="selectItems"
        value-key="value"
        :search-input="false"
        :placeholder="$t('shopping.lists.select')"
        icon="i-lucide-list"
        size="lg"
        class="w-full"
        :aria-label="$t('shopping.lists.select')"
        @update:model-value="emit('update:modelValue', String($event))"
      />
    </div>
    <div class="hidden min-w-0 flex-1 [contain:inline-size] md:block">
      <UTabs
        :model-value="modelValue ?? undefined"
        :items="tabItems"
        :content="false"
        color="primary"
        variant="link"
        :ui="{ list: 'overflow-x-auto', trigger: 'shrink-0' }"
        @update:model-value="emit('update:modelValue', String($event))"
      />
    </div>

    <UDropdownMenu v-if="current" :items="listMenu" :content="{ align: 'end' }">
      <UButton
        icon="i-lucide-ellipsis-vertical"
        color="neutral"
        variant="ghost"
        size="lg"
        :aria-label="$t('shopping.lists.actions')"
      />
    </UDropdownMenu>
    <UButton
      icon="i-lucide-plus"
      :label="$t('shopping.lists.create')"
      :aria-label="$t('shopping.lists.create')"
      color="primary"
      variant="soft"
      size="lg"
      :ui="{ label: 'hidden sm:inline' }"
      @click="openCreate"
    />

    <!-- Créer / renommer -->
    <UModal
      :open="nameModal.open"
      :title="nameModal.mode === 'create' ? $t('shopping.createModal.title') : $t('shopping.renameModal.title')"
      @update:open="value => !value && (nameModal.open = false)"
    >
      <template #body>
        <form id="shopping-list-name-form" @submit.prevent="submitName">
          <UFormField :label="nameModal.mode === 'create' ? $t('shopping.createModal.label') : $t('shopping.renameModal.label')" required>
            <UInput
              v-model="nameModal.value"
              :placeholder="$t('shopping.createModal.placeholder')"
              class="w-full"
              maxlength="200"
              autofocus
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="$t('shopping.createModal.cancel')" color="neutral" variant="ghost" @click="nameModal.open = false" />
          <UButton
            :label="nameModal.mode === 'create' ? $t('shopping.createModal.confirm') : $t('shopping.renameModal.confirm')"
            type="submit"
            form="shopping-list-name-form"
            :loading="nameModal.busy"
            :disabled="!nameModal.value.trim()"
          />
        </div>
      </template>
    </UModal>

    <!-- Vider / supprimer -->
    <UModal
      :open="confirmModal.open"
      :title="confirmModal.mode === 'delete' ? $t('shopping.deleteModal.title') : $t('shopping.clearModal.title')"
      :description="current ? $t(confirmModal.mode === 'delete' ? 'shopping.deleteModal.message' : 'shopping.clearModal.message', { name: current.name, count: current.items.length }) : undefined"
      @update:open="value => !value && (confirmModal.open = false)"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="$t('shopping.deleteModal.cancel')" color="neutral" variant="ghost" @click="confirmModal.open = false" />
          <UButton
            :label="confirmModal.mode === 'delete' ? $t('shopping.deleteModal.confirm') : $t('shopping.clearModal.confirm')"
            :color="confirmModal.mode === 'delete' ? 'error' : 'warning'"
            :icon="confirmModal.mode === 'delete' ? 'i-lucide-trash-2' : 'i-lucide-eraser'"
            :loading="confirmModal.busy"
            @click="submitConfirm"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { ShoppingList } from '#shared/types'

/**
 * Choix de la liste courante (onglets sur grand écran, menu déroulant sur
 * mobile) et actions sur les listes : créer, renommer, vider, supprimer
 * (confirmations en `UModal`).
 */
const props = defineProps<{
  lists: ShoppingList[]
  modelValue: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [listId: string]
  create: [name: string, done: () => void]
  rename: [listId: string, name: string, done: () => void]
  clear: [listId: string, done: () => void]
  delete: [listId: string, done: () => void]
}>()

const { t } = useI18n()

const current = computed(() => props.lists.find(list => list.id === props.modelValue) ?? null)

const tabItems = computed(() => props.lists.map(list => ({
  label: list.name,
  value: list.id,
  badge: list.items.length > 0 ? String(list.items.filter(item => !item.checked).length) : undefined
})))

const selectItems = computed(() => props.lists.map(list => ({
  label: `${list.name} · ${t('shopping.lists.items', { count: list.items.length }, list.items.length)}`,
  value: list.id
})))

const listMenu = computed(() => [
  [
    { label: t('shopping.lists.rename'), icon: 'i-lucide-pencil', onSelect: () => afterMenu(openRename) },
    { label: t('shopping.lists.clear'), icon: 'i-lucide-eraser', disabled: (current.value?.items.length ?? 0) === 0, onSelect: () => afterMenu(() => openConfirm('clear')) }
  ],
  [
    { label: t('shopping.lists.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => afterMenu(() => openConfirm('delete')) }
  ]
])

/** Ouvre une modale une fois le menu refermé (sinon le toucher qui ferme le menu peut la refermer aussitôt). */
const afterMenu = (open: () => void) => {
  setTimeout(open, 0)
}

// --- Créer / renommer ---
const nameModal = reactive<{ open: boolean, mode: 'create' | 'rename', value: string, busy: boolean }>({
  open: false, mode: 'create', value: '', busy: false
})

const openCreate = () => {
  Object.assign(nameModal, { open: true, mode: 'create', value: '', busy: false })
}

const openRename = () => {
  if (!current.value) return
  Object.assign(nameModal, { open: true, mode: 'rename', value: current.value.name, busy: false })
}

const submitName = () => {
  const name = nameModal.value.trim()
  if (!name || nameModal.busy) return
  nameModal.busy = true
  const done = () => {
    nameModal.busy = false
    nameModal.open = false
  }
  if (nameModal.mode === 'create') emit('create', name, done)
  else if (current.value) emit('rename', current.value.id, name, done)
}

// --- Vider / supprimer ---
const confirmModal = reactive<{ open: boolean, mode: 'clear' | 'delete', busy: boolean }>({ open: false, mode: 'delete', busy: false })

const openConfirm = (mode: 'clear' | 'delete') => {
  Object.assign(confirmModal, { open: true, mode, busy: false })
}

const submitConfirm = () => {
  if (!current.value || confirmModal.busy) return
  confirmModal.busy = true
  const done = () => {
    confirmModal.busy = false
    confirmModal.open = false
  }
  if (confirmModal.mode === 'delete') emit('delete', current.value.id, done)
  else emit('clear', current.value.id, done)
}
</script>
