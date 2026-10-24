import { createError, getHeader, getMethod, getRequestURL, type H3Event } from 'h3'

/**
 * Garde CSRF des routes d'écriture (middleware `server/middleware/csrf.ts`).
 *
 * Refuse (403) toute requête dont la méthode n'est pas GET, HEAD ou OPTIONS, **quel que soit le chemin** (un test sur
 * `startsWith('/api/')` du chemin brut se contourne par encodage : `POST /%61pi/x` atteint la route, car h3 décode avant de
 * router), quand :
 *  - `Sec-Fetch-Site` vaut `cross-site` (envoyé par tous les navigateurs actuels), ou
 *  - `Sec-Fetch-Site` vaut `same-site` (autre sous-domaine du même site) sans `Origin` strictement égal à l'hôte, ou
 *  - `Origin` est présent et son hôte diffère de celui de la requête (`Host`, ou `X-Forwarded-Host` derrière un proxy).
 * Laisse passer : même origine, `Sec-Fetch-Site: same-origin | none`, `Origin` et `Sec-Fetch-Site` tous deux absents (clients
 * serveur, scripts, tests, Playwright `request`) et les lectures. Complète le cookie de session `SameSite=Lax`.
 *
 * Exceptions : `CSRF_EXEMPT_PATHS` (liste blanche explicite, chemins DÉCODÉS), vide aujourd'hui. Vérifiées : aucune route
 * d'écriture hors `/api`, les routes cron sont en GET, Nuxt / Nitro n'exposent pas de POST utile (`/__nuxt_island`, `/_ipx`,
 * `/__nuxt_error` sont des GET), pas de webhook entrant, pas de tunnel Sentry.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Chemins (décodés, en minuscules, sans `/` final) dispensés du contrôle. Vide : ajouter ici, jamais par préfixe. */
export const CSRF_EXEMPT_PATHS: readonly string[] = []

/** Chemin tel que le routeur le voit : décodé (en répétant, contre le double encodage), minuscules, sans `/` final. */
export function normalizeCsrfPath(path: string): string {
  let current = path
  for (let i = 0; i < 3; i++) {
    let decoded: string
    try {
      decoded = decodeURIComponent(current)
    } catch {
      break
    }
    if (decoded === current) break
    current = decoded
  }
  const trimmed = current.toLowerCase().replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

export interface CsrfInput {
  method: string
  path: string
  secFetchSite?: string | null
  origin?: string | null
  host?: string | null
  forwardedHost?: string | null
}

/** Motif du refus, ou `null` si la requête est acceptée. */
export function csrfRejection(input: CsrfInput): string | null {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return null
  if (CSRF_EXEMPT_PATHS.includes(normalizeCsrfPath(input.path))) return null
  const site = input.secFetchSite?.trim().toLowerCase()
  if (site === 'cross-site') return 'requête inter-sites'
  const origin = input.origin?.trim()
  if (site === 'same-site' && !origin) return 'même site sans origine'
  if (origin) {
    let originHost: string | null
    try {
      originHost = new URL(origin).host.toLowerCase()
    } catch {
      originHost = null   // « null » (contexte opaque) ou valeur illisible : jamais la même origine
    }
    const hosts = [input.host, input.forwardedHost?.split(',')[0]]
      .map(h => h?.trim().toLowerCase())
      .filter((h): h is string => !!h)
    if (originHost === null || !hosts.includes(originHost)) return 'origine différente de l\'hôte'
  }
  return null
}

export function csrfGuard(event: H3Event): void {
  const reason = csrfRejection({
    method: getMethod(event),
    path: getRequestURL(event).pathname,
    secFetchSite: getHeader(event, 'sec-fetch-site'),
    origin: getHeader(event, 'origin'),
    host: getHeader(event, 'host'),
    forwardedHost: getHeader(event, 'x-forwarded-host')
  })
  if (reason) {
    throw createError({ statusCode: 403, statusMessage: 'Requête refusée (origine non autorisée)' })
  }
}
