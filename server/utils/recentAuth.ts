import { createError } from 'h3'
import { REAUTH_REQUIRED_CODE } from '#shared/utils/social'

/**
 * Authentification récente exigée pour les actions irréversibles (suppression de compte).
 *
 * Le claim `iat` du JWT (date d'émission, en secondes) doit dater de moins de 10 minutes ; sinon 401 avec
 * `data.code = 'REAUTH_REQUIRED'` : l'interface redemande alors la connexion (mot de passe) puis réessaie. Un `iat` absent,
 * invalide ou dans le futur (au-delà de 5 minutes de décalage d'horloge) est traité comme « pas récent ».
 * Limite connue : Supabase renouvelle le jeton d'accès avec un nouvel `iat` à chaque rafraîchissement (jusqu'à toutes les heures) ;
 * la garantie est donc « jeton émis il y a moins de 10 minutes », pas « mot de passe saisi il y a moins de 10 minutes ».
 */

export const REAUTH_MAX_AGE_SECONDS = 10 * 60
const CLOCK_SKEW_SECONDS = 5 * 60

/** Lit `iat` (nombre de secondes) dans des claims JWT. */
export function iatFromClaims(claims: Record<string, unknown> | null | undefined): number | undefined {
  const value = claims?.iat
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function isRecentAuth(iat: number | undefined, nowMs: number = Date.now(), maxAgeSeconds: number = REAUTH_MAX_AGE_SECONDS): boolean {
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return false
  const age = nowMs / 1000 - iat
  return age >= -CLOCK_SKEW_SECONDS && age <= maxAgeSeconds
}

export function assertRecentAuth(iat: number | undefined, nowMs: number = Date.now(), maxAgeSeconds: number = REAUTH_MAX_AGE_SECONDS): void {
  if (!isRecentAuth(iat, nowMs, maxAgeSeconds)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Reconnectez-vous pour confirmer cette action',
      data: { code: REAUTH_REQUIRED_CODE }
    })
  }
}
