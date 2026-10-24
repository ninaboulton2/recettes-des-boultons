import { expect, test } from '@playwright/test'

/**
 * En-têtes de sécurité (nuxt.config.ts `routeRules` + `server/middleware/security-headers.ts`, DEVELOPER.md § 20.16) : valables en v1
 * comme en v2. Le Picker Google Drive n'est pas concerné : c'est une iframe de Google DANS notre page (translator-drive.spec.ts).
 * NB : les réponses d'erreur (404, 401…) portent les en-têtes par défaut de Nitro (`no-referrer`, CSP `script-src 'none'` ou
 * `frame-ancestors 'none'`) : seules les pages en 200 servent à vérifier la politique du référent.
 */
test('pages : non encadrables, nosniff, referrer limité, micro réservé à notre origine', async ({ request }) => {
  for (const path of ['/', '/recettes', '/en']) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
    const headers = response.headers()
    expect(headers['x-frame-options'], path).toBe('DENY')
    expect(headers['content-security-policy'], path).toBe('frame-ancestors \'none\'')
    expect(headers['x-content-type-options'], path).toBe('nosniff')
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy'], path).toContain('microphone=(self)')
    expect(headers['permissions-policy'], path).toContain('camera=()')
  }
})

test('API (même en erreur) : non encadrable et nosniff', async ({ request }) => {
  const headers = (await request.get('/api/ai/status')).headers()
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
})

test('les liens publics /r/<jeton> n\'envoient aucun référent', async ({ request }) => {
  for (const path of ['/r/00000000-0000-4000-8000-000000000000', '/en/r/00000000-0000-4000-8000-000000000000', '/%72/00000000-0000-4000-8000-000000000000']) {
    const headers = (await request.get(path)).headers()
    expect(headers['referrer-policy'], path).toBe('no-referrer')
    expect(headers['x-frame-options'], path).toBe('DENY')
  }
})
