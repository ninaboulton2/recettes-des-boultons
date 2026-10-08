import { editionThemeCss } from '#shared/editions/theme'

/**
 * Applique l'édition au document dès le rendu serveur :
 * - `<html data-edition="…">` (sélecteur des styles propres à l'édition) ;
 * - feuille de style du thème (palette, neutre, nuance AA de `primary`) ;
 * - `<meta name="theme-color">` clair / sombre.
 * Tout est dans le HTML initial : pas de flash de couleur à l'hydratation.
 */
export default defineNuxtPlugin(() => {
  const { config } = useEdition()

  useHead({
    htmlAttrs: { 'data-edition': config.id },
    style: [{ id: 'edition-theme', innerHTML: editionThemeCss(config), tagPriority: 'critical' }],
    meta: [
      { key: 'theme-color-light', name: 'theme-color', media: '(prefers-color-scheme: light)', content: config.theme.themeColor.light },
      { key: 'theme-color-dark', name: 'theme-color', media: '(prefers-color-scheme: dark)', content: config.theme.themeColor.dark }
    ]
  })
})
