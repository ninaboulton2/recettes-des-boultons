import { expect, test } from '@playwright/test'

/**
 * En-têtes de sécurité (nuxt.config.ts `routeRules`, DEVELOPER.md § 20.16) : valables en v1 comme en v2, sur les pages et sur l'API.
 * Le Picker Google Drive n'est pas concerné : c'est une iframe de Google DANS notre page (translator-drive.spec.ts le vérifie).
 */
const EXPECTED = {
  'x-frame-options': 'DENY',
  'content-security-policy': 'frame-ancestors \'none\'',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin'
}

test('pages et API : non encadrables, nosniff, referrer limité, micro réservé à notre origine', async ({ request }) => {
  for (const path of ['/', '/login', '/api/ai/status']) {
    const headers = (await request.get(path)).headers()
    for (const [name, value] of Object.entries(EXPECTED)) expect(headers[name], `${path} ${name}`).toBe(value)
    expect(headers['permissions-policy'], path).toContain('microphone=(self)')
    expect(headers['permissions-policy'], path).toContain('camera=()')
  }
})

test('les liens publics /r/<jeton> n\'envoient aucun référent', async ({ request }) => {
  for (const path of ['/r/00000000-0000-4000-8000-000000000000', '/en/r/00000000-0000-4000-8000-000000000000']) {
    const headers = (await request.get(path)).headers()
    expect(headers['referrer-policy'], path).toBe('no-referrer')
    expect(headers['x-frame-options'], path).toBe('DENY')
  }
})
