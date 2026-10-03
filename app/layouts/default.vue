<template>
  <div class="flex min-h-screen flex-col">
    <header class="sticky top-0 z-40 border-b border-default bg-default/90 backdrop-blur">
      <UContainer class="flex h-14 items-center justify-between gap-3 md:h-16">
        <NuxtLink :to="localePath('/')" class="flex min-w-0 items-center gap-2 rounded-lg" :aria-label="$t('navigation.home')">
          <img src="/images/logo.png" alt="" class="h-8 w-auto shrink-0 md:h-9">
          <span class="truncate font-lobster text-xl text-primary md:text-2xl">{{ $t('meta.title') }}</span>
        </NuxtLink>

        <nav class="hidden items-center gap-1 md:flex" :aria-label="$t('ui.nav.main')">
          <UButton
            v-for="link in links"
            :key="link.to"
            :to="localePath(link.to)"
            :label="link.label"
            :icon="link.icon"
            color="neutral"
            variant="ghost"
            :class="isActive(link.to) && 'bg-primary/10 text-primary'"
            :aria-current="isActive(link.to) ? 'page' : undefined"
          />
        </nav>

        <div class="flex shrink-0 items-center gap-1">
          <UColorModeButton :aria-label="$t('ui.colorMode.toggle')" />
          <LanguageSwitcher />
          <div class="hidden md:block">
            <AppUserMenu @login="showLoginModal = true" @logout="handleLogout" />
          </div>
        </div>
      </UContainer>
    </header>

    <main class="flex-1 pb-20 md:pb-0">
      <UContainer class="py-6 md:py-8">
        <slot />
      </UContainer>
    </main>

    <footer class="mt-auto hidden border-t border-default md:block">
      <UContainer class="flex flex-col items-center justify-between gap-2 py-6 text-sm text-muted sm:flex-row">
        <p>{{ $t('footer.copyright', { year: new Date().getFullYear() }) }}</p>
        <p class="font-lobster text-base text-dimmed">{{ $t('meta.title') }}</p>
      </UContainer>
    </footer>

    <AppMobileNav @me="onMobileMe" />

    <!-- Menu « Moi » (mobile) : feuille en bas -->
    <UDrawer v-model:open="showMobileMenu" :title="$t('ui.user.menu')">
      <template #body>
        <nav class="flex flex-col gap-1 pb-4" :aria-label="$t('ui.user.menu')">
          <p class="px-2 pb-2 text-sm text-muted">{{ authStore.currentUser?.name || authStore.currentUser?.email }}</p>
          <UButton v-if="authStore.isAdmin" :to="localePath('/traducteur')" color="neutral" variant="ghost" icon="i-lucide-sparkles" :label="$t('ui.user.translator')" @click="showMobileMenu = false" />
          <UButton color="error" variant="soft" icon="i-lucide-log-out" :label="$t('ui.user.logout')" @click="handleLogout" />
        </nav>
      </template>
    </UDrawer>

    <AuthModal :is-open="showLoginModal" @close="showLoginModal = false" @success="showLoginModal = false" />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()

const authStore = useAuthStore()
const favoritesStore = useFavoritesStore()
const planningStore = usePlanningStore()
const shoppingStore = useShoppingStore()

const showLoginModal = ref(false)
const showMobileMenu = ref(false)

const links = computed(() => [
  { to: '/recettes', icon: 'i-lucide-book-open', label: t('navigation.recipes') },
  { to: '/planning', icon: 'i-lucide-calendar-days', label: t('navigation.planning') },
  { to: '/courses', icon: 'i-lucide-shopping-cart', label: t('navigation.shopping') },
  { to: '/favoris', icon: 'i-lucide-heart', label: t('navigation.favorites') }
])

const isActive = (to: string) => route.path === localePath(to) || route.path.startsWith(`${localePath(to)}/`)

const onMobileMe = () => {
  if (authStore.isAuthenticated) showMobileMenu.value = true
  else showLoginModal.value = true
}

/** Recharge (ou vide) les données utilisateur des stores. */
const refreshUserStores = async () => {
  try {
    await Promise.all([
      favoritesStore.refreshFavorites(),
      planningStore.refreshPlanning(),
      shoppingStore.refreshShoppingLists()
    ])
  } catch (error) {
    console.error('Erreur lors du rechargement des données utilisateur :', error)
  }
}

const handleLogout = async () => {
  showMobileMenu.value = false
  await authStore.logout()
  await refreshUserStores()
  await navigateTo(localePath('/'))
}

// Connexion / déconnexion (y compris retour OAuth) : synchroniser les stores
watch(() => authStore.isAuthenticated, () => { void refreshUserStores() })
</script>
