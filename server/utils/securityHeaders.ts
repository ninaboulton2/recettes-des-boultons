import { setResponseHeader, getRequestURL, type H3Event } from 'h3'
import { normalizeCsrfPath } from './csrf'

/**
 * `Referrer-Policy` de chaque réponse dynamique (middleware `server/middleware/security-headers.ts`). Les autres en-têtes de sécurité sont
 * dans `nuxt.config.ts` (`routeRules['/**']`) : une règle `routeRules` sur le référent s'appliquerait APRÈS le middleware.
 *
 * `no-referrer` sur les liens publics `/r/<jeton>` (et `/en/r/<jeton>`) : le jeton est dans l'URL, il ne doit jamais partir dans un
 * `Referer` vers un autre site. Le chemin est DÉCODÉ avant la comparaison (comme le garde CSRF : `/%72/x` est `/r/x` pour le routeur).
 */
export const PUBLIC_SHARE_REFERRER_POLICY = 'no-referrer'
export const DEFAULT_REFERRER_POLICY = 'strict-origin-when-cross-origin'

export function isPublicShareRoute(path: string): boolean {
  const normalized = normalizeCsrfPath(path)
  return /^\/(?:en\/)?r(?:\/|$)/.test(normalized)
}

export function applyRouteSecurityHeaders(event: H3Event): void {
  const pathname = getRequestURL(event).pathname
  // Nuxt rend la page d'erreur par une requête interne vers `/__nuxt_error` : ne pas écraser la politique déjà posée pour la vraie route
  if (pathname.startsWith('/__nuxt_error')) return
  setResponseHeader(event, 'Referrer-Policy', isPublicShareRoute(pathname) ? PUBLIC_SHARE_REFERRER_POLICY : DEFAULT_REFERRER_POLICY)
}
