export interface NavLink { to: string, icon: string, label: string }

/**
 * Entrées de navigation.
 *
 * - v1 (défaut) : Recettes · Planning · Courses · Favoris (inchangé).
 * - v2, connecté : Mon carnet · Partagées avec moi · Amis · Groupes dans l'en-tête et la barre du bas ;
 *   Réglages, Favoris, Planning, Courses (et le traducteur et les signalements pour les admins) dans le menu de la personne.
 * - v2, visiteur : aucune entrée (accueil générique et connexion).
 */
export function useNav() {
  const { t } = useI18n()
  const v2 = useV2()
  const authStore = useAuthStore()

  const mainLinks = computed<NavLink[]>(() => {
    if (!v2) {
      return [
        { to: '/recettes', icon: 'i-lucide-book-open', label: t('navigation.recipes') },
        { to: '/planning', icon: 'i-lucide-calendar-days', label: t('navigation.planning') },
        { to: '/courses', icon: 'i-lucide-shopping-cart', label: t('navigation.shopping') },
        { to: '/favoris', icon: 'i-lucide-heart', label: t('navigation.favorites') }
      ]
    }
    if (!authStore.isAuthenticated) return []
    return [
      { to: '/recettes', icon: 'i-lucide-book-open', label: t('navigation.myCookbook') },
      { to: '/partagees', icon: 'i-lucide-share-2', label: t('navigation.sharedWithMe') },
      { to: '/amis', icon: 'i-lucide-users', label: t('navigation.friends') },
      { to: '/groupes', icon: 'i-lucide-users-round', label: t('navigation.groups') }
    ]
  })

  /** Entrées du menu de la personne (v2) : tout ce qui n'est pas dans la barre principale. */
  const menuLinks = computed<NavLink[]>(() => {
    if (!v2 || !authStore.isAuthenticated) return []
    return [
      { to: '/reglages', icon: 'i-lucide-settings', label: t('navigation.settings') },
      { to: '/favoris', icon: 'i-lucide-heart', label: t('navigation.favorites') },
      { to: '/planning', icon: 'i-lucide-calendar-days', label: t('navigation.planning') },
      { to: '/courses', icon: 'i-lucide-shopping-cart', label: t('navigation.shopping') },
      // Support (Nina) : écran des signalements, visible du rôle support/admin seulement (la base reste juge)
      ...(authStore.isAdmin ? [{ to: '/support/signalements', icon: 'i-lucide-flag', label: t('navigation.supportReports') }] : [])
    ]
  })

  return { v2, mainLinks, menuLinks }
}
