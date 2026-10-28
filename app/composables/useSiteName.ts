import { displaySiteName } from '#shared/utils/siteName'

/**
 * Nom du site à afficher (en-tête, titre des pages, pied de page, accueil) : le « Nom affiché » du thème actif, sinon
 * « Family Cookbook ». Les pages publiques de partage (`/r/<jeton>`) et les pages légales gardent « Family Cookbook ».
 * Un seul point d'entrée : ne pas lire `useEdition().siteName` ni `BRAND_NAME` directement dans un composant.
 */
export function useSiteName() {
  const edition = useEdition()
  const route = useRoute()
  const v2 = useV2()
  return computed(() => displaySiteName({ v2, path: route.path, themeName: edition.siteName.value }))
}
