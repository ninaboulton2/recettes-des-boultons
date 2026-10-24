import { describe, expect, it } from 'vitest'
import { assertRecentAuth, iatFromClaims, isRecentAuth, REAUTH_MAX_AGE_SECONDS } from '../../server/utils/recentAuth'

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)
const nowSeconds = NOW / 1000

function thrown(fn: () => void): Record<string, unknown> {
  try {
    fn()
  } catch (error) {
    return error as Record<string, unknown>
  }
  throw new Error('aucune erreur levée')
}

describe('authentification récente (claim iat)', () => {
  it('accepte un jeton émis il y a moins de 10 minutes', () => {
    expect(isRecentAuth(nowSeconds - 5, NOW)).toBe(true)
    expect(isRecentAuth(nowSeconds - 599, NOW)).toBe(true)
    expect(isRecentAuth(nowSeconds - REAUTH_MAX_AGE_SECONDS, NOW)).toBe(true)
    expect(() => assertRecentAuth(nowSeconds - 60, NOW)).not.toThrow()
  })

  it('refuse un jeton de plus de 10 minutes : 401 REAUTH_REQUIRED', () => {
    expect(isRecentAuth(nowSeconds - 601, NOW)).toBe(false)
    const error = thrown(() => assertRecentAuth(nowSeconds - 3600, NOW))
    expect(error.statusCode).toBe(401)
    expect(error.statusMessage).toMatch(/Reconnectez-vous/)
    expect(error.data).toEqual({ code: 'REAUTH_REQUIRED' })
  })

  it('refuse un iat absent, invalide ou très dans le futur', () => {
    expect(thrown(() => assertRecentAuth(undefined, NOW)).statusCode).toBe(401)
    expect(isRecentAuth(Number.NaN, NOW)).toBe(false)
    expect(isRecentAuth(nowSeconds + 3600, NOW)).toBe(false)
    expect(isRecentAuth(nowSeconds + 30, NOW)).toBe(true)   // petit décalage d'horloge toléré
  })

  it('le délai est paramétrable', () => {
    expect(isRecentAuth(nowSeconds - 90, NOW, 60)).toBe(false)
    expect(isRecentAuth(nowSeconds - 30, NOW, 60)).toBe(true)
  })
})

describe('iatFromClaims', () => {
  it('lit un nombre, ignore le reste', () => {
    expect(iatFromClaims({ iat: 1_700_000_000 })).toBe(1_700_000_000)
    expect(iatFromClaims({ iat: '1700000000' })).toBeUndefined()
    expect(iatFromClaims({})).toBeUndefined()
    expect(iatFromClaims(null)).toBeUndefined()
  })
})
