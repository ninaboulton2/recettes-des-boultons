import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import { describe, expect, it } from 'vitest'
import { csrfGuard, csrfRejection } from '../../server/utils/csrf'
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
    expect(ok({ secFetchSite: 'same-site' })).toBeNull()
    expect(ok({ secFetchSite: 'none' })).toBeNull()
  })

  it('ne touche ni les lectures ni les routes hors /api', () => {
    expect(ok({ method: 'GET', secFetchSite: 'cross-site', origin: 'https://evil.example' })).toBeNull()
    expect(ok({ method: 'HEAD', secFetchSite: 'cross-site' })).toBeNull()
    expect(ok({ method: 'OPTIONS', secFetchSite: 'cross-site' })).toBeNull()
    expect(ok({ path: '/login', secFetchSite: 'cross-site' })).toBeNull()
    expect(ok({ path: '/apiary', secFetchSite: 'cross-site' })).toBeNull()
    expect(ok({ path: '/api', secFetchSite: 'cross-site' })).not.toBeNull()
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
})
