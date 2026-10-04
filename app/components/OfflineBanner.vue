<template>
  <ClientOnly>
    <div v-if="isOffline" class="mb-6 space-y-4 print:hidden" data-testid="offline-banner">
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-wifi-off"
        :title="$t('pwa.offline.title')"
        :description="onShoppingPage ? $t('pwa.offline.shoppingDescription') : $t('pwa.offline.description')"
      />

      <!-- Courses : dernière copie enregistrée, en lecture seule -->
      <section v-if="onShoppingPage" class="space-y-3" :aria-label="$t('pwa.shopping.title')">
        <template v-if="hasSnapshot">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="font-serif text-xl text-highlighted">{{ $t('pwa.shopping.title') }}</h2>
            <p v-if="savedAtLabel" class="text-sm text-muted">
              {{ $t('pwa.shopping.savedAt', { date: savedAtLabel }) }}
            </p>
          </div>

          <UCard v-for="list in lists" :key="list.id" variant="subtle">
            <template #header>
              <h3 class="font-medium text-highlighted">{{ list.name }}</h3>
            </template>
            <p v-if="list.items.length === 0" class="text-sm text-muted">{{ $t('pwa.shopping.emptyList') }}</p>
            <ul v-else class="divide-y divide-default">
              <li
                v-for="item in list.items"
                :key="item.id"
                class="flex items-center gap-3 py-2"
                :class="item.checked && 'text-muted line-through'"
              >
                <UIcon
                  :name="item.checked ? 'i-lucide-square-check' : 'i-lucide-square'"
                  class="size-5 shrink-0"
                  :aria-label="item.checked ? $t('pwa.shopping.checked') : $t('pwa.shopping.toBuy')"
                />
                <span class="flex-1">{{ item.name }}</span>
                <span v-if="quantityOf(item)" class="text-sm text-muted">{{ quantityOf(item) }}</span>
              </li>
            </ul>
          </UCard>
        </template>
        <p v-else class="text-sm text-muted">{{ $t('pwa.shopping.none') }}</p>
      </section>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useOfflineShopping } from '~/composables/useOfflineShopping'

const route = useRoute()
const { locale } = useI18n()
const localePath = useLocalePath()
const { isOffline, lists, hasSnapshot, savedAt, quantityOf } = useOfflineShopping()

const savedAtLabel = computed(() => savedAt.value
  ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(savedAt.value)
  : '')

const onShoppingPage = computed(() => route.path === localePath('/courses'))
</script>
