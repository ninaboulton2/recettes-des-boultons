import { defineStore } from 'pinia'

export const useShoppingStore = defineStore('shopping', () => {
  const shoppingLists = ref([])
  const currentList = ref(null)

  // Computed properties
  const currentItems = computed(() => {
    return currentList.value?.items || []
  })

  const checkedItems = computed(() => {
    return currentItems.value.filter(item => item.checked)
  })

  const uncheckedItems = computed(() => {
    return currentItems.value.filter(item => !item.checked)
  })

  // Actions
  const createList = (name) => {
    const newList = {
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

  const addItem = (item) => {
    if (!currentList.value) return

    const newItem = {
      ...item,
      id: Date.now().toString(),
      checked: false
    }

    currentList.value.items.push(newItem)
    currentList.value.updatedAt = new Date()
    saveToLocalStorage()
  }

  const toggleItem = (itemId) => {
    if (!currentList.value) return

    const item = currentList.value.items.find(i => i.id === itemId)
    if (item) {
      item.checked = !item.checked
      currentList.value.updatedAt = new Date()
      saveToLocalStorage()
    }
  }

  const removeItem = (itemId) => {
    if (!currentList.value) return

    currentList.value.items = currentList.value.items.filter(item => item.id !== itemId)
    currentList.value.updatedAt = new Date()
    saveToLocalStorage()
  }

  const clearChecked = () => {
    if (!currentList.value) return

    currentList.value.items = currentList.value.items.filter(item => !item.checked)
    currentList.value.updatedAt = new Date()
    saveToLocalStorage()
  }

  const selectList = (listId) => {
    currentList.value = shoppingLists.value.find(list => list.id === listId) || null
  }

  const deleteList = (listId) => {
    shoppingLists.value = shoppingLists.value.filter(list => list.id !== listId)
    if (currentList.value?.id === listId) {
      currentList.value = shoppingLists.value[0] || null
    }
    saveToLocalStorage()
  }

  // Local storage
  const saveToLocalStorage = () => {
    if (process.client) {
      localStorage.setItem('boultons-shopping-lists', JSON.stringify(shoppingLists.value))
      localStorage.setItem('boultons-current-list', JSON.stringify(currentList.value))
    }
  }

  const loadFromLocalStorage = () => {
    if (process.client) {
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
    checkedItems,
    uncheckedItems,
    
    // Actions
    createList,
    addItem,
    toggleItem,
    removeItem,
    clearChecked,
    selectList,
    deleteList
  }
}) 