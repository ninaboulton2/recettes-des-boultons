<template>
  <li
    class="flex flex-wrap items-center gap-x-3 gap-y-2 px-2 transition-colors hover:bg-elevated print:px-0"
    :class="storeMode ? 'min-h-16 py-2' : 'min-h-12 py-1.5'"
  >
    <UCheckbox
      :model-value="item.checked"
      :size="storeMode ? 'xl' : 'lg'"
      :aria-label="item.name"
      class="print:hidden"
      @update:model-value="emit('toggle', item)"
    />

    <button
      type="button"
      class="min-w-0 flex-1 text-left"
      :class="storeMode ? 'py-2' : ''"
      @click="emit('toggle', item)"
    >
      <span
        class="block truncate font-sans text-highlighted"
        :class="[storeMode ? 'text-lg' : 'text-sm', item.checked ? 'line-through text-muted' : '']"
      >
        {{ item.name }}
      </span>
      <span v-if="item.recipeId" class="flex items-center gap-1 text-xs text-dimmed print:hidden">
        <UIcon name="i-lucide-book-open" class="size-3" />
        {{ $t('shopping.item.fromRecipe') }}
      </span>
    </button>

    <!-- Quantité : affichage ou édition en place (sur mobile, l'édition passe sur sa propre ligne) -->
    <form v-if="editing" class="order-last flex basis-full items-center gap-1 sm:order-none sm:basis-auto" @submit.prevent="save">
      <UInput
        ref="amountInput"
        v-model="draftAmount"
        inputmode="decimal"
        size="sm"
        class="w-20 shrink-0"
        :aria-label="$t('shopping.addItem.quantity')"
        @keydown.esc.prevent="cancel"
      />
      <div class="min-w-0 flex-1 [contain:inline-size] sm:w-36 sm:flex-none">
        <ShoppingUnitSelect v-model="draftUnit" size="sm" class="w-full" />
      </div>
      <UButton type="submit" icon="i-lucide-check" size="sm" :loading="saving" :aria-label="$t('shopping.item.save')" />
      <UButton icon="i-lucide-x" size="sm" color="neutral" variant="ghost" :aria-label="$t('shopping.item.cancel')" @click="cancel" />
    </form>
    <button
      v-else
      type="button"
      class="shrink-0 rounded-md px-2 py-1 text-right tabular-nums text-muted hover:bg-accented hover:text-highlighted print:hidden"
      :class="storeMode ? 'text-base' : 'text-sm'"
      :aria-label="$t('shopping.item.edit')"
      @click="startEditing"
    >
      {{ quantity || '—' }}
    </button>
    <span class="hidden text-sm tabular-nums text-muted print:inline">{{ quantity }}</span>

    <UDropdownMenu :items="menuItems" :content="{ align: 'end' }">
      <UButton
        icon="i-lucide-ellipsis-vertical"
        color="neutral"
        variant="ghost"
        :size="storeMode ? 'lg' : 'sm'"
        :aria-label="$t('shopping.item.actions')"
        class="print:hidden"
      />
    </UDropdownMenu>
  </li>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { ShoppingItem, ShoppingList } from '#shared/types'

/**
 * Une ligne d'article : case à cocher, nom, quantité formatée (« 200 g »),
 * édition en place de la quantité, menu (modifier, déplacer, supprimer).
 * `storeMode` agrandit les zones tactiles pour l'usage en magasin.
 */
const props = defineProps<{
  item: ShoppingItem
  /** Quantité déjà formatée (`formatQuantity` + libellé d'unité). */
  quantity: string
  /** Autres listes vers lesquelles déplacer l'article. */
  otherLists: ShoppingList[]
  storeMode?: boolean
}>()

const emit = defineEmits<{
  toggle: [item: ShoppingItem]
  update: [item: ShoppingItem, patch: { amount: string | null, unit: string | null }, done: () => void]
  move: [item: ShoppingItem, targetListId: string]
  remove: [item: ShoppingItem]
}>()

const { t } = useI18n()

const editing = ref(false)
const saving = ref(false)
const draftAmount = ref('')
const draftUnit = ref('')
const amountInput = ref<{ inputRef?: HTMLInputElement } | null>(null)

const startEditing = async (): Promise<void> => {
  const amount = props.item.amountNum ?? props.item.amount
  draftAmount.value = amount === null || amount === undefined ? '' : String(amount)
  draftUnit.value = props.item.unitCode ?? props.item.unit ?? ''
  editing.value = true
  await nextTick()
  amountInput.value?.inputRef?.focus()
}

const cancel = () => {
  editing.value = false
}

const save = () => {
  saving.value = true
  emit('update', props.item, {
    amount: draftAmount.value.trim() || null,
    unit: draftUnit.value.trim() || null
  }, () => {
    saving.value = false
    editing.value = false
  })
}

const menuItems = computed(() => [
  [
    { label: t('shopping.item.edit'), icon: 'i-lucide-pencil', onSelect: (): void => { void startEditing() } },
    ...(props.otherLists.length > 0
      ? [{
          label: t('shopping.item.move'),
          icon: 'i-lucide-arrow-right-left',
          children: props.otherLists.map(list => ({ label: list.name, onSelect: () => emit('move', props.item, list.id) }))
        }]
      : [])
  ],
  [
    { label: t('shopping.item.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('remove', props.item) }
  ]
])
</script>
