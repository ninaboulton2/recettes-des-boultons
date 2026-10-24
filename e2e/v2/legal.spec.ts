import { expect, test } from '@playwright/test'
import { waitForHydration } from '../support/app'
import { loginV2 } from './support'

/** Phase 6E : accueil visiteur générique, pages légales (FR / EN), pied de page (bureau et mobile). */

test('(6e-visitor) accueil visiteur : présentation neutre, deux boutons, aucune recette', async ({ page }) => {
  await page.goto('/')
  await waitForHydration(page)
  const home = page.getByTestId('home-visitor')
  await expect(home.getByRole('heading', { level: 1 })).toContainText('carnet de recettes')
  for (const feature of ['cookbook', 'sharing', 'ai', 'bilingual']) await expect(home.getByTestId(`visitor-feature-${feature}`)).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Boultons')
  await expect(page.getByTestId('site-name')).not.toContainText('Boultons')
  await expect(home.locator('a[href^="/recettes/"]')).toHaveCount(0)

  // « Créer un compte » ouvre l'inscription, avec les liens légaux ; « Se connecter » la connexion
  await home.getByTestId('visitor-signup').click()
  const signup = page.getByRole('dialog', { name: 'Inscription' })
  await expect(signup).toBeVisible()
  await expect(signup.getByTestId('signup-legal')).toContainText('conditions d\'utilisation')
  await expect(signup.getByRole('link', { name: 'politique de confidentialité' })).toHaveAttribute('href', '/confidentialite')
  await page.keyboard.press('Escape')
  await expect(signup).toBeHidden()
  await home.getByTestId('visitor-login').click()
  await expect(page.getByRole('dialog', { name: 'Connexion' })).toBeVisible()
})

test('(6e-visitor2) un visiteur ne voit aucune recette : /recettes ne les liste pas', async ({ page }) => {
  await page.goto('/recettes')
  await waitForHydration(page)
  await expect(page.locator('a[href^="/recettes/"]')).toHaveCount(0)
})

test('(6e-legal) pages légales en français et en anglais, texte de repli du contact', async ({ page }) => {
  const pages: Array<[string, string, string, string]> = [
    ['/mentions-legales', 'Mentions légales', '/en/mentions-legales', 'Legal notice'],
    ['/confidentialite', 'Politique de confidentialité', '/en/confidentialite', 'Privacy policy'],
    ['/conditions', 'Conditions d\'utilisation', '/en/conditions', 'Terms of use'],
    ['/cookies', 'Cookies et suivi', '/en/cookies', 'Cookies and tracking']
  ]
  for (const [fr, frTitle, en, enTitle] of pages) {
    await page.goto(fr)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(frTitle)
    await page.goto(en)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(enTitle)
  }
  await page.goto('/mentions-legales')
  await expect(page.getByTestId('legal-contact').first()).toContainText('Une adresse de contact dédiée sera publiée ici prochainement')
  await expect(page.locator('main')).toContainText('Vercel Inc.')
  await expect(page.locator('main')).toContainText('Supabase, Inc.')
  // aucune page légale ne prétend à un traceur qui n'existe pas
  await page.goto('/cookies')
  await expect(page.locator('main')).toContainText('pas de bandeau de cookies')
  await page.goto('/confidentialite')
  for (const provider of ['Supabase', 'Vercel', 'OpenAI', 'Sentry', 'Google']) await expect(page.locator('main')).toContainText(provider)
})

test('(6e-footer) pied de page : liens légaux au bureau, et sur mobile sans être caché par la barre du bas', async ({ page }) => {
  await page.goto('/mentions-legales')
  await waitForHydration(page)
  const footer = page.getByTestId('app-footer')
  for (const id of ['mentions', 'privacy', 'terms', 'cookies']) await expect(footer.getByTestId(`footer-${id}`)).toBeVisible()
  await expect(footer.getByTestId('footer-contact')).toHaveCount(0)   // pas d'adresse configurée
  await footer.getByTestId('footer-privacy').click()
  await expect(page).toHaveURL(/\/confidentialite$/)

  // Mobile (connecté : la barre du bas existe)
  await loginV2(page, 'user')
  await page.setViewportSize({ width: 375, height: 700 })
  await page.goto('/cookies')
  await waitForHydration(page)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const link = page.getByTestId('footer-terms')
  await expect(link).toBeVisible()
  const bar = await page.getByRole('navigation', { name: 'Navigation', exact: true }).boundingBox()
  const box = await link.boundingBox()
  expect(bar && box && box.y + box.height <= bar.y).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
