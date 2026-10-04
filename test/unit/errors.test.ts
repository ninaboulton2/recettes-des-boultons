import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import { GENERIC_ERROR_MESSAGE, handleApiError, throwSupabaseError } from '../../server/utils/errors'

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }))
vi.mock('@sentry/nuxt', () => sentry)

/** Exécute `fn` (qui lève toujours) et renvoie l'erreur levée. */
function thrown(fn: () => never): Record<string, unknown> {
  try {
    fn()
  } catch (error) {
    return error as Record<string, unknown>
  }
  throw new Error('aucune erreur levée')
}

describe('server/utils/errors : envoi à Sentry des erreurs 500', () => {
  beforeEach(() => {
    sentry.captureException.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('handleApiError : 500 générique, cause conservée, capture taguée', () => {
    const original = new Error('connexion refusée')
    const error = thrown(() => handleApiError(original, 'add-recipe'))
    expect(error.statusCode).toBe(500)
    expect(error.statusMessage).toBe(GENERIC_ERROR_MESSAGE)
    expect(error.cause).toBe(original)
    expect(sentry.captureException).toHaveBeenCalledWith(original, { tags: { api: 'add-recipe' } })
  })

  it('handleApiError : une erreur métier (< 500) n\'est ni modifiée ni envoyée', () => {
    const business = createError({ statusCode: 404, statusMessage: 'Recette introuvable' })
    expect(thrown(() => handleApiError(business, 'update-recipe'))).toBe(business)
    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it('throwSupabaseError : code inconnu → 500 générique et capture', () => {
    const original = { code: 'XX000', message: 'internal error', details: null, hint: null }
    const error = thrown(() => throwSupabaseError(original, 'shopping-items'))
    expect(error.statusCode).toBe(500)
    expect(error.statusMessage).toBe(GENERIC_ERROR_MESSAGE)
    expect(error.cause).toBe(original)
    expect(sentry.captureException).toHaveBeenCalledWith(original, { tags: { api: 'shopping-items' } })
  })

  it('throwSupabaseError puis handleApiError (catch final) : une seule capture', () => {
    const original = { code: 'XX000', message: 'internal error' }
    const fromSupabase = thrown(() => throwSupabaseError(original, 'shopping-lists.post'))
    const final = thrown(() => handleApiError(fromSupabase, 'shopping-lists.post'))
    expect(final).toBe(fromSupabase)
    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('throwSupabaseError : codes métier exposés sans capture', () => {
    expect(thrown(() => throwSupabaseError({ code: '22023', message: 'Unité inconnue : xx' }, 'ctx')).statusCode).toBe(400)
    expect(thrown(() => throwSupabaseError({ code: 'P0002', message: 'Recette introuvable' }, 'ctx')).statusCode).toBe(404)
    expect(thrown(() => throwSupabaseError({ code: '42501' }, 'ctx')).statusCode).toBe(403)
    expect(thrown(() => throwSupabaseError({ code: '23505' }, 'ctx')).statusCode).toBe(409)
    expect(sentry.captureException).not.toHaveBeenCalled()
  })
})

describe('server/utils/errors : sans DSN (SDK non initialisé)', () => {
  it('captureException réel ne lève pas et n\'envoie rien', async () => {
    const real = await vi.importActual<typeof import('@sentry/nuxt')>('@sentry/nuxt')
    expect(real.getClient()).toBeUndefined()
    expect(() => real.captureException(new Error('sans DSN'))).not.toThrow()
  })
})
