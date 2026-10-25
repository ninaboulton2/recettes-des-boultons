import { LEGACY_HOST } from '../brand'

/**
 * Adresse canonique du site (`SITE_URL`, ex. `https://familycookbook.fr`) : décisions pures, testées sans Nuxt.
 */

/** Origine (`https://hôte[:port]`) d'une valeur de `SITE_URL` ; `null` si vide, mal formée ou ni http ni https. Chemin et requête ignorés. */
export function normalizeSiteUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}

/** Nom d'hôte seul : minuscules, sans port ni point final. `''` si absent. */
export function hostnameOf(hostHeader: unknown): string {
  if (typeof hostHeader !== 'string') return ''
  const first = hostHeader.split(',')[0]?.trim().toLowerCase() ?? ''
  const withoutPort = first.startsWith('[') ? first.slice(0, first.indexOf(']') + 1) : first.replace(/:\d+$/, '')
  return withoutPort.replace(/\.$/, '')
}

export interface CanonicalRedirectInput {
  /** `SITE_URL` brut (peut être vide). */
  siteUrl: unknown
  /** Hôte de la requête (en-tête `Host` ou `X-Forwarded-Host`). */
  host: unknown
  method: string
  /** Chemin + requête, tel que reçu (`/recettes?x=1`). */
  path: string
}

/**
 * Adresse vers laquelle renvoyer la requête (301), ou `null` pour la servir normalement.
 *
 * Redirige seulement si TOUT est vrai : `SITE_URL` est valide ; l'hôte demandé est EXACTEMENT l'ancien alias de production
 * (`LEGACY_HOST`) ; cet alias n'est pas lui-même `SITE_URL` (pas de boucle) ; la méthode est GET ou HEAD ; ce n'est pas une tâche
 * planifiée (`/api/cron/*`). Les déploiements de prévisualisation (`recettes-des-boultons-git-….vercel.app`), `localhost` et tout
 * autre hôte ne sont jamais redirigés. `SITE_URL` absent : aucune redirection.
 */
export function canonicalRedirectTarget(input: CanonicalRedirectInput): string | null {
  const origin = normalizeSiteUrl(input.siteUrl)
  if (!origin) return null
  const host = hostnameOf(input.host)
  if (host !== LEGACY_HOST) return null
  if (hostnameOf(new URL(origin).host) === LEGACY_HOST) return null
  const method = input.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return null
  if (!input.path.startsWith('/')) return null
  if (/^\/api\/cron(?:\/|\?|$)/.test(input.path)) return null
  // Concaténation (pas de résolution d'URL) : `//autre.site` reste un chemin sur notre origine.
  return `${origin}${input.path}`
}

/**
 * Origine à mettre dans les liens que l'on copie ou partage (lien public `/r/<jeton>`, invitation de groupe).
 * `SITE_URL` si on est sur le site de production (son hôte, ou l'ancien alias) ; sinon l'origine courante, pour que localhost et
 * les prévisualisations produisent des liens qui marchent chez eux.
 */
export function publicOrigin(siteUrl: unknown, currentOrigin: string): string {
  const origin = normalizeSiteUrl(siteUrl)
  if (!origin) return currentOrigin
  let currentHost: string
  try {
    currentHost = hostnameOf(new URL(currentOrigin).host)
  } catch {
    return currentOrigin
  }
  return currentHost === hostnameOf(new URL(origin).host) || currentHost === LEGACY_HOST ? origin : currentOrigin
}
