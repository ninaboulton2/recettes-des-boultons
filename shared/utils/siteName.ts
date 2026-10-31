import { LEGAL_PATHS } from '../legal/types'
import { BRAND_NAME } from '../brand'

/**
 * Nom du site affiché (v2).
 *
 * - Partout où la personne est chez elle (accueil, carnet, recettes, réglages…) : le « Titre du carnet » de son profil
 *   (`profiles.cookbook_title`), sinon « Family Cookbook » (`BRAND_NAME`). Le thème (personnel ou de groupe) ne porte que le look :
 *   le nom d'un groupe n'est jamais le nom du site.
 * - Pages « neutres » : toujours « Family Cookbook », quel que soit le carnet de la personne connectée. Ce sont les pages
 *   publiques de partage (`/r/<jeton>`, vues par des gens qui n'ont pas ce thème) et les pages légales (identité juridique du service).
 * - E-mails : toujours « Family Cookbook » (`EMAIL_APP_NAME`), un e-mail venant du service et non du carnet d'une personne.
 */

const LEGAL_SEGMENTS = [...Object.values(LEGAL_PATHS), '/compte-supprime']

/** Chemin sans préfixe de langue (`/en/r/x` → `/r/x`) ni paramètres. */
function stripLocale(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? ''
  return clean.replace(/^\/en(?=\/|$)/, '') || '/'
}

/** La page garde le nom générique du service (lien public de partage, pages légales) ? */
export function isNeutralSitePath(path: string): boolean {
  const local = stripLocale(path)
  if (/^\/r(\/|$)/.test(local)) return true
  return LEGAL_SEGMENTS.some(segment => local === segment || local === `${segment}/`)
}

/** Titre du carnet nettoyé : `null` s'il est absent ou vide. */
export function cleanCookbookTitle(title: string | null | undefined): string | null {
  const clean = title?.trim()
  return clean || null
}

/**
 * Nom à afficher. v2 : le titre du carnet (sinon « Family Cookbook »), sauf sur une page neutre.
 * v1 : `editionName` (le nom de l'édition figée), rien ne change.
 */
export function displaySiteName(options: { v2: boolean, path: string, cookbookTitle: string | null | undefined, editionName: string }): string {
  if (!options.v2) return options.editionName
  if (isNeutralSitePath(options.path)) return BRAND_NAME
  // `cookbookTitle` est déjà dans la langue de l'interface (`localizedCookbookTitle`, shared/utils/cookbookTitle.ts)
  return cleanCookbookTitle(options.cookbookTitle) ?? BRAND_NAME
}
