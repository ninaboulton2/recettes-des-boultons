import { computed, onMounted, ref, watch } from 'vue'
import type { ShoppingItem, ShoppingList } from '#shared/types'
import { formatQuantity, groupByAisle, splitChecked, type AisleGroup } from '#shared/utils/shopping'
import { toUserMessage } from '~/composables/useApiError'
import type { NewShoppingItem, ShoppingItemPatch } from '~/stores/shopping'

const PREFS_KEY = 'shopping:prefs'

interface ShoppingPrefs {
  storeMode: boolean
  byAisle: boolean
}

function readPrefs(): ShoppingPrefs {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PREFS_KEY) : null
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (typeof parsed === 'object' && parsed !== null) {
      const prefs = parsed as Partial<ShoppingPrefs>
      return { storeMode: prefs.storeMode === true, byAisle: prefs.byAisle === true }
    }
  } catch {
    // Stockage indisponible (navigation privée, SSR) : préférences par défaut.
  }
  return { storeMode: false, byAisle: false }
}

/**
 * Listes de courses côté interface : sélection, préférences d'affichage
 * (mode magasin, regroupement par rayon), formatage « quantité + unité » et
 * actions du store converties en toasts (`useToast()` + `toUserMessage()`).
 */
export function useShoppingLists() {
  const store = useShoppingStore()
  const toast = useToast()
  const { t } = useI18n()
  const { unitLabel } = useUnits()

  const lists = computed<ShoppingList[]>(() => store.shoppingLists)
  const currentList = computed<ShoppingList | null>(() => store.currentList)
  const items = computed<ShoppingItem[]>(() => store.currentItems)

  // --- Préférences d'affichage (par navigateur), lues après l'hydratation ---
  const storeMode = ref(false)
  const byAisle = ref(false)
  onMounted(() => {
    const prefs = readPrefs()
    storeMode.value = prefs.storeMode
    byAisle.value = prefs.byAisle
    watch([storeMode, byAisle], ([mode, aisle]) => {
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ storeMode: mode, byAisle: aisle } satisfies ShoppingPrefs))
      } catch {
        // Stockage indisponible : préférence non mémorisée.
      }
    })
  })

  // --- Regroupements ---
  const groups = computed(() => splitChecked(items.value))
  const toBuyByAisle = computed<AisleGroup<ShoppingItem>[]>(() => groupByAisle(groups.value.toBuy))
  const allChecked = computed(() => items.value.length > 0 && groups.value.toBuy.length === 0)

  /** « 200 g », « 1 ½ c. à s. » … (libellé d'unité via le référentiel `units`). */
  const quantityOf = (item: ShoppingItem) => formatQuantity(item, unitLabel(item.unitCode, item.unit))

  // --- Actions avec retour utilisateur ---
  const notifyError = (error: unknown) => {
    toast.add({ title: t('shopping.toast.error'), description: toUserMessage(error), color: 'error', icon: 'i-lucide-triangle-alert' })
  }
  const notifySuccess = (title: string, description?: string) => {
    toast.add({ title, description, color: 'success', icon: 'i-lucide-check' })
  }

  /** Exécute une action du store ; renvoie son résultat ou `undefined` après un toast d'erreur. */
  const run = async <T>(action: () => Promise<T>, success?: string | ((result: T) => string)): Promise<T | undefined> => {
    try {
      const result = await action()
      if (success) notifySuccess(typeof success === 'function' ? success(result) : success)
      return result
    } catch (error) {
      notifyError(error)
      return undefined
    }
  }

  const listName = (listId: string) => lists.value.find(list => list.id === listId)?.name ?? ''

  const select = (listId: string) => store.selectList(listId)
  const createList = (name: string) => run(() => store.createList(name), t('shopping.toast.listCreated', { name }))
  const renameList = (listId: string, name: string) => run(() => store.updateListName(listId, name), t('shopping.toast.listRenamed', { name }))
  const deleteList = (listId: string) => {
    const name = listName(listId)
    return run(() => store.deleteList(listId), t('shopping.toast.listDeleted', { name }))
  }
  const clearList = (listId: string) => run(() => store.clearList(listId), count => t('shopping.toast.listCleared', { count }, count))

  const addItem = (input: NewShoppingItem) => run(() => store.addItem(input), t('shopping.toast.itemAdded', { name: input.name.trim() }))
  const updateItem = (itemId: string, patch: ShoppingItemPatch) => run(() => store.updateItem(itemId, patch))
  const removeItem = (item: ShoppingItem) => run(() => store.removeItem(item.id), t('shopping.toast.itemRemoved', { name: item.name }))
  const toggleItem = (itemId: string) => run(() => store.toggleItem(itemId))
  const moveItem = (item: ShoppingItem, targetListId: string) =>
    run(() => store.moveItem(item.id, targetListId), t('shopping.toast.itemMoved', { name: item.name, list: listName(targetListId) }))

  const checkAll = () => run(() => store.toggleAllItems(true), t('shopping.toast.checkedAll'))
  const uncheckAll = () => run(() => store.toggleAllItems(false), t('shopping.toast.uncheckedAll'))
  const clearChecked = () => run(() => store.clearChecked(), count => t('shopping.toast.clearedChecked', { count }, count))
  const resetQuantities = () => run(() => store.resetQuantities(), t('shopping.toast.quantitiesReset'))

  return {
    store,
    lists,
    currentList,
    items,
    groups,
    toBuyByAisle,
    allChecked,
    storeMode,
    byAisle,
    quantityOf,
    listName,
    select,
    createList,
    renameList,
    deleteList,
    clearList,
    addItem,
    updateItem,
    removeItem,
    toggleItem,
    moveItem,
    checkAll,
    uncheckAll,
    clearChecked,
    resetQuantities
  }
}
