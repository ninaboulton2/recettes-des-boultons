import colors from 'tailwindcss/colors'
import { SHADES, type EditionConfig, type NeutralColor, type Shade } from './types'

/** Valeur Tailwind (oklch) d'une nuance de neutre. */
export function neutralShade(neutral: NeutralColor, shade: Shade): string {
  return colors[neutral][shade]
}

/**
 * Feuille de style du thème d'une édition, injectée dans le `<head>` dès le
 * rendu serveur (plugins/edition.ts) : aucun flash de couleur au chargement.
 *
 * - `--color-primary-*` : palette de l'édition (lue par Nuxt UI via
 *   `--ui-color-primary-* : var(--color-primary-*)`).
 * - `--ui-color-neutral-*` : neutre de l'édition (remplace celui de
 *   app.config.ts, déclaré dans `@layer theme` par Nuxt UI).
 * - `--ui-primary` : nuance AA en clair et en sombre.
 *
 * Sélecteur `:root[data-edition=…]` (hors couche, spécificité 0-2-0) : il
 * l'emporte sur les déclarations `:root` / `.dark` de Nuxt UI et de main.css.
 */
export function editionThemeCss(edition: EditionConfig): string {
  const { primary, neutral, primaryShade } = edition.theme
  const root = `:root[data-edition="${edition.id}"]`
  const declarations = [
    ...SHADES.map(shade => `--color-primary-${shade}: ${primary[shade]};`),
    ...SHADES.map(shade => `--ui-color-neutral-${shade}: var(--color-${neutral}-${shade}, ${neutralShade(neutral, shade)});`),
    `--ui-primary: var(--ui-color-primary-${primaryShade.light});`
  ]
  return `${root} {\n  ${declarations.join('\n  ')}\n}\n${root}.dark {\n  --ui-primary: var(--ui-color-primary-${primaryShade.dark});\n}`
}
