import { expect, test, type Page } from '@playwright/test'
import { e2eName, storageStatePath } from './support/accounts'
import { gotoApp, waitForHydration } from './support/app'
import { signedInClient } from './support/supabase'

test.use({ storageState: storageStatePath('user') })

/**
 * Courses hors ligne (PWA) : copie des listes dans localStorage à chaque
 * chargement, affichée en lecture seule par la page des courses hors ligne
 * (le bandeau <OfflineBanner /> ne garde que l'alerte).
 * Le rechargement hors ligne (page servie par le service worker) n'est
 * testable que sur le build de production (E2E_SERVER=preview, CI) : pas de
 * service worker en `nuxt dev`.
 */
let listName: string
const itemName = 'E2E_article_hors_ligne'

test.beforeEach(async ({}, testInfo) => {
  listName = e2eName('horsligne', testInfo.project.name)
  const { client, userId } = await signedInClient('user')
  const { data, error } = await client.from('shopping_lists').insert({ name: listName, user_id: userId }).select('id').single()
  if (error) throw error
  const inserted = await client.from('shopping_items').insert({ list_id: data.id, name: itemName, amount: '2', unit: 'kg' })
  if (inserted.error) throw inserted.error
  await client.auth.signOut({ scope: 'local' })
})

test.afterEach(async ({ context }) => {
  await context.setOffline(false)
  const { client } = await signedInClient('user')
  await client.from('shopping_lists').delete().eq('name', listName)
  await client.auth.signOut({ scope: 'local' })
})

async function expectOfflineCopy(page: Page): Promise<void> {
  const banner = page.getByTestId('offline-banner')
  await expect(banner.getByText('Vous êtes hors ligne')).toBeVisible()
  // La copie est affichée par la page (à la place des listes), une seule fois.
  const copies = page.getByRole('region', { name: 'Mes courses (hors ligne)' })
  await expect(copies).toHaveCount(1)
  await expect(banner.getByRole('region', { name: 'Mes courses (hors ligne)' })).toHaveCount(0)
  const copy = page.getByRole('main').getByRole('region', { name: 'Mes courses (hors ligne)' })
  await expect(copy.getByRole('heading', { name: listName })).toBeVisible()
  await expect(copy.getByText(itemName)).toBeVisible()
}

test('courses : copie en lecture seule quand le réseau tombe', async ({ page, context }) => {
  await gotoApp(page, '/courses')
  await expect(page.getByRole('heading', { level: 1, name: 'Listes de courses' })).toBeVisible()
  // La copie est écrite après le chargement des listes.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('offline:shopping:v1') ?? '')).toContain(itemName)

  await context.setOffline(true)
  await expectOfflineCopy(page)

  await context.setOffline(false)
  await expect(page.getByTestId('offline-banner')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Mes courses (hors ligne)' })).toHaveCount(0)
})

test('courses : rechargement hors ligne servi par le service worker', async ({ page, context }) => {
  test.skip((process.env.E2E_SERVER ?? (process.env.CI ? 'preview' : 'dev')) !== 'preview', 'Service worker absent en nuxt dev')

  await gotoApp(page, '/courses')
  // Le service worker prend le contrôle (clientsClaim), puis un rechargement
  // en ligne place la page dans le cache « pages ».
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready
    return navigator.serviceWorker.controller !== null
  }, undefined, { timeout: 30_000 })
  await page.reload()
  await waitForHydration(page)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('offline:shopping:v1') ?? '')).toContain(itemName)

  await context.setOffline(true)
  await page.reload()
  await waitForHydration(page)
  await expectOfflineCopy(page)
})
