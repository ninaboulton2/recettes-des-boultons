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

  const moveItemToAnotherList = (itemName: string, targetListId: string) => {
    if (!currentList.value) return

    const targetList = shoppingLists.value.find(list => list.id === targetListId)
    if (!targetList) return

    // Trouver tous les items avec le même nom dans la liste courante
    const itemsToMove = currentList.value.items.filter(item => 
      item.name.toLowerCase().trim() === itemName.toLowerCase().trim()
    )

    if (itemsToMove.length === 0) return

    // Ajouter les items à la liste cible
    itemsToMove.forEach(item => {
      targetList.items.push({
        ...item,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9), // Nouvel ID unique
        checked: false // Reset checked status
      })
    })

    // Supprimer les items de la liste courante
    currentList.value.items = currentList.value.items.filter(item => 
      item.name.toLowerCase().trim() !== itemName.toLowerCase().trim()
    )

    // Mettre à jour les dates
    currentList.value.updatedAt = new Date()
    targetList.updatedAt = new Date()
    
    saveToLocalStorage()
  }

  const addIngredientsToLists = (ingredients: Array<{name: string, amount: number, unit: string, recipeId?: string}>) => {
    // Créer une liste par défaut "Ma liste de courses" si aucune n'existe
    if (shoppingLists.value.length === 0) {
      createList('Ma liste de courses')
    }

    ingredients.forEach(ingredient => {
      const ingredientName = ingredient.name.toLowerCase().trim()
      let foundInAnyList = false

      // Chercher l'ingrédient dans toutes les listes
      for (const list of shoppingLists.value) {
        const existingItems = list.items.filter(item => 
          item.name.toLowerCase().trim() === ingredientName
        )

        if (existingItems.length > 0) {
          // L'ingrédient existe déjà dans cette liste, ajouter la quantité
          const totalAmount = existingItems.reduce((sum, item) => sum + (item.amount || 0), 0) + ingredient.amount
          
          // Mettre à jour tous les items avec le même nom
          list.items.forEach(item => {
            if (item.name.toLowerCase().trim() === ingredientName) {
              item.amount = totalAmount
              // Garder l'unité du premier item ou combiner si différentes
              if (item.unit !== ingredient.unit && ingredient.unit) {
                if (!item.unit) {
                  item.unit = ingredient.unit
                } else if (item.unit !== ingredient.unit) {
                  item.unit = `${item.unit} + ${ingredient.unit}`
                }
              }
            }
          })
          
          list.updatedAt = new Date()
          foundInAnyList = true
          break
        }
      }

      // Si l'ingrédient n'a été trouvé dans aucune liste, l'ajouter à "Ma liste de courses"
      if (!foundInAnyList) {
        // Trouver ou créer "Ma liste de courses"
        let defaultList = shoppingLists.value.find(list => list.name === 'Ma liste de courses')
        
        if (!defaultList) {
          // Si "Ma liste de courses" n'existe pas, la créer
          createList('Ma liste de courses')
          defaultList = currentList.value
        }

        const newItem: ShoppingItem = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name: ingredient.name,
          amount: ingredient.amount,
          unit: ingredient.unit,
          recipeId: ingredient.recipeId,
          checked: false
        }

        defaultList.items.push(newItem)
        defaultList.updatedAt = new Date()
      }
    })

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
    updateItemQuantity,
    moveItemToAnotherList,
    addIngredientsToLists
  }
}) 