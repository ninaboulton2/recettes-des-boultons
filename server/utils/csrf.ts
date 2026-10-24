import { createError, getHeader, getMethod, getRequestURL, type H3Event } from 'h3'

/**
 * Garde CSRF des routes d'écriture de l'API (middleware `server/middleware/csrf.ts`).
 *
 * Refuse (403) tout POST / PUT / PATCH / DELETE sur `/api/**` quand :
 *  - `Sec-Fetch-Site` vaut `cross-site` (envoyé par tous les navigateurs actuels), ou
 *  - `Origin` est présent et son hôte diffère de celui de la requête (`Host`, ou `X-Forwarded-Host` derrière un proxy).
 * Laisse passer : même origine, `Sec-Fetch-Site: same-origin | same-site | none`, `Origin` absent (clients serveur, scripts, tests,
 * Playwright `request`), et les lectures (GET / HEAD / OPTIONS). Les routes IA et Drive, appelées par l'application en même origine,
 * ne sont donc pas touchées. Complète le cookie de session `SameSite=Lax`.
 */

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

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
  if (!WRITE_METHODS.has(input.method.toUpperCase())) return null
  if (!(input.path === '/api' || input.path.startsWith('/api/'))) return null
  if (input.secFetchSite?.trim().toLowerCase() === 'cross-site') return 'requête inter-sites'
  const origin = input.origin?.trim()
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
