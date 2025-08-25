import { defineStore } from 'pinia'
import { ref, computed, onMounted, readonly } from 'vue'
import { useAuthStore } from './auth'

interface ShoppingItem {
  id: string
  name: string
  amount?: string | number // Peut être string (depuis Supabase) ou number (depuis l'interface)
  unit?: string
  note?: string
  checked: boolean
  recipeId?: string
  listId: string
  createdAt: string
  updatedAt: string
}

interface ShoppingList {
  id: string
  name: string
  userId: string | null
  items: ShoppingItem[]
  createdAt: string
  updatedAt: string
}

interface GroupedItem extends ShoppingItem {
  originalIds: string[]
}

export const useShoppingStore = defineStore('shopping', () => {
  const shoppingLists = ref<ShoppingList[]>([])
  const currentList = ref<ShoppingList | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

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
          grouped[key].amount = parseFloat(grouped[key].amount as string) + parseFloat(item.amount as string)
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
  const createList = async (name: string) => {
    try {
      const authStore = useAuthStore()
      const userId = authStore.currentUser?.id || null
      
      if (!userId) {
        throw new Error('Vous devez être connecté pour créer des listes de courses')
      }
      
      const response = await fetch('/api/shopping-lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, userId })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        const newList: ShoppingList = {
          id: data.list.id,
          name: data.list.name,
          userId: data.list.userId,
          items: [],
          createdAt: data.list.createdAt,
          updatedAt: data.list.updatedAt
        }
        
        shoppingLists.value.push(newList)
        currentList.value = newList
        return { success: true, list: newList }
      } else {
        throw new Error(data.message || 'Erreur lors de la création de la liste')
      }
    } catch (error) {
      console.error('Erreur création liste:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: errorMessage }
    }
  }

  const addItem = async (item: Omit<ShoppingItem, 'id' | 'checked' | 'createdAt' | 'updatedAt'>) => {
    if (!currentList.value) return { success: false, error: 'Aucune liste sélectionnée' }

    try {
      const authStore = useAuthStore()
      const userId = authStore.currentUser?.id || null
      
      if (!userId) {
        throw new Error('Vous devez être connecté pour gérer vos listes de courses')
      }
      
      const response = await fetch('/api/shopping-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          listId: currentList.value.id,
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          recipeId: item.recipeId,
          userId
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        const newItem: ShoppingItem = {
          ...data.item,
          note: item.note
        }

        currentList.value.items.push(newItem)
        currentList.value.updatedAt = newItem.updatedAt
        return { success: true, item: newItem }
      } else {
        throw new Error(data.message || 'Erreur lors de l\'ajout de l\'article')
      }
    } catch (error) {
      console.error('Erreur ajout article:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
      return { success: false, error: errorMessage }
    }
  }

  const toggleItem = async (itemId: string) => {
    if (!currentList.value) return

    try {
      // Trouver l'item à basculer
      const item = currentList.value.items.find(item => item.id === itemId)
      if (!item) return

      // Appeler l'API pour mettre à jour l'état checked
      const response = await fetch(`/api/shopping-items/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isChecked: !item.checked
        })
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Mettre à jour l'item localement
        item.checked = !item.checked
        item.updatedAt = data.item.updatedAt
        currentList.value.updatedAt = new Date().toISOString()
      }
    } catch (error) {
      console.error('Erreur toggle article:', error)
    }
  }

  const removeItem = async (itemId: string) => {
    if (!currentList.value) return

    try {
      // Appeler l'API pour supprimer l'item
      const response = await fetch(`/api/shopping-items/${itemId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Supprimer l'item de la liste locale
        currentList.value.items = currentList.value.items.filter(item => item.id !== itemId)
        currentList.value.updatedAt = new Date().toISOString()
      }
    } catch (error) {
      console.error('Erreur suppression article:', error)
    }
  }

  const clearChecked = async () => {
    if (!currentList.value) return

    try {
      // Supprimer tous les items cochés via l'API
      const checkedItems = currentList.value.items.filter(item => item.checked)
      
      for (const item of checkedItems) {
        await removeItem(item.id)
      }
    } catch (error) {
      console.error('Erreur suppression articles cochés:', error)
    }
  }

  const selectList = (listId: string) => {
    currentList.value = shoppingLists.value.find(list => list.id === listId) || null
  }

  const deleteList = async (listId: string) => {
    try {
      // Appeler l'API pour supprimer la liste
      const response = await fetch(`/api/shopping-lists/${listId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Supprimer la liste localement
        shoppingLists.value = shoppingLists.value.filter(list => list.id !== listId)
        if (currentList.value?.id === listId) {
          currentList.value = shoppingLists.value[0] || null
        }
      }
    } catch (error) {
      console.error('Erreur suppression liste:', error)
    }
  }

  const updateListName = async (listId: string, newName: string) => {
    try {
      // Appeler l'API pour mettre à jour le nom de la liste
      const response = await fetch(`/api/shopping-lists/${listId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newName })
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Mettre à jour le nom localement
        const list = shoppingLists.value.find(list => list.id === listId)
        if (list) {
          list.name = newName
          list.updatedAt = data.list.updatedAt
          // Si c'est la liste courante, mettre à jour aussi
          if (currentList.value?.id === listId) {
            currentList.value.name = newName
            currentList.value.updatedAt = data.list.updatedAt
          }
        }
      }
    } catch (error) {
      console.error('Erreur mise à jour nom liste:', error)
    }
  }

  const updateItemQuantity = async (itemId: string, newAmount: number, newUnit: string) => {
    if (!currentList.value) return

    try {
      // Appeler l'API pour mettre à jour l'item
      const response = await fetch(`/api/shopping-items/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: newAmount,
          unit: newUnit
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        // Mettre à jour l'item localement
        const item = currentList.value.items.find(item => item.id === itemId)
        if (item) {
          item.amount = newAmount
          item.unit = newUnit
          item.updatedAt = data.item.updatedAt
          currentList.value.updatedAt = new Date().toISOString()
        }
      }
    } catch (error) {
      console.error('Erreur mise à jour quantité article:', error)
    }
  }

  const moveItemToAnotherList = async (itemName: string, targetListId: string, sourceListId?: string) => {
    if (!currentList.value) return

    const authStore = useAuthStore()
    const userId = authStore.currentUser?.id || null
    
    if (!userId) {
      throw new Error('Vous devez être connecté pour déplacer des articles')
    }

    const targetList = shoppingLists.value.find(list => list.id === targetListId)
    if (!targetList) return

    // Si sourceListId n'est pas fourni, utiliser la liste courante
    const sourceList = sourceListId 
      ? shoppingLists.value.find(list => list.id === sourceListId)
      : currentList.value

    if (!sourceList) return

    // Trouver tous les items avec le même nom dans la liste source
    const itemsToMove = sourceList.items.filter(item => 
      item.name.toLowerCase().trim() === itemName.toLowerCase().trim()
    )

    if (itemsToMove.length === 0) return

    try {
      // Ajouter les items à la liste cible via l'API
      for (const item of itemsToMove) {
        const response = await fetch('/api/shopping-items', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            listId: targetListId,
            name: item.name,
            amount: item.amount,
            unit: item.unit,
            recipeId: item.recipeId || null, // Gérer les items sans recipeId
            userId: userId
          })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || `Erreur lors de l'ajout à la liste cible: ${response.status}`)
        }
      }

      // Supprimer les items de la liste source via l'API
      for (const item of itemsToMove) {
        const response = await fetch(`/api/shopping-items/${item.id}`, {
          method: 'DELETE'
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || `Erreur lors de la suppression de la liste source: ${response.status}`)
        }
      }

      // Mettre à jour l'état local après confirmation des APIs
      sourceList.items = sourceList.items.filter(item => 
        item.name.toLowerCase().trim() !== itemName.toLowerCase().trim()
      )

      // Mettre à jour les dates
      sourceList.updatedAt = new Date().toISOString()
      targetList.updatedAt = new Date().toISOString()

      // Recharger les listes pour avoir l'état le plus récent
      await loadShoppingLists()

    } catch (error) {
      console.error('Erreur déplacement article:', error)
      // En cas d'erreur, recharger les listes pour restaurer l'état
      await loadShoppingLists()
    }
  }

  const addIngredientsToLists = async (ingredients: Array<{name: string, amount: number, unit: string, recipeId?: string}>) => {
    const authStore = useAuthStore()
    const userId = authStore.currentUser?.id || null
    
    if (!userId) {
      throw new Error('Vous devez être connecté pour gérer vos listes de courses')
    }
    
    // Créer une liste par défaut "Ma liste de courses" si aucune n'existe
    if (shoppingLists.value.length === 0) {
      const result = await createList('Ma liste de courses')
      if (!result.success) {
        return result
      }
    }

    for (const ingredient of ingredients) {
      const ingredientName = ingredient.name.toLowerCase().trim()
      let foundInAnyList = false

      // Chercher l'ingrédient dans toutes les listes
      for (const list of shoppingLists.value) {
        const existingItems = list.items.filter(item => 
          item.name.toLowerCase().trim() === ingredientName
        )

        if (existingItems.length > 0) {
          // L'ingrédient existe déjà dans cette liste, mettre à jour la quantité
          // Convertir explicitement en nombres pour éviter la concaténation de chaînes
          const totalAmount = existingItems.reduce((sum, item) => {
            const itemAmount = parseFloat(item.amount as string) || 0
            return sum + itemAmount
          }, 0) + ingredient.amount
                    
          // Mettre à jour le premier item existant avec la nouvelle quantité totale
          const firstExistingItem = existingItems[0]
          
          try {
            const response = await fetch(`/api/shopping-items/${firstExistingItem.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                amount: totalAmount,
                unit: ingredient.unit || firstExistingItem.unit
              })
            })
            
            if (!response.ok) {
              throw new Error(`Erreur lors de la mise à jour: ${response.status}`)
            }
            
            // Mettre à jour l'état local
            firstExistingItem.amount = totalAmount
            if (ingredient.unit && ingredient.unit !== firstExistingItem.unit) {
              firstExistingItem.unit = ingredient.unit
            }
            
            // Supprimer les autres items avec le même nom (ils sont maintenant consolidés)
            for (let i = 1; i < existingItems.length; i++) {
              const itemToDelete = existingItems[i]
              const deleteResponse = await fetch(`/api/shopping-items/${itemToDelete.id}`, {
                method: 'DELETE'
              })
              
              if (!deleteResponse.ok) {
                console.warn(`⚠️ Erreur lors de la suppression de l'item ${itemToDelete.id}`)
              }
            }
            
            // Mettre à jour la date de la liste
            list.updatedAt = new Date().toISOString()
            foundInAnyList = true
            break
            
          } catch (error) {
            console.error('Erreur lors de la mise à jour de la quantité:', error)
            // En cas d'erreur, continuer avec l'ajout d'un nouvel item
          }
        }
      }

      // Si l'ingrédient n'a été trouvé dans aucune liste, l'ajouter à "Ma liste de courses"
      if (!foundInAnyList) {
        // Trouver ou créer "Ma liste de courses"
        let defaultList = shoppingLists.value.find(list => list.name === 'Ma liste de courses')
        
        if (!defaultList) {
          // Si "Ma liste de courses" n'existe pas, la créer
          const result = await createList('Ma liste de courses')
          if (result.success) {
            defaultList = result.list
          } else {
            continue // Passer à l'ingrédient suivant si erreur
          }
        }

        await addItem({
          name: ingredient.name,
          amount: ingredient.amount,
          unit: ingredient.unit,
          recipeId: ingredient.recipeId,
          listId: defaultList.id
        })
      }
    }

    // Recharger les listes pour avoir l'état le plus récent
    await loadShoppingLists()

    return { success: true }
  }

  // Charger les listes depuis Supabase
  const loadShoppingLists = async () => {
    isLoading.value = true
    error.value = null
    
    try {
      const authStore = useAuthStore()
      const userId = authStore.currentUser?.id || null
      
      // Si pas d'utilisateur connecté, vider les listes
      if (!userId) {
        shoppingLists.value = []
        currentList.value = null
        return
      }
      
      const response = await fetch(`/api/shopping-lists?userId=${userId}`)
      
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        shoppingLists.value = data.lists
        // Sélectionner la première liste par défaut
        if (shoppingLists.value.length > 0 && !currentList.value) {
          currentList.value = shoppingLists.value[0]
        }
      } else {
        throw new Error('Erreur lors du chargement des listes')
      }
    } catch (error) {
      console.error('Erreur chargement listes:', error)
      error.value = error instanceof Error ? error.message : 'Erreur inconnue'
    } finally {
      isLoading.value = false
    }
  }

  // Méthode pour recharger les listes quand l'utilisateur change
  const refreshShoppingLists = async () => {
    await loadShoppingLists()
  }

  // Initialize
  onMounted(() => {
    loadShoppingLists()
  })

  return {
    // State
    shoppingLists: readonly(shoppingLists),
    currentList: readonly(currentList),
    isLoading: readonly(isLoading),
    error: readonly(error),
    
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
    addIngredientsToLists,
    loadShoppingLists,
    refreshShoppingLists
  }
}) 