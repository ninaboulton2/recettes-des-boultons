import { editionThemeCss } from '#shared/editions/theme'

/**
 * Applique l'édition (v1) ou le thème actif (v2) au document dès le rendu serveur :
 * - `<html data-edition="…">` (sélecteur des styles propres à l'édition) ;
 * - feuille de style du thème (palette, neutre, nuance AA de `primary`) ;
 * - `<meta name="theme-color">` clair / sombre ;
 * - icônes de l'onglet et raccourci iOS de l'édition.
 * Tout est dans le HTML initial : pas de flash de couleur à l'hydratation.
 *
 * L'entrée de `useHead` est une fonction : en v2 elle est réévaluée quand le thème change (aperçu, réglages,
 * chargement du profil) ; en v1 la configuration est figée, le résultat est identique à l'ancien code.
 * Le CSS ne contient que des valeurs de la liste blanche (`#shared/themes`) : jamais de texte venant d'un thème.
 */
export default defineNuxtPlugin(() => {
  const edition = useEdition()
  // Union discriminée : unhead type chaque `rel` séparément.
  type IconLink =
    | { rel: 'icon', href: string, type: string, sizes?: string }
    | { rel: 'apple-touch-icon', href: string, sizes: string }

  useHead(() => {
    const config = edition.config
    const { icons } = config.brand
    const iconLinks: IconLink[] = [
      ...(icons.svg ? [{ rel: 'icon' as const, type: 'image/svg+xml', href: icons.svg }] : []),
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: icons.png32 },
      ...(icons.png48 ? [{ rel: 'icon' as const, type: 'image/png', sizes: '48x48', href: icons.png48 }] : []),
      { rel: 'apple-touch-icon', sizes: '180x180', href: icons.appleTouch }
    ]
    return {
      htmlAttrs: { 'data-edition': config.id },
      style: [{ id: 'edition-theme', innerHTML: editionThemeCss(config), tagPriority: 'critical' }],
      link: iconLinks,
      meta: [
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: config.theme.themeColor.light },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: config.theme.themeColor.dark }
      ]
    }
  })
})
