import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import { describe, expect, it } from 'vitest'
import { CSRF_EXEMPT_PATHS, csrfGuard, csrfRejection, normalizeCsrfPath } from '../../server/utils/csrf'
import middleware from '../../server/middleware/csrf'

const HOST = 'recettes.example.fr'

function ok(overrides: Partial<Parameters<typeof csrfRejection>[0]> = {}) {
  return csrfRejection({ method: 'POST', path: '/api/account/delete', host: HOST, ...overrides })
}

describe('garde CSRF (logique)', () => {
  it('refuse Sec-Fetch-Site: cross-site sur une écriture /api', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      expect(ok({ method, secFetchSite: 'cross-site' })).not.toBeNull()
    }
  })

  it('refuse une origine différente de l\'hôte (même sans Sec-Fetch-Site)', () => {
    expect(ok({ origin: 'https://evil.example' })).not.toBeNull()
    expect(ok({ origin: 'https://recettes.example.fr.evil.example' })).not.toBeNull()
    expect(ok({ origin: 'http://recettes.example.fr:8080' })).not.toBeNull()   // autre port = autre hôte
    expect(ok({ origin: 'null' })).not.toBeNull()
    expect(ok({ origin: 'pas une url' })).not.toBeNull()
  })

  it('accepte la même origine, y compris derrière un proxy (X-Forwarded-Host)', () => {
    expect(ok({ origin: `https://${HOST}`, secFetchSite: 'same-origin' })).toBeNull()
    expect(ok({ origin: 'https://RECETTES.example.fr' })).toBeNull()
    expect(ok({ host: 'interne:3000', forwardedHost: HOST, origin: `https://${HOST}` })).toBeNull()
    expect(ok({ host: 'localhost:3000', origin: 'http://localhost:3000' })).toBeNull()
  })

  it('accepte Origin absent (tests serveur, scripts, Playwright request) et les valeurs same-site / none', () => {
    expect(ok()).toBeNull()
    expect(ok({ secFetchSite: 'same-origin' })).toBeNull()
    expect(ok({ secFetchSite: 'none' })).toBeNull()
    expect(ok({ secFetchSite: 'same-site', origin: `https://${HOST}` })).toBeNull()   // même origine exacte
  })

  it('same-site (autre sous-domaine) est refusé, sauf même origine exacte', () => {
    expect(ok({ secFetchSite: 'same-site', origin: 'https://autre.example.fr' })).not.toBeNull()
    expect(ok({ secFetchSite: 'same-site', origin: 'https://evil.recettes.example.fr' })).not.toBeNull()
    expect(ok({ secFetchSite: 'same-site' })).not.toBeNull()   // pas d'Origin : on ne peut pas prouver la même origine
  })

  it('contrôle toute écriture, quel que soit le chemin (plus de test sur /api)', () => {
    expect(ok({ path: '/login', secFetchSite: 'cross-site' })).not.toBeNull()
    expect(ok({ path: '/apiary', secFetchSite: 'cross-site' })).not.toBeNull()
    expect(ok({ path: '/%61pi/x', secFetchSite: 'cross-site' })).not.toBeNull()
    expect(ok({ path: '/api', secFetchSite: 'cross-site' })).not.toBeNull()
  })

  it('ne touche pas les lectures', () => {
    expect(ok({ method: 'GET', secFetchSite: 'cross-site', origin: 'https://evil.example' })).toBeNull()
    expect(ok({ method: 'HEAD', secFetchSite: 'cross-site' })).toBeNull()
    expect(ok({ method: 'OPTIONS', secFetchSite: 'cross-site' })).toBeNull()
  })

  it('la liste blanche compare des chemins décodés', () => {
    expect(normalizeCsrfPath('/%61pi/X/')).toBe('/api/x')
    expect(normalizeCsrfPath('/%2561pi/x')).toBe('/api/x')   // double encodage
    expect(normalizeCsrfPath('/%E0%A4%A')).toBe('/%e0%a4%a')   // séquence invalide : laissée telle quelle
    expect(CSRF_EXEMPT_PATHS).toEqual([])
  })

  it('les routes IA et Drive existantes passent en même origine', () => {
    for (const path of ['/api/extract-recipe', '/api/transcribe-recipe', '/api/translate-recipe', '/api/add-recipe', '/api/update-recipe']) {
      expect(ok({ path, method: path.includes('update') ? 'PUT' : 'POST', origin: `https://${HOST}`, secFetchSite: 'same-origin' })).toBeNull()
    }
  })
})

function makeEvent(method: string, url: string, headers: Record<string, string>) {
  const req = new IncomingMessage(new Socket())
  req.method = method
  req.url = url
  req.headers = { host: HOST, ...headers }
  return createEvent(req, new ServerResponse(req))
}

describe('middleware server/middleware/csrf.ts', () => {
  it('403 pour une écriture cross-site, sans toucher à la réponse des autres', async () => {
    const blocked = makeEvent('POST', '/api/account/delete', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' })
    expect(() => csrfGuard(blocked)).toThrowError(expect.objectContaining({ statusCode: 403 }))
    await expect(Promise.resolve().then(() => middleware(blocked))).rejects.toMatchObject({ statusCode: 403 })

    const sameOrigin = makeEvent('POST', '/api/account/delete', { 'sec-fetch-site': 'same-origin', origin: `https://${HOST}` })
    expect(() => csrfGuard(sameOrigin)).not.toThrow()
    await expect(Promise.resolve().then(() => middleware(sameOrigin))).resolves.toBeUndefined()

    const noOrigin = makeEvent('DELETE', '/api/delete-recipe?id=1', {})
    expect(() => csrfGuard(noOrigin)).not.toThrow()

    const read = makeEvent('GET', '/api/recipes', { 'sec-fetch-site': 'cross-site' })
    expect(() => csrfGuard(read)).not.toThrow()
  })

  it.each([
    ['/%61pi/x'],
    ['/ap%69/x'],
    ['/api/%78'],
    ['/%2561pi/x'],
    ['/login'],
    ['/__nuxt_island/x']
  ])('403 sur un vrai événement h3, chemin encodé ou hors /api : POST %s cross-site', (url) => {
    expect(() => csrfGuard(makeEvent('POST', url, { 'sec-fetch-site': 'cross-site' }))).toThrowError(expect.objectContaining({ statusCode: 403 }))
    expect(() => csrfGuard(makeEvent('DELETE', url, { origin: 'https://evil.example' }))).toThrowError(expect.objectContaining({ statusCode: 403 }))
  })

  it('403 pour Origin: null, 403 pour same-site d\'un autre sous-domaine', () => {
    expect(() => csrfGuard(makeEvent('POST', '/%61pi/x', { origin: 'null' }))).toThrowError(expect.objectContaining({ statusCode: 403 }))
    expect(() => csrfGuard(makeEvent('POST', '/api/x', { origin: 'https://autre.example.fr', 'sec-fetch-site': 'same-site' }))).toThrowError(expect.objectContaining({ statusCode: 403 }))
  })

  it('accepte la même origine et l\'absence de Origin / Sec-Fetch-Site, sur un chemin encodé aussi', () => {
    expect(() => csrfGuard(makeEvent('POST', '/%61pi/x', { origin: `https://${HOST}`, 'sec-fetch-site': 'same-origin' }))).not.toThrow()
    expect(() => csrfGuard(makeEvent('POST', '/api/%78', { origin: `https://${HOST}`, 'sec-fetch-site': 'same-site' }))).not.toThrow()
    expect(() => csrfGuard(makeEvent('POST', '/ap%69/x', {}))).not.toThrow()
  })
})
