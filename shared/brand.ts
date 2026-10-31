/**
 * Marque du produit (v2) : un seul endroit pour le nom générique et les adresses.
 *
 * - `BRAND_NAME` : nom du produit, affiché pour toute personne sans « Titre du carnet » (visiteur compris), sur les pages neutres
 *   (lien public de partage, pages légales) et dans les e-mails. C'est un nom propre, identique en français et en anglais.
 *   Le nom du site d'une personne connectée est son titre de carnet (`profiles.cookbook_title`), jamais celui d'un thème ou d'un groupe.
 * - `LEGACY_HOST` : ancienne adresse de production (alias Vercel) qui redirige vers `SITE_URL` (`shared/utils/siteUrl.ts`).
 */
export const BRAND_NAME = 'Family Cookbook'

/** Nom court (écran d'accueil du téléphone, manifeste PWA). */
export const BRAND_SHORT_NAME = 'Cookbook'

/** Alias de production d'origine ; les déploiements de prévisualisation (`*.vercel.app` autres) ne sont jamais redirigés. */
export const LEGACY_HOST = 'recettes-des-boultons.vercel.app'
