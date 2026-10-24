import { describe, expect, it } from 'vitest'
import { assertCronSecret } from '../../server/utils/cron'

const SECRET = 'a-long-random-cron-secret-0123456789'

function thrown(fn: () => void): Record<string, unknown> {
  try {
    fn()
  } catch (error) {
    return error as Record<string, unknown>
  }
  throw new Error('aucune erreur levée')
}

describe('protection des routes cron (CRON_SECRET)', () => {
  it('accepte l\'en-tête Bearer exact envoyé par Vercel', () => {
    expect(() => assertCronSecret(`Bearer ${SECRET}`, SECRET)).not.toThrow()
    expect(() => assertCronSecret(`bearer ${SECRET}`, SECRET)).not.toThrow()
  })

  it('refuse (401) un secret faux, partiel, absent ou mal formé', () => {
    for (const header of [`Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`, 'Bearer faux', SECRET, '', undefined, null, 'Basic abc']) {
      expect(thrown(() => assertCronSecret(header, SECRET)).statusCode).toBe(401)
    }
  })

  it('sans CRON_SECRET (ou trop court), la route est fermée (503), même avec un en-tête', () => {
    expect(thrown(() => assertCronSecret('Bearer ', '')).statusCode).toBe(503)
    expect(thrown(() => assertCronSecret('Bearer abc', 'abc')).statusCode).toBe(503)
    expect(thrown(() => assertCronSecret(undefined, '')).statusCode).toBe(503)
  })
})
