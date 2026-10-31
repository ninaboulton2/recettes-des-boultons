export interface NavLink { to: string, icon: string, label: string }

/**
 * Icônes de la navigation : UNE seule source, utilisée par la barre du haut, la barre du bas (mobile), le menu de la personne
 * et l'accueil. Chaque entrée garde la même icône partout : carnet = livre ouvert, favoris = cœur, planning = calendrier,
 * courses = chariot. Elles sont aussi embarquées dans le bundle client (`nuxt.config.ts`, `icon.clientBundle`) : plus aucune
 * requête d'icône (ni cache de service worker) ne peut en afficher une autre à la place.
 */
export const NAV_ICONS = {
  cookbook: 'i-lucide-book-open',
  favorites: 'i-lucide-heart',
  planning: 'i-lucide-calendar-days',
  shopping: 'i-lucide-shopping-cart'
} as const

/**
 * Entrées de navigation.
 *
 * - v1 (défaut) : Recettes · Planning · Courses · Favoris (inchangé).
 * - v2, connecté : Mon carnet · Favoris · Planning · Courses dans l'en-tête et la barre du bas ;
 *   Réglages, Partagées avec moi, Amis, Groupes (et les signalements pour le support) dans le menu de la personne.
 *   Le traducteur IA n'y figure plus : on y accède par « Nouvelle recette » du carnet et par l'accueil.
 * - v2, visiteur : Mon carnet · Favoris · Planning · Courses ; un clic ouvre la connexion puis ramène sur la page demandée
 *   (middleware `v2-members`, aussi sur Mon carnet).
 */
export function useNav() {
  const { t } = useI18n()
  const v2 = useV2()
  const authStore = useAuthStore()

  const mainLinks = computed<NavLink[]>(() => {
    if (!v2) {
      return [
        { to: '/recettes', icon: NAV_ICONS.cookbook, label: t('navigation.recipes') },
        { to: '/planning', icon: NAV_ICONS.planning, label: t('navigation.planning') },
        { to: '/courses', icon: NAV_ICONS.shopping, label: t('navigation.shopping') },
        { to: '/favoris', icon: NAV_ICONS.favorites, label: t('navigation.favorites') }
      ]
    }
    // v2 : Mon carnet en tête, pour les membres comme pour le visiteur (un clic de visiteur ouvre la connexion puis ramène ici)
    return [
      { to: '/recettes', icon: NAV_ICONS.cookbook, label: t('navigation.myCookbook') },
      { to: '/favoris', icon: NAV_ICONS.favorites, label: t('navigation.favorites') },
      { to: '/planning', icon: NAV_ICONS.planning, label: t('navigation.planning') },
      { to: '/courses', icon: NAV_ICONS.shopping, label: t('navigation.shopping') }
    ]
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
