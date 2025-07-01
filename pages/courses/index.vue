<template>
  <div>
    <!-- Header -->
    <div class="mb-8">
      <div class="flex justify-between items-center mb-4">
        <h1 class="text-4xl font-lobster text-gray-900">
          Listes de courses
        </h1>
        <button 
          v-if="currentList"
          @click="printShoppingList" 
          class="flex items-center text-primary-600 hover:text-primary-800 font-medium transition-colors"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
          </svg>
          Imprimer
        </button>
      </div>
      <p class="text-xl text-gray-600">
        Gérez vos listes de courses et ne manquez plus rien !
      </p>
    </div>

    <!-- Lists Selection -->
    <div v-if="shoppingLists.length > 0" class="mb-8">
      <div class="bg-white rounded-xl shadow-sm p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">
          Sélectionner une liste
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            v-for="list in shoppingLists"
            :key="list.id"
            @click="selectList(list.id)"
            class="p-4 border-2 rounded-lg text-left transition-all duration-200"
            :class="currentList?.id === list.id 
              ? 'border-primary-500 bg-primary-50' 
              : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'"
          >
            <div class="flex justify-between items-start">
              <div>
                <h3 class="font-semibold text-gray-900">{{ list.name }}</h3>
                <p class="text-sm text-gray-500">
                  {{ list.items.length }} article{{ list.items.length > 1 ? 's' : '' }}
                </p>
                <p class="text-xs text-gray-400">
                  Créée le {{ formatDate(list.createdAt) }}
                </p>
              </div>
              <button
                @click.stop="deleteList(list.id)"
                class="text-red-500 hover:text-red-700 transition-colors duration-200"
                title="Supprimer la liste"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Create New List -->
    <div class="bg-white rounded-xl shadow-sm p-6 mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-4">
        Créer une nouvelle liste
      </h2>
      <div class="flex gap-4">
        <input
          v-model="newListName"
          type="text"
          placeholder="Nom de la liste"
          class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          @keyup.enter="createNewList"
        >
        <button
          @click="createNewList"
          class="btn-primary"
          :disabled="!newListName.trim()"
        >
          Créer
        </button>
      </div>
    </div>

    <!-- Current List -->
    <div v-if="currentList" class="bg-white rounded-xl shadow-sm p-6">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-xl font-semibold text-gray-900">
          {{ currentList.name }}
        </h2>
        <div class="flex gap-2">
          <button
            @click="clearChecked"
            class="text-gray-600 hover:text-gray-800 transition-colors duration-200"
            :disabled="checkedItems.length === 0"
          >
            Effacer cochés
          </button>
        </div>
      </div>

      <!-- Add Item -->
      <div class="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 class="font-semibold text-gray-900 mb-3">Ajouter un article</h3>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            v-model="newItem.name"
            type="text"
            placeholder="Nom de l'article"
            class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
          <input
            v-model.number="newItem.amount"
            type="number"
            placeholder="Quantité"
            class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
          <input
            v-model="newItem.unit"
            type="text"
            placeholder="Unité"
            class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
          <button
            @click="addItem"
            class="btn-primary"
            :disabled="!newItem.name.trim()"
          >
            Ajouter
          </button>
        </div>
      </div>

      <!-- Items List -->
      <div class="space-y-2">
        <div
          v-for="item in currentItems"
          :key="item.id"
          class="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-200"
        >
          <input
            :id="item.id"
            type="checkbox"
            :checked="item.checked"
            @change="toggleItem(item.id)"
            class="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
          >
          <label
            :for="item.id"
            class="flex-1 cursor-pointer"
            :class="{ 'line-through text-gray-500': item.checked }"
          >
            <span class="font-medium">{{ item.name }}</span>
            <span v-if="item.amount && item.unit" class="text-gray-500 ml-2">
              {{ item.amount }} {{ item.unit }}
            </span>
          </label>
          <button
            @click="removeItem(item.id)"
            class="text-red-500 hover:text-red-700 transition-colors duration-200"
            title="Supprimer"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- Summary -->
      <div class="mt-6 pt-4 border-t border-gray-200">
        <div class="flex justify-between text-sm text-gray-600">
          <span>{{ uncheckedItems.length }} article{{ uncheckedItems.length > 1 ? 's' : '' }} à acheter</span>
          <span>{{ checkedItems.length }} article{{ checkedItems.length > 1 ? 's' : '' }} acheté{{ checkedItems.length > 1 ? 's' : '' }}</span>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="text-center py-12">
      <div class="max-w-md mx-auto">
        <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
        </svg>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">
          Aucune liste de courses
        </h3>
        <p class="text-gray-600 mb-4">
          Créez votre première liste de courses pour commencer à organiser vos achats.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
const shoppingStore = useShoppingStore()

// Reactive data
const newListName = ref('')
const newItem = ref({
  name: '',
  amount: 1,
  unit: ''
})

// Computed properties
const shoppingLists = computed(() => shoppingStore.shoppingLists)
const currentList = computed(() => shoppingStore.currentList)
const currentItems = computed(() => shoppingStore.currentItems)
const checkedItems = computed(() => shoppingStore.checkedItems)
const uncheckedItems = computed(() => shoppingStore.uncheckedItems)

// Methods
const createNewList = () => {
  if (newListName.value.trim()) {
    shoppingStore.createList(newListName.value.trim())
    newListName.value = ''
  }
}

const selectList = (listId) => {
  shoppingStore.selectList(listId)
}

const deleteList = (listId) => {
  if (confirm('Êtes-vous sûr de vouloir supprimer cette liste ?')) {
    shoppingStore.deleteList(listId)
  }
}

const addItem = () => {
  if (newItem.value.name.trim()) {
    shoppingStore.addItem({
      name: newItem.value.name.trim(),
      amount: newItem.value.amount || 1,
      unit: newItem.value.unit.trim()
    })
    newItem.value = { name: '', amount: 1, unit: '' }
  }
}

const toggleItem = (itemId) => {
  shoppingStore.toggleItem(itemId)
}

const removeItem = (itemId) => {
  shoppingStore.removeItem(itemId)
}

const clearChecked = () => {
  shoppingStore.clearChecked()
}

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

const printShoppingList = () => {
  if (!currentList.value) return
  
  const printWindow = window.open('', '_blank')
  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${currentList.value.name} - Recettes des Boultons</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 30px; 
          line-height: 1.6; 
          max-width: 600px; 
          margin-left: auto; 
          margin-right: auto; 
        }
        h1 { 
          color: #1e40af; 
          font-size: 32px; 
          margin-bottom: 20px; 
          text-align: center; 
          font-weight: bold;
        }
        .list-info { 
          background: #f3f4f6; 
          padding: 20px; 
          border-radius: 12px; 
          margin: 25px 0; 
          text-align: center; 
          font-size: 16px;
        }
        .list-info p {
          margin: 8px 0;
          font-weight: 500;
        }
        .items-list {
          margin: 25px 0;
        }
        .item { 
          padding: 8px 0; 
          border-bottom: 1px solid #e5e7eb; 
          font-size: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .item:last-child { 
          border-bottom: none; 
        }
        .item-name { 
          font-weight: 500; 
          color: #374151;
        }
        .item-details { 
          color: #6b7280; 
          font-size: 14px; 
          font-weight: 500;
        }
        .checked { 
          text-decoration: line-through; 
          color: #9ca3af; 
        }
        .summary { 
          margin-top: 25px; 
          padding: 15px; 
          background: #f3f4f6; 
          border-radius: 12px; 
          text-align: center; 
          font-size: 16px;
          font-weight: 500;
        }
        .summary p {
          margin: 5px 0;
        }
        .footer {
          margin-top: 30px; 
          text-align: center; 
          font-size: 14px; 
          color: #6b7280;
          border-top: 2px solid #e5e7eb;
          padding-top: 20px;
        }
        @media print { 
          body { 
            margin: 20px; 
            font-size: 16px;
          } 
          h1 { font-size: 28px; }
          .item { padding: 6px 0; }
        }
      </style>
    </head>
    <body>
      <h1>${currentList.value.name}</h1>
      
      <div class="list-info">
        <p>Liste créée le ${formatDate(currentList.value.createdAt)}</p>
        <p>${currentItems.value.length} article${currentItems.value.length > 1 ? 's' : ''} au total</p>
      </div>
      
      <div class="items-list">
        ${currentItems.value.map(item => `
          <div class="item ${item.checked ? 'checked' : ''}">
            <div class="item-name">${item.name}</div>
            ${item.amount && item.unit ? `<div class="item-details">${item.amount} ${item.unit}</div>` : ''}
          </div>
        `).join('')}
      </div>
      
      <div class="summary">
        <p><strong>${uncheckedItems.value.length}</strong> article${uncheckedItems.value.length > 1 ? 's' : ''} à acheter</p>
        <p><strong>${checkedItems.value.length}</strong> article${checkedItems.value.length > 1 ? 's' : ''} acheté${checkedItems.value.length > 1 ? 's' : ''}</p>
      </div>
      
      <div class="footer">
        Recettes des Boultons - ${new Date().toLocaleDateString('fr-FR')}
      </div>
    </body>
    </html>
  `
  
  printWindow.document.write(printContent)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  printWindow.close()
}

// SEO
useHead({
  title: 'Listes de courses - Recettes des Boultons',
  meta: [
    { name: 'description', content: 'Gérez vos listes de courses facilement. Ajoutez des articles, cochez ce qui est acheté et ne manquez plus rien !' }
  ]
})
</script> 