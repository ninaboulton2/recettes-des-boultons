import { LEGAL_PATHS } from '../legal/types'
import { BRAND_NAME } from '../brand'

/**
 * Nom du site affiché (v2).
 *
 * - Partout où la personne est chez elle (accueil, carnet, recettes, réglages…) : le nom de son thème (« Nom affiché »), sinon
 *   « Family Cookbook » (`BRAND_NAME`).
 * - Pages « neutres » : toujours « Family Cookbook », quel que soit le thème de la personne connectée. Ce sont les pages
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

/** Nom à afficher : `themeName` (déjà résolu depuis le thème actif) sauf sur une page neutre, en v2. En v1, rien ne change. */
export function displaySiteName(options: { v2: boolean, path: string, themeName: string }): string {
  return options.v2 && isNeutralSitePath(options.path) ? BRAND_NAME : options.themeName
}
