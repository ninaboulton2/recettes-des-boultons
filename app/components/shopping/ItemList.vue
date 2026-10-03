<template>
  <div class="space-y-4">
    <!-- À acheter -->
    <section v-if="groups.toBuy.length > 0" :aria-label="$t('shopping.groups.toBuy')">
      <h3 class="mb-1 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <UIcon name="i-lucide-shopping-cart" class="size-3.5 print:hidden" />
        {{ $t('shopping.groups.toBuy') }}
        <UBadge :label="String(groups.toBuy.length)" color="neutral" variant="subtle" size="xs" />
      </h3>

      <template v-if="byAisle">
        <div v-for="group in toBuyByAisle" :key="group.aisle" class="mb-3 last:mb-0">
          <h4 class="px-2 py-1 text-xs font-medium text-dimmed">
            {{ $t(`shopping.aisles.${group.aisle}`) }}
          </h4>
          <ul class="divide-y divide-default rounded-xl border border-default bg-default print:border-0">
            <ShoppingItemRow
              v-for="item in group.items"
              :key="item.id"
              :item="item"
              :quantity="quantityOf(item)"
              :other-lists="otherLists"
              :store-mode="storeMode"
              @toggle="emit('toggle', $event)"
              @update="(target, patch, done) => emit('update', target, patch, done)"
              @move="(target, listId) => emit('move', target, listId)"
              @remove="emit('remove', $event)"
            />
          </ul>
        </div>
      </template>

      <ul v-else class="divide-y divide-default rounded-xl border border-default bg-default print:border-0">
        <ShoppingItemRow
          v-for="item in groups.toBuy"
          :key="item.id"
          :item="item"
          :quantity="quantityOf(item)"
          :other-lists="otherLists"
          :store-mode="storeMode"
          @toggle="emit('toggle', $event)"
          @update="(target, patch, done) => emit('update', target, patch, done)"
          @move="(target, listId) => emit('move', target, listId)"
          @remove="emit('remove', $event)"
        />
      </ul>
    </section>

    <!-- Dans le panier -->
    <section v-if="groups.checked.length > 0" :aria-label="$t('shopping.groups.checked')">
      <h3 class="mb-1 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <UIcon name="i-lucide-check-check" class="size-3.5 print:hidden" />
        {{ $t('shopping.groups.checked') }}
        <UBadge :label="String(groups.checked.length)" color="neutral" variant="subtle" size="xs" />
      </h3>
      <ul class="divide-y divide-default rounded-xl border border-default bg-muted/50 print:border-0">
        <ShoppingItemRow
          v-for="item in groups.checked"
          :key="item.id"
          :item="item"
          :quantity="quantityOf(item)"
          :other-lists="otherLists"
          :store-mode="storeMode"
          @toggle="emit('toggle', $event)"
          @update="(target, patch, done) => emit('update', target, patch, done)"
          @move="(target, listId) => emit('move', target, listId)"
          @remove="emit('remove', $event)"
        />
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { ShoppingItem, ShoppingList } from '#shared/types'
import type { AisleGroup } from '#shared/utils/shopping'

/** Articles d'une liste : « à acheter » (à plat ou par rayon) puis « dans le panier ». */
defineProps<{
  groups: { toBuy: ShoppingItem[], checked: ShoppingItem[] }
  toBuyByAisle: AisleGroup<ShoppingItem>[]
  byAisle: boolean
  storeMode: boolean
  otherLists: ShoppingList[]
  quantityOf: (item: ShoppingItem) => string
}>()

const emit = defineEmits<{
  toggle: [item: ShoppingItem]
  update: [item: ShoppingItem, patch: { amount: string | null, unit: string | null }, done: () => void]
  move: [item: ShoppingItem, targetListId: string]
  remove: [item: ShoppingItem]
}>()
</script>
