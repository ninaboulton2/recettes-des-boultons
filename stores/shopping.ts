import { defineStore } from 'pinia'
import { ref, computed, onMounted, readonly } from 'vue'

interface ShoppingItem {
  id: string
  name: string
  amount?: number
  unit?: string
  note?: string
  checked: boolean
  recipeId?: string
}

interface ShoppingList {
  id: string
  name: string
  items: ShoppingItem[]
  createdAt: Date
  updatedAt: Date
}

interface GroupedItem extends ShoppingItem {
  originalIds: string[]
}

export const useShoppingStore = defineStore('shopping', () => {
  const shoppingLists = ref<ShoppingList[]>([])
  const currentList = ref<ShoppingList | null>(null)

  // Computed properties
  const currentItems = computed(() => {
    return currentList.value?.items || []
  })

  const currentItemsGrouped = computed<GroupedItem[]>(() => {
    if (!currentList.value?.items) return []
    
    const grouped: Record<string, GroupedItem> = {}
    
    currentList.value.items.forEach(item => {
      const key = item.name.toLowerCase().trim()
      
      if (!grouped[key]) {
        grouped[key] = {
          ...item,
          originalIds: [item.id]
        }
      } else {
        // Additionner les quantités si elles existent
        if (grouped[key].amount && item.amount) {
          grouped[key].amount += item.amount
        }
        // Garder l'unité du premier item ou combiner si différentes
        if (grouped[key].unit !== item.unit && item.unit) {
          if (!grouped[key].unit) {
            grouped[key].unit = item.unit
          } else if (grouped[key].unit !== item.unit) {
            // Si les unités sont différentes, garder la première et ajouter un commentaire
            grouped[key].unit = `${grouped[key].unit} + ${item.unit}`
          }
        }
        // Combiner les notes si elles existent
        if (item.note && grouped[key].note) {
          if (grouped[key].note !== item.note) {
            grouped[key].note = `${grouped[key].note} | ${item.note}`
          }
        } else if (item.note && !grouped[key].note) {
          grouped[key].note = item.note
        }
        // Si l'un des items est coché, le groupe est considéré comme coché
        if (item.checked) {
          grouped[key].checked = true
        }
        grouped[key].originalIds.push(item.id)
      }
    })
    
    return Object.values(grouped)
  })

  const checkedItems = computed(() => {
    return currentItemsGrouped.value.filter(item => item.checked)
  })

  const uncheckedItems = computed(() => {
    return currentItemsGrouped.value.filter(item => !item.checked)
  })

  // Actions
  const createList = (name: string) => {
    const newList: ShoppingList = {
      id: Date.now().toString(),
      name,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    shoppingLists.value.push(newList)
    currentList.value = newList
    saveToLocalStorage()
  }

  const addItem = (item: Omit<ShoppingItem, 'id' | 'checked'>) => {
    if (!currentList.value) return

    const newItem: ShoppingItem = {
      ...item,
      id: Date.now().toString(),
      checked: false
    }

    currentList.value.items.push(newItem)
    currentList.value.updatedAt = new Date()
    saveToLocalStorage()
  }

  const toggleItem = (itemId: string) => {
    if (!currentList.value) return

    // Trouver l'item groupé
    const groupedItem = currentItemsGrouped.value.find(item => 
      item.originalIds.includes(itemId)
    )
    
    if (groupedItem) {
      // Toggle tous les items originaux avec le même nom
      const itemName = groupedItem.name.toLowerCase().trim()
      currentList.value.items.forEach(item => {
        if (item.name.toLowerCase().trim() === itemName) {
          item.checked = !groupedItem.checked
        }
      })
      currentList.value.updatedAt = new Date()
      saveToLocalStorage()
    }
  }

  const removeItem = (itemId: string) => {
    if (!currentList.value) return

    // Trouver l'item groupé
    const groupedItem = currentItemsGrouped.value.find(item => 
      item.originalIds.includes(itemId)
    )
    
    if (groupedItem) {
      // Supprimer tous les items avec le même nom
      const itemName = groupedItem.name.toLowerCase().trim()
      currentList.value.items = currentList.value.items.filter(item => 
        item.name.toLowerCase().trim() !== itemName
      )
      currentList.value.updatedAt = new Date()
      saveToLocalStorage()
    }
  }

  const clearChecked = () => {
    if (!currentList.value) return

    currentList.value.items = currentList.value.items.filter(item => !item.checked)
    currentList.value.updatedAt = new Date()
    saveToLocalStorage()
  }

  const selectList = (listId: string) => {
    currentList.value = shoppingLists.value.find(list => list.id === listId) || null
  }

  const deleteList = (listId: string) => {
    shoppingLists.value = shoppingLists.value.filter(list => list.id !== listId)
    if (currentList.value?.id === listId) {
      currentList.value = shoppingLists.value[0] || null
    }
    saveToLocalStorage()
  }

  const updateListName = (listId: string, newName: string) => {
    const list = shoppingLists.value.find(list => list.id === listId)
    if (list) {
      list.name = newName
      list.updatedAt = new Date()
      // Si c'est la liste courante, mettre à jour aussi
      if (currentList.value?.id === listId) {
        currentList.value.name = newName
        currentList.value.updatedAt = new Date()
      }
      saveToLocalStorage()
    }
  }

  const updateItemQuantity = (itemName: string, newAmount: number, newUnit: string, newNote?: string) => {
    if (!currentList.value) return

    // Mettre à jour tous les items avec le même nom
    currentList.value.items.forEach(item => {
      if (item.name.toLowerCase().trim() === itemName.toLowerCase().trim()) {
        item.amount = newAmount
        item.unit = newUnit
        if (newNote !== undefined) {
          item.note = newNote
        }
      }
    })
    
    currentList.value.updatedAt = new Date()
    saveToLocalStorage()
  }

  // Local storage
  const saveToLocalStorage = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('boultons-shopping-lists', JSON.stringify(shoppingLists.value))
      localStorage.setItem('boultons-current-list', JSON.stringify(currentList.value))
    }
  }

  const loadFromLocalStorage = () => {
    if (typeof window !== 'undefined') {
      const savedLists = localStorage.getItem('boultons-shopping-lists')
      const savedCurrent = localStorage.getItem('boultons-current-list')
      
      if (savedLists) {
        shoppingLists.value = JSON.parse(savedLists)
      }
      
      if (savedCurrent) {
        currentList.value = JSON.parse(savedCurrent)
      }
    }
  }

  // Initialize
  onMounted(() => {
    loadFromLocalStorage()
  })

  return {
    // State
    shoppingLists: readonly(shoppingLists),
    currentList: readonly(currentList),
    
    // Computed
    currentItems,
    currentItemsGrouped,
    checkedItems,
    uncheckedItems,
    
    // Actions
    createList,
    addItem,
    toggleItem,
    removeItem,
    clearChecked,
    selectList,
    deleteList,
    updateListName,
    updateItemQuantity
  }
}) 