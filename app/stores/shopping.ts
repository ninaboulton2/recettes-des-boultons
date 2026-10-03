import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiFetch } from '~/composables/useApi'
import { apiErrorFromResponse, toUserMessage, translateKey } from '~/composables/useApiError'
import type { ShoppingItem, ShoppingList } from '#shared/types'
import type { Database } from '#shared/types/database'
import { useAuthStore } from './auth'

export type { ShoppingItem, ShoppingList }

/** Champs saisis pour un nouvel article (la liste cible est optionnelle : liste courante par défaut). */
export interface NewShoppingItem {
  name: string
  amount?: string | number | null
  unit?: string | null
  recipeId?: string | null
  listId?: string
}

/** Modifications acceptées par `PUT /api/shopping-items/:id`. */
export interface ShoppingItemPatch {
  name?: string
  amount?: string | number | null
  unit?: string | null
  isChecked?: boolean
}

/** Appel d'écriture vers `/api/*` : renvoie le JSON ou lève une `ApiError`. */
async function request<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  if (!response.ok) throw await apiErrorFromResponse(response)
  return response.json() as Promise<T>
}

/**
 * Listes de courses de l'utilisateur connecté.
 *
 * Lecture directe sous RLS (`shopping_lists` avec `shopping_items(*)`), rendue
 * côté serveur par la page `courses` via `useAsyncData` ; `refresh()` recharge
 * après chaque écriture. La fusion des doublons (même nom + même unité →
 * quantités additionnées) est faite EN BASE par `merge_shopping_item` /
 * `add_recipe_to_list` : aucune consolidation côté client.
 *
 * Les actions d'écriture LÈVENT (`ApiError`) : `useShoppingLists()` les
 * convertit en toasts avec `toUserMessage()`.
 */
export const useShoppingStore = defineStore('shopping', () => {
  const supabase = useSupabaseClient<Database>()

  const shoppingLists = ref<ShoppingList[]>([])
  const currentListId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  /** Utilisateur pour lequel `shoppingLists` a été chargé (`null` : personne). */
  const loadedForUserId = ref<string | null>(null)

  const currentList = computed<ShoppingList | null>(() =>
    shoppingLists.value.find(list => list.id === currentListId.value) ?? shoppingLists.value[0] ?? null
  )
  const currentItems = computed<ShoppingItem[]>(() => currentList.value?.items ?? [])
  const checkedItems = computed(() => currentItems.value.filter(item => item.checked))
  const uncheckedItems = computed(() => currentItems.value.filter(item => !item.checked))

  // --- Lecture ---

  /** Charge les listes depuis Supabase (lecture directe sous RLS). Lève en cas d'erreur. */
  const loadShoppingLists = async (): Promise<ShoppingList[]> => {
    isLoading.value = true
    error.value = null

    try {
      const userId = useAuthStore().currentUser?.id ?? null
      if (!userId) {
        shoppingLists.value = []
        currentListId.value = null
        loadedForUserId.value = null
        return []
      }

      const { data, error: loadError } = await supabase
        .from('shopping_lists')
        .select('*, items:shopping_items(*)')
        .order('created_at', { ascending: false })
        .order('created_at', { referencedTable: 'shopping_items', ascending: true })
      if (loadError) throw loadError

      shoppingLists.value = data.map(list => ({
        id: list.id,
        name: list.name,
        userId: list.user_id ?? userId,
        createdAt: list.created_at,
        updatedAt: list.updated_at,
        items: list.items.map(item => ({
          id: item.id,
          listId: item.list_id,
          name: item.name,
          amount: item.amount,
          amountNum: item.amount_num,
          unit: item.unit,
          unitCode: item.unit_code,
          checked: item.is_checked ?? false,
          recipeId: item.recipe_id,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        }))
      }))
      loadedForUserId.value = userId
      if (!shoppingLists.value.some(list => list.id === currentListId.value)) {
        currentListId.value = shoppingLists.value[0]?.id ?? null
      }
      return shoppingLists.value
    } catch (err) {
      error.value = toUserMessage(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /** Recharge les listes (après une écriture). Lève en cas d'erreur. */
  const refresh = () => loadShoppingLists()

  /** Charge les listes une seule fois par utilisateur. */
  const ensureLoaded = async (): Promise<void> => {
    const userId = useAuthStore().currentUser?.id ?? null
    if (isLoading.value || loadedForUserId.value === userId) return
    try {
      await loadShoppingLists()
    } catch {
      // Erreur déjà consignée dans `error`
    }
  }

  /** Recharge sans lever (changement d'utilisateur depuis le layout, par exemple). */
  const refreshShoppingLists = async (): Promise<void> => {
    try {
      await loadShoppingLists()
    } catch {
      // Erreur déjà consignée dans `error`
    }
  }

  const selectList = (listId: string) => {
    currentListId.value = listId
  }

  // --- Listes ---

  const createList = async (name: string): Promise<ShoppingList> => {
    const data = await request<{ list: { id: string } }>('/api/shopping-lists', {
      method: 'POST',
      body: JSON.stringify({ name })
    })
    await refresh()
    currentListId.value = data.list.id
    return shoppingLists.value.find(list => list.id === data.list.id) ?? currentList.value as ShoppingList
  }

  const updateListName = async (listId: string, name: string): Promise<void> => {
    await request(`/api/shopping-lists/${listId}`, { method: 'PUT', body: JSON.stringify({ name }) })
    await refresh()
  }

  const deleteList = async (listId: string): Promise<void> => {
    await request(`/api/shopping-lists/${listId}`, { method: 'DELETE' })
    if (currentListId.value === listId) currentListId.value = null
    await refresh()
  }

  // --- Articles ---

  /** Ajoute un article (fusion en base si même nom + même unité). Renvoie la ligne créée ou fusionnée. */
  const addItem = async (input: NewShoppingItem): Promise<ShoppingItem | null> => {
    const listId = input.listId ?? currentList.value?.id
    if (!listId) throw new Error(translateKey('errors.noListSelected', 'Aucune liste sélectionnée'))

    const data = await request<{ item: { id: string } }>('/api/shopping-items', {
      method: 'POST',
      body: JSON.stringify({
        listId,
        name: input.name.trim(),
        amount: input.amount ?? null,
        unit: input.unit?.trim() || null,
        recipeId: input.recipeId ?? null
      })
    })
    await refresh()
    return shoppingLists.value.find(list => list.id === listId)?.items.find(item => item.id === data.item.id) ?? null
  }

  const updateItem = async (itemId: string, patch: ShoppingItemPatch): Promise<void> => {
    await request(`/api/shopping-items/${itemId}`, { method: 'PUT', body: JSON.stringify(patch) })
    await refresh()
  }

  const removeItem = async (itemId: string): Promise<void> => {
    await request(`/api/shopping-items/${itemId}`, { method: 'DELETE' })
    await refresh()
  }

  /** Coche / décoche un article : bascule locale immédiate, annulée si le serveur refuse. */
  const toggleItem = async (itemId: string): Promise<void> => {
    const item = shoppingLists.value.flatMap(list => list.items).find(candidate => candidate.id === itemId)
    if (!item) return
    const previous = item.checked
    item.checked = !previous
    try {
      await request(`/api/shopping-items/${itemId}`, { method: 'PUT', body: JSON.stringify({ isChecked: !previous }) })
    } catch (err) {
      item.checked = previous
      throw err
    }
  }

  /** Coche (ou décoche) tous les articles de la liste courante. */
  const toggleAllItems = async (checked: boolean): Promise<void> => {
    const targets = currentItems.value.filter(item => item.checked !== checked)
    await Promise.all(targets.map(item =>
      request(`/api/shopping-items/${item.id}`, { method: 'PUT', body: JSON.stringify({ isChecked: checked }) })
    ))
    await refresh()
  }

  /** Supprime les articles cochés de la liste courante. */
  const clearChecked = async (): Promise<number> => {
    const targets = checkedItems.value
    await Promise.all(targets.map(item => request(`/api/shopping-items/${item.id}`, { method: 'DELETE' })))
    await refresh()
    return targets.length
  }

  /** Vide une liste (tous ses articles). */
  const clearList = async (listId: string): Promise<number> => {
    const targets = shoppingLists.value.find(list => list.id === listId)?.items ?? []
    await Promise.all(targets.map(item => request(`/api/shopping-items/${item.id}`, { method: 'DELETE' })))
    await refresh()
    return targets.length
  }

  /** Efface quantité et unité de tous les articles de la liste courante. */
  const resetQuantities = async (): Promise<number> => {
    const targets = currentItems.value
    await Promise.all(targets.map(item =>
      request(`/api/shopping-items/${item.id}`, { method: 'PUT', body: JSON.stringify({ amount: null, unit: null }) })
    ))
    await refresh()
    return targets.length
  }

  /** Déplace un article vers une autre liste (ajout avec fusion dans la cible, puis suppression). */
  const moveItem = async (itemId: string, targetListId: string): Promise<void> => {
    const item = shoppingLists.value.flatMap(list => list.items).find(candidate => candidate.id === itemId)
    if (!item || item.listId === targetListId) return

    await request('/api/shopping-items', {
      method: 'POST',
      body: JSON.stringify({
        listId: targetListId,
        name: item.name,
        amount: item.amountNum ?? item.amount ?? null,
        unit: item.unitCode ?? item.unit ?? null,
        recipeId: item.recipeId
      })
    })
    await request(`/api/shopping-items/${itemId}`, { method: 'DELETE' })
    await refresh()
  }

  // --- Recettes ---

  /**
   * Ajoute les ingrédients d'une recette à une liste en un seul appel
   * (`POST /api/shopping-lists/:id/recipes` → RPC `add_recipe_to_list`) :
   * fusion des doublons en base, quantités × `servingsFactor` (ex. 6 / recipe.servings),
   * `sectionIds` pour limiter l'ajout à certaines sections. Renvoie le nombre d'articles touchés.
   */
  const addRecipeToList = async (listId: string, recipeId: string, sectionIds?: string[], servingsFactor?: number): Promise<number> => {
    const data = await request<{ items: unknown[] }>(`/api/shopping-lists/${listId}/recipes`, {
      method: 'POST',
      body: JSON.stringify({
        recipeId,
        ...(sectionIds && sectionIds.length > 0 ? { sectionIds } : {}),
        ...(servingsFactor !== undefined ? { servingsFactor } : {})
      })
    })
    await refresh()
    return data.items.length
  }

  return {
    // State
    shoppingLists,
    currentListId,
    isLoading,
    error,

    // Computed
    currentList,
    currentItems,
    checkedItems,
    uncheckedItems,

    // Lecture
    loadShoppingLists,
    refresh,
    ensureLoaded,
    refreshShoppingLists,
    selectList,

    // Listes
    createList,
    updateListName,
    deleteList,
    clearList,

    // Articles
    addItem,
    updateItem,
    removeItem,
    toggleItem,
    toggleAllItems,
    clearChecked,
    resetQuantities,
    moveItem,

    // Recettes
    addRecipeToList
  }
})
