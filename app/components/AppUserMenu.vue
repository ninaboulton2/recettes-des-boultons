<template>
  <UDropdownMenu v-if="authStore.isAuthenticated" :items="items" :content="{ align: 'end' }">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-circle-user-round"
      :label="displayName"
      :aria-label="$t('ui.user.menu')"
      class="max-w-48"
      :ui="{ label: 'truncate' }"
    />
  </UDropdownMenu>
  <UButton v-else icon="i-lucide-log-in" :label="$t('ui.user.login')" @click="emit('login')" />
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

/**
 * Menu utilisateur (header desktop) : bouton « Connexion » (déconnecté) ou
 * menu déroulant (identité, raccourcis, déconnexion). Sur mobile, l'onglet
 * « Moi » de la barre du bas ouvre un tiroir (layout).
 */
const emit = defineEmits<{ login: [], logout: [] }>()

const { t } = useI18n()
const authStore = useAuthStore()
const localePath = useLocalePath()
const { v2, menuLinks } = useNav()

// v2 : le pseudonyme (visible des autres) passe avant `profiles.name`, qui peut contenir l'e-mail.
const displayName = computed(() =>
  (v2 ? authStore.profile?.display_name : null) || authStore.currentUser?.name || authStore.currentUser?.email || t('ui.user.account')
)

const items = computed<DropdownMenuItem[][]>(() => [
  [{
    type: 'label',
    label: displayName.value,
    description: authStore.currentUser?.name ? authStore.currentUser.email : undefined
  }],
  [
    ...(v2
      ? menuLinks.value.map(link => ({ label: link.label, icon: link.icon, to: localePath(link.to) }))
      : [
          { label: t('navigation.favorites'), icon: NAV_ICONS.favorites, to: localePath('/favoris') },
          { label: t('navigation.planning'), icon: NAV_ICONS.planning, to: localePath('/planning') },
          { label: t('navigation.shopping'), icon: NAV_ICONS.shopping, to: localePath('/courses') }
        ]),
    // Le traducteur reste dans le menu en v1 (admins) ; en v2 il s'ouvre depuis « Nouvelle recette » et l'accueil.
    ...(authStore.isAdmin && !v2
      ? [
          { label: t('ui.user.translator'), icon: 'i-lucide-sparkles', to: localePath('/traducteur') }
        ]
      : [])
  ],
  [{ label: t('ui.user.logout'), icon: 'i-lucide-log-out', color: 'error', onSelect: () => emit('logout') }]
])
</script>
