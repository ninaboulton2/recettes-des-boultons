<template>
  <div>
    <div v-if="!authStore.isAuthenticated">
      <AuthRequired @login="showLoginModal = true" />
      <AuthModal
        :is-open="showLoginModal"
        @close="showLoginModal = false"
        @success="showLoginModal = false"
      />
    </div>

    <div v-else class="shopping-page space-y-4">
      <!-- En-tête -->
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="font-serif text-3xl text-highlighted sm:text-4xl">
            <span class="print:hidden">{{ $t('shopping.title') }}</span>
            <span class="hidden print:inline">{{ shopping.currentList.value?.name }}</span>
          </h1>
          <p class="mt-1 text-sm text-muted print:hidden">
            {{ $t('shopping.subtitle') }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-3 print:hidden">
          <USwitch v-model="shopping.storeMode.value" :label="$t('shopping.storeMode')" size="sm" />
          <USwitch v-model="shopping.byAisle.value" :label="$t('shopping.aisles.toggle')" size="sm" />
          <UButton
            v-if="shopping.currentList.value"
            :label="$t('shopping.printButton')"
            icon="i-lucide-printer"
            color="neutral"
            variant="outline"
            size="sm"
            @click="print"
          />
        </div>
      </header>

      <!-- Chargement initial -->
      <div v-if="status === 'pending' && !hasData" class="space-y-3" aria-busy="true">
        <USkeleton class="h-10 w-full" />
        <USkeleton class="h-16 w-full" />
        <USkeleton v-for="index in 5" :key="index" class="h-12 w-full" />
      </div>

      <ErrorState
        v-else-if="error"
        :message="error.message"
        :retry-action="() => refresh()"
        :title="$t('shopping.loadError')"
        :retry-text="$t('shopping.retry')"
      />

      <template v-else>
        <ShoppingListTabs
          :lists="shopping.lists.value"
          :model-value="shopping.currentList.value?.id ?? null"
          @update:model-value="shopping.select"
          @create="(name, done) => shopping.createList(name).finally(done)"
          @rename="(id, name, done) => shopping.renameList(id, name).finally(done)"
          @clear="(id, done) => shopping.clearList(id).finally(done)"
          @delete="(id, done) => shopping.deleteList(id).finally(done)"
        />

        <UEmpty
          v-if="shopping.lists.value.length === 0"
          icon="i-lucide-shopping-basket"
          :title="$t('shopping.empty.title')"
          :description="$t('shopping.empty.description')"
          variant="subtle"
        />

        <template v-else-if="shopping.currentList.value">
          <!-- Actions sur les articles -->
          <div class="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <p class="text-sm text-muted">
              {{ $t('shopping.lists.items', { count: shopping.items.value.length }, shopping.items.value.length) }}
              <template v-if="shopping.groups.value.checked.length > 0">
                · {{ shopping.groups.value.checked.length }}/{{ shopping.items.value.length }}
              </template>
            </p>
            <div class="flex items-center gap-2">
              <UButton
                v-if="shopping.items.value.length > 0"
                :label="shopping.allChecked.value ? $t('shopping.actions.uncheckAll') : $t('shopping.actions.checkAll')"
                :icon="shopping.allChecked.value ? 'i-lucide-square' : 'i-lucide-check-check'"
                color="neutral"
                variant="outline"
                size="sm"
                @click="shopping.allChecked.value ? shopping.uncheckAll() : shopping.checkAll()"
              />
              <UDropdownMenu :items="moreActions" :content="{ align: 'end' }">
                <UButton
                  icon="i-lucide-ellipsis"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :aria-label="$t('shopping.actions.more')"
                />
              </UDropdownMenu>
            </div>
          </div>

          <ShoppingAddItemForm :size="shopping.storeMode.value ? 'lg' : 'md'" @submit="onAddItem" />

          <UEmpty
            v-if="shopping.items.value.length === 0"
            icon="i-lucide-list-checks"
            :title="$t('shopping.emptyList.title')"
            :description="$t('shopping.emptyList.description')"
            variant="naked"
            size="sm"
          />

          <ShoppingItemList
            v-else
            :groups="shopping.groups.value"
            :to-buy-by-aisle="shopping.toBuyByAisle.value"
            :by-aisle="shopping.byAisle.value"
            :store-mode="shopping.storeMode.value"
            :other-lists="otherLists"
            :quantity-of="shopping.quantityOf"
            @toggle="item => shopping.toggleItem(item.id)"
            @update="(item, patch, done) => shopping.updateItem(item.id, patch).finally(done)"
            @move="(item, listId) => shopping.moveItem(item, listId)"
            @remove="item => shopping.removeItem(item)"
          />

          <p class="hidden text-sm text-muted print:block">
            {{ $t('shopping.print.toBuy', { count: shopping.groups.value.toBuy.length }, shopping.groups.value.toBuy.length) }}
          </p>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AddItemPayload } from '~/components/shopping/AddItemForm.vue'
import { useShoppingLists } from '~/composables/useShoppingLists'

const authStore = useAuthStore()
const { t } = useI18n()
const shopping = useShoppingLists()

const showLoginModal = ref(false)

// Listes : lecture directe sous RLS (store), rendue côté serveur
const { status, error, refresh } = await useAsyncData(
  'shopping-lists',
  () => shopping.store.refresh(),
  { watch: [() => authStore.isAuthenticated] }
)
const hasData = computed(() => shopping.lists.value.length > 0)

const otherLists = computed(() =>
  shopping.lists.value.filter(list => list.id !== shopping.currentList.value?.id)
)

const moreActions = computed(() => [
  [
    {
      label: t('shopping.actions.clearChecked'),
      icon: 'i-lucide-eraser',
      disabled: shopping.groups.value.checked.length === 0,
      onSelect: () => void shopping.clearChecked()
    },
    {
      label: t('shopping.actions.resetQuantities'),
      icon: 'i-lucide-rotate-ccw',
      disabled: shopping.items.value.length === 0,
      onSelect: () => void shopping.resetQuantities()
    }
  ]
])

const onAddItem = async (payload: AddItemPayload, done: (success: boolean) => void) => {
  const result = await shopping.addItem({ name: payload.name, amount: payload.amount, unit: payload.unit })
  done(result !== undefined)
}

const print = () => {
  if (import.meta.client) window.print()
}

useHead({
  title: () => t('shopping.title'),
  meta: [{ name: 'description', content: () => t('shopping.subtitle') }]
})
</script>

<style>
/* Impression de la liste courante, sans la navigation de l'application. */
@media print {
  body > #__nuxt header,
  body > #__nuxt footer,
  body > #__nuxt nav {
    display: none !important;
  }
}
</style>
