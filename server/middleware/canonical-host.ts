import { defineEventHandler, getRequestHost, sendRedirect, setResponseHeader } from 'h3'
import { canonicalRedirectTarget } from '../../shared/utils/siteUrl'

/**
 * Ancienne adresse de production → `SITE_URL` (301), voir `shared/utils/siteUrl.ts` et DEVELOPER.md § 20.18.
 * Sans `SITE_URL`, ou sur tout autre hôte (prévisualisation Vercel, localhost, nouveau domaine), ne fait rien.
 * 301 gardé une heure en cache seulement : le temps de valider la bascule, on pourra l'allonger ensuite.
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const target = canonicalRedirectTarget({
    siteUrl: config.siteUrl || process.env.SITE_URL,
    host: getRequestHost(event, { xForwardedHost: true }),
    method: event.method,
    path: event.path
  })
  if (!target) return
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  return sendRedirect(event, target, 301)
})
