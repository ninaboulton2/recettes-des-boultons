import { expect, test } from '@playwright/test'
import { LEGACY_HOST } from '../../shared/brand'
import { gotoApp } from '../support/app'
import { loginV2, signedIn } from './support'

/**
 * Marque et domaine (phase 9, DEVELOPER.md § 20.18) :
 *   - manifeste PWA dynamique selon le thème actif (visiteur : Family Cookbook ; groupe Boultons : cocotte) ;
 *   - icône SVG colorée, validée ;
 *   - ancien alias de production → SITE_URL (SITE_URL posé par playwright.v2.config.ts), prévisualisations et localhost intacts ;
 *   - balise canonical.
 */
const SITE_URL = process.env.E2E_SITE_URL ?? 'https://familycookbook.test'

test('(v2-mf1) visiteur : manifeste générique, privé, sans identifiant de personne', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/manifest+json')
  expect(response.headers()['cache-control']).toBe('private, max-age=300')
  expect(response.headers()['vary']).toContain('Cookie')
  const manifest = await response.json()
  expect(manifest.name).toBe('Family Cookbook')
  expect(manifest.short_name).toBe('Cookbook')
  expect(manifest.theme_color).toBe('#c2603e')
  expect(manifest.icons.map((icon: { src: string }) => icon.src)).toContain('/pwa-192x192.png')
})

test('(v2-mf2) membre des Boultons : nom et cocotte des Boultons ; <link rel=manifest> pointe sur la route', async ({ page }) => {
  await loginV2(page, 'user')
  const response = await page.request.get('/manifest.webmanifest')
  const manifest = await response.json()
  expect(manifest.name).toBe('Recettes des Boultons')
  expect(manifest.short_name).toBe('Boultons')
  expect(manifest.icons.map((icon: { src: string }) => icon.src)).toContain('/editions/boultons/pwa-512x512.png')
  expect(response.headers()['cache-control']).toBe('private, max-age=300')

  await gotoApp(page, '/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
})

test('(v2-mf3) icône colorée : couleur #rrggbb seulement', async ({ request }) => {
  const ok = await request.get('/pwa-icon.svg?c=aa4466')
  expect(ok.status()).toBe(200)
  expect(ok.headers()['content-type']).toContain('image/svg+xml')
  expect(await ok.text()).toContain('fill="#aa4466"')
  const maskable = await request.get('/pwa-icon.svg?c=aa4466&m=1')
  expect(await maskable.text()).toContain('scale(1.5)')
  for (const bad of ['', '?c=red', '?c=aa44', '?c=%22%3E%3Cscript%3E']) {
    expect((await request.get(`/pwa-icon.svg${bad}`)).status(), bad).toBe(400)
  }
})

test('(v2-mf4) ancien alias → SITE_URL en 301 ; autres hôtes servis normalement', async ({ request }) => {
  const redirected = await request.get('/recettes?q=tarte', { headers: { 'x-forwarded-host': LEGACY_HOST }, maxRedirects: 0 })
  expect(redirected.status()).toBe(301)
  expect(redirected.headers()['location']).toBe(`${SITE_URL}/recettes?q=tarte`)

  const preview = await request.get('/', { headers: { 'x-forwarded-host': 'recettes-des-boultons-git-feat-x-nina.vercel.app' }, maxRedirects: 0 })
  expect(preview.status()).toBe(200)
  const local = await request.get('/', { maxRedirects: 0 })
  expect(local.status()).toBe(200)
  // Les écritures ne sont jamais redirigées (le garde CSRF les juge ensuite).
  const post = await request.post('/api/ai/status', { headers: { 'x-forwarded-host': LEGACY_HOST }, maxRedirects: 0 })
  expect(post.status()).not.toBe(301)
})

test('(v2-mf5) balise canonical sur SITE_URL', async ({ page }) => {
  await gotoApp(page, '/recettes')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_URL}/recettes`)
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${SITE_URL}/recettes`)
})

test('(v2-mf6) nom personnalisé : en-tête, <title> et manifeste ; vide = Family Cookbook', async ({ page }) => {
  const { client, userId } = await signedIn('user')
  const { data: before } = await client.from('profiles').select('theme_settings, active_theme_group_id').eq('id', userId).single()
  try {
    await loginV2(page, 'user')
    await gotoApp(page, '/reglages')
    const section = page.getByTestId('settings-theme')
    await section.getByTestId('theme-source-personal').check()
    await section.getByTestId('theme-preset-olive').click()
    await section.locator('#theme-name-input').fill('Chez Mamie')
    await expect(page.getByTestId('site-name')).toHaveText('Chez Mamie')
    await section.getByTestId('theme-save').click()
    await expect.poll(async () => {
      const { data } = await client.from('profiles').select('theme_settings').eq('id', userId).single()
      return data?.theme_settings
    }).toEqual({ preset: 'olive', name: 'Chez Mamie' })

    await gotoApp(page, '/')
    await expect(page).toHaveTitle(/Chez Mamie/)
    await expect(page.getByTestId('site-name')).toHaveText('Chez Mamie')
    const manifest = await (await page.request.get('/manifest.webmanifest')).json()
    expect(manifest.name).toBe('Chez Mamie')
    expect(manifest.short_name).toBe('Chez Mamie')
    expect(manifest.icons[0].src).toContain('/pwa-icon.svg?c=')

    // Nom refusé : message, rien d'enregistré avec ce nom
    await gotoApp(page, '/reglages')
    await section.locator('#theme-name-input').fill('<script>')
    await expect(section.getByTestId('theme-name')).toContainText('Lettres, chiffres')
    await expect(page.getByTestId('site-name')).toHaveText('Family Cookbook')
  } finally {
    await client.from('profiles').update({ theme_settings: before?.theme_settings ?? null, active_theme_group_id: before?.active_theme_group_id ?? null }).eq('id', userId)
  }
})
