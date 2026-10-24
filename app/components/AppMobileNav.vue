<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default/95 backdrop-blur md:hidden"
    :aria-label="$t('ui.nav.mobile')"
  >
    <ul class="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
      <li v-for="tab in tabs" :key="tab.to">
        <NuxtLink
          :to="localePath(tab.to)"
          class="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors"
          :class="isActive(tab.to) ? 'text-primary' : 'text-muted hover:text-default'"
          :aria-current="isActive(tab.to) ? 'page' : undefined"
        >
          <UIcon :name="tab.icon" class="size-5" aria-hidden="true" />
          <span>{{ tab.label }}</span>
        </NuxtLink>
      </li>
      <li>
        <button
          type="button"
          class="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted transition-colors hover:text-default"
          :aria-label="$t('ui.nav.me')"
          @click="emit('me')"
        >
          <UIcon :name="authStore.isAuthenticated ? 'i-lucide-circle-user-round' : 'i-lucide-log-in'" class="size-5" aria-hidden="true" />
          <span>{{ $t('ui.nav.me') }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
/**
 * Barre d'onglets mobile (bas d'écran). Le layout réserve le padding bas
 * nécessaire ; les pages n'ont rien à prévoir.
 */
const emit = defineEmits<{ me: [] }>()

const route = useRoute()
const localePath = useLocalePath()
const authStore = useAuthStore()
// Onglets : v1 = Recettes / Planning / Courses / Favoris ; v2 = Mon carnet / Partagées / Amis / Groupes (useNav).
const { mainLinks: tabs } = useNav()

const isActive = (to: string) => route.path === localePath(to) || route.path.startsWith(`${localePath(to)}/`)
</script>
