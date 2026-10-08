import type { RecipeCategory } from '../types'

/**
 * Édition du site : tout ce qui distingue « Recettes des Boultons » (identité
 * d'origine) de la version générique (base de la v2 multi-comptes) vit dans
 * un objet `EditionConfig`. Les composants ne testent jamais l'identifiant
 * d'édition : ils lisent la configuration (`useEdition().config`).
 *
 * En v2, un groupe/foyer pourra fournir sa propre configuration (nom,
 * couleurs, images) : c'est pourquoi les textes de marque sont ici (et non
 * dans les fichiers i18n) et les couleurs sont des valeurs, pas des classes.
 */

export const EDITION_IDS = ['boultons', 'generic'] as const
export type EditionId = typeof EDITION_IDS[number]

/** Langues de l'interface (voir nuxt.config.ts → i18n.locales). */
export type EditionLocale = 'fr' | 'en'

/** Texte de marque dans chaque langue de l'interface. */
export type LocalizedText = Record<EditionLocale, string>

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type Shade = typeof SHADES[number]

/** Palette complète (hex `#rrggbb`), nuances Tailwind 50 → 950. */
export type Palette = Record<Shade, string>

/** Palettes neutres de Tailwind utilisables pour fonds, textes et bordures. */
export type NeutralColor = 'slate' | 'gray' | 'zinc' | 'neutral' | 'stone'

export interface EditionTheme {
  /** Couleur d'accent (`primary` de Nuxt UI). */
  primary: Palette
  /** Neutre de Nuxt UI (fonds, textes, bordures). */
  neutral: NeutralColor
  /**
   * Nuance de `primary` utilisée comme `--ui-primary` (texte, boutons pleins).
   * Choisie pour un contraste AA (≥ 4,5:1) : blanc sur la nuance en clair,
   * nuance sur le fond neutre 900 en sombre (vérifié par test/unit/editions.test.ts).
   */
  primaryShade: { light: Shade, dark: Shade }
  /** `<meta name="theme-color">` (barre du navigateur) et manifeste PWA. */
  themeColor: { light: string, dark: string }
  /** Couleur de fond du manifeste PWA (écran de démarrage). */
  backgroundColor: string
}

export interface EditionBrand {
  /** Nom du site : titre des pages, logo, pied de page, manifeste PWA. */
  name: LocalizedText
  /** Nom court (écran d'accueil du téléphone, manifeste PWA). */
  shortName: string
  /** Phrase d'accroche (accueil, meta description par défaut). */
  tagline: LocalizedText
  /** Meta description de la page d'accueil. */
  homeDescription: LocalizedText
  /** Logo de l'en-tête (chemin dans `public/`). */
  logo: string
  /**
   * Couleur du nom du site dans l'en-tête ; `null` = couleur `primary`.
   * (Un nom de marque n'est pas soumis aux exigences de contraste WCAG,
   * mais il doit rester lisible en sombre.)
   */
  nameColor: { light: string, dark: string } | null
}

export interface EditionHome {
  /** Variante de page d'accueil (`components/home/Home*.vue`). */
  variant: 'boultons' | 'generic'
  /** Illustration du héros (variante `boultons`) ; `null` = aucune. */
  heroImage: { src: string, alt: LocalizedText } | null
}

export interface EditionRecipeCards {
  /**
   * Hauteur de la zone visuelle des cartes recette :
   * - `fixed`    : toujours `aspect-[4/3]` (photo ou illustration de catégorie) ;
   * - `adaptive` : `aspect-[4/3]` si au moins une carte de la grille a une
   *                photo, sinon zone basse (icône seule) pour toute la grille.
   */
  visual: 'fixed' | 'adaptive'
}

export interface EditionConfig {
  id: EditionId
  brand: EditionBrand
  theme: EditionTheme
  home: EditionHome
  /**
   * Illustration par catégorie (chemins dans `public/`) ; `null` = icônes
   * Lucide (`CATEGORY_ICONS`). Repli visuel des recettes sans photo.
   */
  categoryImages: Record<RecipeCategory, string> | null
  recipeCards: EditionRecipeCards
}
