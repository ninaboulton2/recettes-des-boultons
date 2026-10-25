/**
 * Marque du produit (v2) : un seul endroit pour le nom générique et les adresses.
 *
 * - `BRAND_NAME` : nom du produit pour toute personne qui n'a pas de thème nommé (visiteur, thème « terracotta » ou libre sans
 *   nom). C'est un nom propre, identique en français et en anglais. Les membres des Boultons voient « Recettes des Boultons »
 *   par leur thème (`shared/editions/boultons.ts`), pas ce nom.
 * - `LEGACY_HOST` : ancienne adresse de production (alias Vercel) qui redirige vers `SITE_URL` (`shared/utils/siteUrl.ts`).
 */
export const BRAND_NAME = 'Family Cookbook'

/** Nom court (écran d'accueil du téléphone, manifeste PWA). */
export const BRAND_SHORT_NAME = 'Cookbook'

/** Alias de production d'origine ; les déploiements de prévisualisation (`*.vercel.app` autres) ne sont jamais redirigés. */
export const LEGACY_HOST = 'recettes-des-boultons.vercel.app'
