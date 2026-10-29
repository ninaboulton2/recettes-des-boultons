export interface NavLink { to: string, icon: string, label: string }

/**
 * Entrées de navigation.
 *
 * - v1 (défaut) : Recettes · Planning · Courses · Favoris (inchangé).
 * - v2, connecté : Mon carnet · Favoris · Planning · Courses dans l'en-tête et la barre du bas ;
 *   Réglages, Partagées avec moi, Amis, Groupes (et les signalements pour le support) dans le menu de la personne.
 *   Le traducteur IA n'y figure plus : on y accède par « Nouvelle recette » du carnet et par l'accueil.
 * - v2, visiteur : Favoris · Planning · Courses ; un clic ouvre la connexion puis ramène sur la page demandée
 *   (middleware `v2-members`).
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
    const personal: NavLink[] = [
      { to: '/favoris', icon: 'i-lucide-heart', label: t('navigation.favorites') },
      { to: '/planning', icon: 'i-lucide-calendar-days', label: t('navigation.planning') },
      { to: '/courses', icon: 'i-lucide-shopping-cart', label: t('navigation.shopping') }
    ]
    if (!authStore.isAuthenticated) return personal
    return [{ to: '/recettes', icon: 'i-lucide-book-open', label: t('navigation.myCookbook') }, ...personal]
  })

  /** Entrées du menu de la personne (v2) : tout ce qui n'est pas dans la barre principale. */
  const menuLinks = computed<NavLink[]>(() => {
    if (!v2 || !authStore.isAuthenticated) return []
    return [
      { to: '/reglages', icon: 'i-lucide-settings', label: t('navigation.settings') },
      { to: '/partagees', icon: 'i-lucide-share-2', label: t('navigation.sharedWithMe') },
      { to: '/amis', icon: 'i-lucide-users', label: t('navigation.friends') },
      { to: '/groupes', icon: 'i-lucide-users-round', label: t('navigation.groups') },
      // Support (Nina) : écran des signalements, visible du rôle support/admin seulement (la base reste juge)
      ...(authStore.isAdmin ? [{ to: '/support/signalements', icon: 'i-lucide-flag', label: t('navigation.supportReports') }] : [])
    ]
  })

  return { v2, mainLinks, menuLinks }
}
