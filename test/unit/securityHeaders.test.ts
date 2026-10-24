import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent, getResponseHeader, setResponseHeader } from 'h3'
import { describe, expect, it } from 'vitest'
import { applyRouteSecurityHeaders, isPublicShareRoute } from '../../server/utils/securityHeaders'

function makeEvent(url: string) {
  const req = new IncomingMessage(new Socket())
  req.method = 'GET'
  req.url = url
  req.headers = { host: 'recettes.example.fr' }
  return createEvent(req, new ServerResponse(req))
}

describe('en-têtes propres aux liens publics', () => {
  it('no-referrer sur /r/<jeton> et /en/r/<jeton>, y compris chemin encodé', () => {
    for (const url of ['/r/abc', '/en/r/abc', '/%72/abc', '/en/%72/abc', '/R/abc', '/r/abc/photo?x=1']) {
      const event = makeEvent(url)
      applyRouteSecurityHeaders(event)
      expect(getResponseHeader(event, 'referrer-policy'), url).toBe('no-referrer')
    }
  })

  it('les autres routes gardent strict-origin-when-cross-origin (pas de fuite du no-referrer)', () => {
    for (const url of ['/', '/login', '/recettes/x', '/rejoindre/x', '/api/ai/status', '/robots', '/en/recettes/r/x']) {
      const event = makeEvent(url)
      applyRouteSecurityHeaders(event)
      expect(getResponseHeader(event, 'referrer-policy'), url).toBe('strict-origin-when-cross-origin')
    }
  })

  it('la requête interne de la page d\'erreur de Nuxt n\'écrase pas la politique déjà posée', () => {
    const event = makeEvent('/__nuxt_error?url=%2Fr%2Fabc')
    setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
    applyRouteSecurityHeaders(event)
    expect(getResponseHeader(event, 'referrer-policy')).toBe('no-referrer')
  })

  it('isPublicShareRoute', () => {
    expect(isPublicShareRoute('/r/x')).toBe(true)
    expect(isPublicShareRoute('/rx')).toBe(false)
    expect(isPublicShareRoute('/recettes')).toBe(false)
  })
})
