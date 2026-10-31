import { displaySiteName } from '#shared/utils/siteName'

/**
 * Nom du site à afficher (en-tête, titre des pages, pied de page, accueil). En v2 : le « Titre du carnet » de la personne
 * connectée (`profiles.cookbook_title`), sinon « Family Cookbook » (visiteur compris), quel que soit son thème actif (personnel
 * ou de groupe : le thème ne porte que le look). Les pages publiques de partage (`/r/<jeton>`) et les pages légales gardent
 * « Family Cookbook ». En v1, le nom de l'édition figée.
 * Un seul point d'entrée : ne pas lire `useEdition().siteName` ni `BRAND_NAME` directement dans un composant.
 */
export function useSiteName() {
  const edition = useEdition()
  const route = useRoute()
  const v2 = useV2()
  const authStore = useAuthStore()
  return computed(() => displaySiteName({
    v2,
    path: route.path,
    cookbookTitle: authStore.isAuthenticated ? authStore.profile?.cookbook_title : null,
    editionName: edition.siteName.value
  }))
}
