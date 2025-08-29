<template>
  <div>
    <!-- Vérification de l'authentification -->
    <div v-if="!authStore.isAuthenticated">
      <AuthRequired @login="showLoginModal = true" />
      <AuthModal 
        :is-open="showLoginModal" 
        @close="showLoginModal = false"
        @success="handleLoginSuccess"
      />
      <ToastContainer ref="toastContainer" />
      <Toast />
    </div>

    <!-- Contenu pour utilisateurs connectés -->
    <div v-else>
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
          Gérez vos listes de courses.
        </p>
      </div>

      <!-- Loading State -->
      <LoadingState v-if="shoppingStore.isLoading" message="Chargement de vos listes de courses..." />

      <!-- Error State -->
      <ErrorState 
        v-else-if="shoppingStore.error" 
        :message="shoppingStore.error"
        :retry-action="loadShoppingLists"
        title="Erreur de chargement des listes"
      />

      <!-- Lists Selection -->
      <div v-else-if="shoppingLists.length > 0" class="mb-8">
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
                <div class="flex-1">
                  <!-- Mode affichage du nom -->
                  <div v-if="editingListName !== list.id" class="flex items-center gap-2">
                    <h3 class="font-semibold text-gray-900">{{ list.name }}</h3>
                    <button
                      @click.stop="startEditingListName(list)"
                      class="text-gray-400 hover:text-primary-600 transition-colors duration-200"
                      title="Modifier le nom"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                      </svg>
                    </button>
                  </div>
                  
                  <!-- Mode édition du nom -->
                  <div v-else class="flex items-center gap-2">
                    <input
                      v-model="editingListNameValue"
                      type="text"
                      class="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      @keyup.enter="saveListName(list)"
                      @blur="saveListName(list)"
                      :data-list-id="list.id"
                      ref="listNameInput"
                    >
                    <button
                      @click.stop="saveListName(list)"
                      class="text-green-600 hover:text-green-700 transition-colors duration-200"
                      title="Sauvegarder"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                    </button>
                    <button
                      @click.stop="cancelListNameEdit(list)"
                      class="text-red-500 hover:text-red-700 transition-colors duration-200"
                      title="Annuler"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                      </svg>
                    </button>
                  </div>
                  
                  <p class="text-sm text-gray-500">
                    {{ list.items.length }} article{{ list.items.length > 1 ? 's' : '' }}
                  </p>
                  <p class="text-xs text-gray-400">
                    Créée le {{ formatDate(list.createdAt) }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    @click.stop="clearList(list.id)"
                    class="text-blue-500 hover:text-blue-700 transition-colors duration-200"
                    title="Vider la liste"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                    </svg>
                  </button>
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

      <!-- Empty State -->
      <EmptyState
        v-if="shoppingLists.length === 0"
        title="Aucune liste de courses"
        message="Créez votre première liste de courses pour commencer à organiser vos achats."
        icon-path="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
      />

      <!-- Current List -->
      <div v-if="currentList" class="bg-white rounded-xl shadow-sm p-6">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-xl font-semibold text-gray-900">
            {{ currentList.name }}
          </h2>
          <div class="flex gap-2">
            <button
              @click="clearChecked"
              class="px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 hover:text-orange-900 border border-orange-300 hover:border-orange-400 rounded-lg transition-all duration-200 text-sm shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="checkedItems.length === 0"
            >
              Effacer cochés
            </button>
            <button
              @click="resetQuantities"
              class="px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 hover:text-orange-900 border border-orange-300 hover:border-orange-400 rounded-lg transition-all duration-200 text-sm shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!currentItems.length"
            >
              Réinitialiser quantités
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
            <LoadingButton
              @click="addItem"
              :loading="isAddingItem"
              :disabled="!newItem.name.trim()"
              variant="primary"
            >
              Ajouter
            </LoadingButton>
          </div>
        </div>

        <!-- Items List -->
        <div class="space-y-2">
          <!-- Checkbox globale pour tous les articles -->
          <div v-if="currentItems.length > 0" class="flex items-center gap-3 p-3">
            <input
              type="checkbox"
              :checked="areAllItemsChecked"
              :indeterminate="areSomeItemsChecked"
              @change="toggleAllItems"
              class="w-5 h-5 text-primary-600"
            >
            <label class="flex-1 cursor-pointer font-medium text-gray-700">
              {{ areAllItemsChecked ? 'Décocher tous les articles' : 'Cocher tous les articles' }}
            </label>
            <span class="text-sm text-gray-500">
              {{ checkedItems.length }}/{{ currentItems.length }} article{{ currentItems.length > 1 ? 's' : '' }}
            </span>
          </div>
          
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
            </label>
            
            <!-- Affichage/Édition de la quantité -->
            <div class="flex items-center gap-2">
              <!-- Mode affichage -->
              <div v-if="!editingItems.has(item.id)" class="flex items-center gap-2">
                <div class="text-sm text-gray-600">
                  <span v-if="item.amount">
                    {{ item.amount }}{{ item.unit ? ' ' + item.unit : '' }}
                  </span>
                </div>
                <button
                  @click="startEditing(item)"
                  class="text-gray-400 hover:text-primary-600 transition-colors duration-200"
                  title="Modifier la quantité"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                  </svg>
                </button>
              </div>
              
              <!-- Mode édition -->
              <div v-else class="flex items-center gap-2">
                <input
                  v-model.number="item.amount"
                  type="number"
                  min="0"
                  step="0.1"
                  class="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  @keyup.enter="saveEditing(item)"
                  @blur="saveEditing(item)"
                  ref="quantityInput"
                >
                <input
                  v-model="item.unit"
                  type="text"
                  placeholder="unité"
                  class="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  @keyup.enter="saveEditing(item)"
                  @blur="saveEditing(item)"
                >
                <button
                  @click="saveEditing(item)"
                  class="text-green-600 hover:text-green-700 transition-colors duration-200"
                  title="Sauvegarder"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </button>
                <button
                  @click="cancelEditing(item)"
                  class="text-red-500 hover:text-red-700 transition-colors duration-200"
                  title="Annuler"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
            </div>
            
            <button
              @click="removeItem(item.id)"
              class="text-red-500 hover:text-red-700 transition-colors duration-200"
              title="Supprimer"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
            
            <!-- Bouton de déplacement -->
            <div class="relative move-menu-container" v-if="shoppingLists.length > 1">
              <button
                @click="toggleMoveMenu(item.id)"
                class="text-blue-500 hover:text-blue-700 transition-colors duration-200"
                title="Déplacer vers une autre liste"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                </svg>
              </button>
              
              <!-- Menu déroulant pour sélectionner la liste de destination -->
              <div 
                v-if="moveMenuOpen === item.id"
                class="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-48"
              >
                <div class="p-2">
                  <div class="text-xs font-medium text-gray-500 mb-2 px-2">Déplacer vers :</div>
                  <button
                    v-for="list in shoppingLists"
                    :key="list.id"
                    @click="moveItemToList(item, list.id)"
                    class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded transition-colors duration-200"
                    :class="list.id === currentList?.id ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700'"
                    :disabled="list.id === currentList?.id"
                  >
                    {{ list.name }}
                  </button>
                </div>
              </div>
            </div>
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

    <!-- Confirm Modal -->
    <ConfirmModal
      :show="showDeleteModal"
      title="Supprimer la liste"
      message="Êtes-vous sûr de vouloir supprimer cette liste ? Cette action est irréversible."
      confirm-text="Supprimer"
      cancel-text="Annuler"
      @confirm="confirmDeleteList"
      @close="showDeleteModal = false"
    />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import AuthRequired from '@/components/AuthRequired.vue'
import AuthModal from '@/components/AuthModal.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import Toast from '@/components/Toast.vue'
import LoadingState from '@/components/LoadingState.vue'
import ErrorState from '@/components/ErrorState.vue'
import ActionLoading from '@/components/ActionLoading.vue'
import LoadingButton from '@/components/LoadingButton.vue'
import EmptyState from '@/components/EmptyState.vue'

const authStore = useAuthStore()
const shoppingStore = useShoppingStore()

const showLoginModal = ref(false)
const toastContainer = ref()

// Reactive data
const newListName = ref('')
const newItem = ref({
  name: '',
  amount: 1,
  unit: ''
})

// État d'édition pour chaque item
const editingItems = ref(new Set())

// État d'édition pour les noms de liste
const editingListName = ref(null)
const editingListNameValue = ref('')

// État du menu de déplacement
const moveMenuOpen = ref(null)

// État de la modal de confirmation
const showDeleteModal = ref(false)
const listToDelete = ref(null)

// État de chargement pour les actions
const isAddingItem = ref(false)

// Computed properties
const shoppingLists = computed(() => shoppingStore.shoppingLists)
const currentList = computed(() => shoppingStore.currentList)
const currentItems = computed(() => shoppingStore.currentItemsGrouped)
const checkedItems = computed(() => shoppingStore.checkedItems)
const uncheckedItems = computed(() => shoppingStore.uncheckedItems)

// Computed properties pour la checkbox globale
const areAllItemsChecked = computed(() => {
  return currentItems.value.length > 0 && currentItems.value.every(item => item.checked)
})

const areSomeItemsChecked = computed(() => {
  return currentItems.value.length > 0 && 
         currentItems.value.some(item => item.checked) && 
         !currentItems.value.every(item => item.checked)
})

// Methods
const handleLoginSuccess = async () => {
  showLoginModal.value = false
  // Les favoris seront automatiquement rechargés par le layout
}

// Fonction pour recharger les listes de courses en cas d'erreur
const loadShoppingLists = async () => {
  await shoppingStore.loadShoppingLists()
}

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
  listToDelete.value = listId
  showDeleteModal.value = true
}

const clearList = async (listId) => {
  try {
    const list = shoppingLists.value.find(l => l.id === listId)
    if (!list) return
    
    const result = await shoppingStore.clearList(listId)
    
    if (result.success) {
      $toast.success(
        'Liste vidée !',
        `La liste "${list.name}" a été vidée avec succès`,
        3000
      )
    } else {
      $toast.error(
        'Erreur !',
        result.error || 'Erreur lors du vidage de la liste',
        3000
      )
    }
  } catch (error) {
    console.error('Erreur vidage liste:', error)
    $toast.error(
      'Erreur !',
      'Erreur lors du vidage de la liste',
      3000
    )
  }
}

const { $toast } = useNuxtApp()

const confirmDeleteList = () => {
  if (listToDelete.value) {
    const listName = shoppingStore.shoppingLists.find(list => list.id === listToDelete.value)?.name || 'Liste'
    shoppingStore.deleteList(listToDelete.value)
    listToDelete.value = null
    showDeleteModal.value = false
    
    // Afficher un toast de confirmation
    $toast.success(
      'Liste supprimée',
      `La liste "${listName}" a été supprimée avec succès`,
      3000
    )
  }
}

const addItem = async () => {
  if (newItem.value.name.trim()) {
    isAddingItem.value = true
    try {
      await shoppingStore.addItem({
        name: newItem.value.name.trim(),
        amount: newItem.value.amount || 1,
        unit: newItem.value.unit.trim()
      })
      newItem.value = { name: '', amount: 1, unit: '' }
    } catch (error) {
      console.error('Erreur lors de l\'ajout de l\'article:', error)
    } finally {
      isAddingItem.value = false
    }
  }
}

const toggleItem = (itemId) => {
  shoppingStore.toggleItem(itemId)
}

const toggleAllItems = async () => {
  if (!currentItems.value.length) return
  
  try {
    const newState = !areAllItemsChecked.value
    const result = await shoppingStore.toggleAllItems(newState)
    
    if (result.success) {
      $toast.success(
        newState ? 'Tous les articles cochés !' : 'Tous les articles décochés !',
        newState 
          ? `${currentItems.value.length} article${currentItems.value.length > 1 ? 's' : ''} coché${currentItems.value.length > 1 ? 's' : ''}`
          : `${currentItems.value.length} article${currentItems.value.length > 1 ? 's' : ''} décoché${currentItems.value.length > 1 ? 's' : ''}`,
        3000
      )
    } else {
      $toast.error(
        'Erreur !',
        result.error || 'Erreur lors de la mise à jour des articles',
        3000
      )
    }
  } catch (error) {
    console.error('Erreur toggle tous les articles:', error)
    $toast.error(
      'Erreur !',
      'Erreur lors de la mise à jour des articles',
      3000
    )
  }
}

const removeItem = (itemId) => {
  shoppingStore.removeItem(itemId)
}

const startEditing = (item) => {
  editingItems.value.add(item.id)
  // Stocker les valeurs originales pour pouvoir annuler
  item._originalAmount = item.amount
  item._originalUnit = item.unit
}

const saveEditing = (item) => {
  editingItems.value.delete(item.id)
  shoppingStore.updateItemQuantity(item.id, item.amount, item.unit)
  // Nettoyer les valeurs temporaires
  delete item._originalAmount
  delete item._originalUnit
}

const cancelEditing = (item) => {
  editingItems.value.delete(item.id)
  // Restaurer les valeurs originales
  if (item._originalAmount !== undefined) {
    item.amount = item._originalAmount
    delete item._originalAmount
  }
  if (item._originalUnit !== undefined) {
    item.unit = item._originalUnit
    delete item._originalUnit
  }
}

const clearChecked = () => {
  shoppingStore.clearChecked()
}

const resetQuantities = async () => {
  if (!currentList.value) return
  
  try {
    const result = await shoppingStore.resetQuantities()
    
    if (result.success) {
      $toast.success(
        'Quantités réinitialisées !',
        result.message,
        3000
      )
    } else {
      $toast.error(
        'Erreur !',
        result.error || 'Erreur lors de la réinitialisation des quantités',
        3000
      )
    }
  } catch (error) {
    console.error('Erreur réinitialisation quantités:', error)
    $toast.error(
      'Erreur !',
      'Erreur lors de la réinitialisation des quantités',
      3000
    )
  }
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
          max-width: 700px; 
          margin-left: auto; 
          margin-right: auto; 
        }
        h1 { 
          color: #1e40af; 
          font-size: 32px; 
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
          margin: 30px 0;
        }
        .item { 
          padding: 10px 0; 
          border-bottom: 1px solid #e5e7eb; 
          font-size: 12px;
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
          font-size: 12px; 
          font-weight: 500;
        }
        .checked { 
          text-decoration: line-through; 
          color: #9ca3af; 
        }
        .summary { 
          margin-top: 5px; 
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
      </div>
      
      <div class="items-list">
        ${currentItems.value.map(item => `
          <div class="item ${item.checked ? 'checked' : ''}">
            <div class="item-name">${item.name}</div>
            <div class="item-details">
              ${item.amount ? `${item.amount}${item.unit ? ' ' + item.unit : ''}` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="summary">
        <p><strong>${uncheckedItems.value.length}</strong> article${uncheckedItems.value.length > 1 ? 's' : ''} à acheter</p>
      </div>
      
      <div class="footer">
        Recettes des Boultons
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

const startEditingListName = (list) => {
  editingListName.value = list.id
  editingListNameValue.value = list.name
  // Focus sur l'input après le prochain tick pour que le DOM soit mis à jour
  nextTick(() => {
    const input = document.querySelector(`[data-list-id="${list.id}"] input`)
    if (input) input.focus()
  })
}

const saveListName = (list) => {
  if (editingListNameValue.value.trim()) {
    shoppingStore.updateListName(list.id, editingListNameValue.value.trim())
  }
  editingListName.value = null
}

const cancelListNameEdit = (list) => {
  editingListName.value = null
}

const toggleMoveMenu = (itemId) => {
  if (moveMenuOpen.value === itemId) {
    moveMenuOpen.value = null
  } else {
    moveMenuOpen.value = itemId
  }
}

const moveItemToList = (item, targetListId) => {
  if (targetListId === currentList.value?.id) return
  
  // Passer l'ID de la liste source pour un déplacement plus précis
  shoppingStore.moveItemToAnotherList(item.name, targetListId, currentList.value?.id)
  moveMenuOpen.value = null
}

// Initialize
onMounted(() => {
  // Fermer le menu de déplacement quand on clique en dehors
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.move-menu-container')) {
      moveMenuOpen.value = null
    }
  })
})

// Cleanup
onUnmounted(() => {
  document.removeEventListener('click', (event) => {
    if (!event.target.closest('.move-menu-container')) {
      moveMenuOpen.value = null
    }
  })
})

// SEO
useHead({
  title: 'Listes de courses - Recettes des Boultons',
  meta: [
    { name: 'description', content: 'Gérez vos listes de courses facilement. Ajoutez des articles, cochez ce qui est acheté et ne manquez plus rien !' }
  ]
})
</script>
