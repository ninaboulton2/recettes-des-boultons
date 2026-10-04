<template>
  <ClientOnly>
    <div v-if="isOffline" class="mb-6 print:hidden" data-testid="offline-banner">
      <!--
        Sur /courses, la copie hors ligne des listes est affichée par la page
        elle-même (<ShoppingOfflineCopy />) : le bandeau ne la répète pas.
      -->
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-wifi-off"
        :title="$t('pwa.offline.title')"
        :description="onShoppingPage ? $t('pwa.offline.shoppingDescription') : $t('pwa.offline.description')"
      />
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useOfflineShopping } from '~/composables/useOfflineShopping'

const route = useRoute()
const localePath = useLocalePath()
const { isOffline } = useOfflineShopping()

const onShoppingPage = computed(() => route.path === localePath('/courses'))
</script>
