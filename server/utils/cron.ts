import { timingSafeEqual } from 'node:crypto'
import { createError } from 'h3'

/**
 * Protection des routes `/api/cron/*` (tâches planifiées Vercel, phase 7). Vercel envoie `Authorization: Bearer <CRON_SECRET>`
 * quand la variable d'environnement `CRON_SECRET` existe. Sans secret configuré, les routes REFUSENT tout (503) : jamais ouvertes
 * par oubli. Comparaison à temps constant.
 */
export function assertCronSecret(authorization: string | undefined | null, secret: string): void {
  if (!secret || secret.length < 16) {
    throw createError({ statusCode: 503, statusMessage: 'CRON_SECRET absent ou trop court : route désactivée' })
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '')
  const given = Buffer.from(match?.[1]?.trim() ?? '')
  const expected = Buffer.from(secret)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'Non autorisé' })
  }
}
