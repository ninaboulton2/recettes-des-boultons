import { expect, test } from '@playwright/test'
import { gotoApp } from '../support/app'
import { E2E_6C, createGroupWith, loginV2, signedIn, sqlLocal } from './support'

/**
 * Nom du site = « Titre du carnet » de la personne (jamais le nom d'un groupe ni du thème).
 * user@local.test est membre de « Les Boultons » (thème actif = préréglage `boultons`) et, ici, d'un second groupe.
 * Son profil est remis comme avant.
 */
const SECOND_GROUP = `${E2E_6C}SiteName Sum`
const OWN_TITLE = 'Recettes des Boultons et des Sum'
let before: { cookbook_title: string | null, active_theme_group_id: string | null }

test.beforeAll(async () => {
  const { client, userId } = await signedIn('user')
  const { data } = await client.from('profiles').select('cookbook_title, active_theme_group_id').eq('id', userId).single()
  before = data as typeof before
  expect(before.active_theme_group_id, 'user@local.test doit avoir le thème du groupe Boultons (setup_v2.sh)').toBeTruthy()
  await createGroupWith('admin', SECOND_GROUP, ['user'])
})

test.afterAll(async () => {
  const { client, userId } = await signedIn('user')
  await client.from('profiles').update({ cookbook_title: before.cookbook_title, active_theme_group_id: before.active_theme_group_id }).eq('id', userId)
  sqlLocal(`delete from public.groups where name = '${SECOND_GROUP}';`)
})

test('(v2-sn1) deux groupes, thème Boultons : l\'en-tête et le h1 montrent le titre du carnet, pas un nom de groupe', async ({ page }) => {
  const { client, userId } = await signedIn('user')
  await client.from('profiles').update({ cookbook_title: OWN_TITLE }).eq('id', userId)
  await loginV2(page, 'user')
  await gotoApp(page, '/recettes')

  // Le look reste celui du groupe Boultons (cocotte), le nom est celui du carnet.
  await expect(page.locator('html')).toHaveAttribute('data-edition', 'boultons')
  await expect(page.getByTestId('site-logo')).toBeVisible()
  await expect(page.getByTestId('site-name')).toHaveText(OWN_TITLE)
  await expect(page.locator('h1').first()).toHaveText(OWN_TITLE)
  await expect(page).toHaveTitle(new RegExp(OWN_TITLE))
  await expect(page.getByTestId('site-name')).not.toContainText(SECOND_GROUP)

  // Accueil Boultons : le héros garde son look, le titre suit le carnet.
  await gotoApp(page, '/')
  await expect(page.getByTestId('home-hero')).toBeVisible()
  await expect(page.getByTestId('home-hero').locator('h1')).toHaveText(OWN_TITLE)
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  expect(manifest.name).toBe(OWN_TITLE)
})

test('(v2-sn2) changer le titre dans les réglages met à jour l\'en-tête ; vide = Family Cookbook', async ({ page }) => {
  await loginV2(page, 'user')
  await gotoApp(page, '/reglages')
  await page.getByTestId('settings-cookbook-title').fill('Le carnet de test')
  await page.getByTestId('profile-save').click()
  await expect(page.getByTestId('site-name')).toHaveText('Le carnet de test')
  await page.getByTestId('settings-cookbook-title').fill('')
  await page.getByTestId('profile-save').click()
  await expect(page.getByTestId('site-name')).toHaveText('Family Cookbook')
})

test('(v2-sn3) visiteur : Family Cookbook', async ({ page }) => {
  await gotoApp(page, '/')
  await expect(page.getByTestId('site-name')).toHaveText('Family Cookbook')
})
