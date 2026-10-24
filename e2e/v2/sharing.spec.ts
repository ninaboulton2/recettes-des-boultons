import { expect, test, type Page } from '@playwright/test'
import { gotoApp } from '../support/app'
import {
  E2E_6B, V2_ACCOUNTS, V2_PASSWORD, cleanup6B, createRecipe, loginV2, makeFriends, prepareAmi, removeFriendship, restoreAmi, signedIn
} from './support'

/**
 * Partage v2 (phase 6B) : à un ami en lecture (puis vérification avec l’autre compte), repartage, retrait en chaîne, lien public
 * (navigation sans compte, ajout après connexion, révocation), Échap ferme la fenêtre.
 */
let recipeId = ''
const TITLE = `${E2E_6B}Secret`

test.beforeAll(async () => {
  await cleanup6B()
  await prepareAmi()
  await makeFriends('admin', 'ami')
  await makeFriends('ami', 'user')
  const { client } = await signedIn('admin')
  recipeId = await createRecipe(client, TITLE, 'private')
})
test.afterAll(async () => {
  await cleanup6B()
  await removeFriendship('admin', 'ami')
  await removeFriendship('ami', 'user')
  await restoreAmi()
})

async function openShare(page: Page): Promise<void> {
  await gotoApp(page, `/recettes/${recipeId}`)
  await page.getByTestId('action-share').click()
  await expect(page.getByTestId('share-modal')).toBeVisible()
}

async function pickPermission(page: Page, label: string): Promise<void> {
  await page.getByTestId('share-permission').click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

test('(6b-share1) lecture à un ami, vérifiée avec l’autre compte ; Échap ferme la fenêtre', async ({ page }) => {
  await loginV2(page, 'admin')
  // Privée : la visibilité par défaut ne la montre pas à user@
  await openShare(page)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('share-modal')).toBeHidden()

  await page.getByTestId('action-share').click()
  await expect(page.getByTestId('share-visibility')).toBeVisible()
  await page.getByTestId('share-recipient').click()
  await page.getByPlaceholder('Chercher par nom (3 lettres au moins)').fill('Ami')
  await page.getByRole('option', { name: /Ami E2E/ }).click()
  await pickPermission(page, 'Lire')
  await page.getByTestId('share-grant-submit').click()
  const rows = page.getByTestId('share-grant-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Ami E2E')
  await expect(rows.first()).toContainText('Lire')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('share-modal')).toBeHidden()

  // L’ami : lecture seule (pas de copie, pas de modification), mais il peut l’ajouter à son carnet et la repartager
  const ami = await page.context().browser()!.newContext({ locale: 'fr-FR' })
  const amiPage = await ami.newPage()
  await loginV2(amiPage, 'ami')
  await gotoApp(amiPage, '/partagees')
  const card = amiPage.getByTestId('shared-recipe').filter({ hasText: TITLE })
  await expect(card).toBeVisible()
  await expect(card.getByTestId('shared-copy')).toHaveCount(0)
  await card.getByRole('link', { name: TITLE }).click()
  await expect(amiPage.getByTestId('action-add-cookbook')).toBeVisible()
  await expect(amiPage.getByTestId('action-copy')).toHaveCount(0)
  await expect(amiPage.getByTestId('action-edit')).toHaveCount(0)
  await expect(amiPage.getByTestId('action-delete')).toHaveCount(0)
  await expect(amiPage.getByTestId('action-share')).toBeVisible()

  // Repartage : à une personne, au plus « Lire » (son propre niveau), jamais un groupe ni « modifier l’original »
  await amiPage.getByTestId('action-share').click()
  const reshare = amiPage.getByTestId('share-reshare')
  await expect(reshare).toBeVisible()
  await amiPage.getByTestId('share-permission').click()
  await expect(amiPage.getByRole('option')).toHaveCount(1)
  await expect(amiPage.getByRole('option', { name: 'Lire', exact: true })).toBeVisible()
  await amiPage.keyboard.press('Escape')
  await amiPage.getByTestId('share-recipient').click()
  await amiPage.getByRole('option', { name: /User/ }).first().click()
  await amiPage.getByTestId('share-reshare-submit').click()
  await expect(amiPage.getByText('Recette repartagée')).toBeVisible()
  await ami.close()

  // Le destinataire du repartage la voit en lecture ; puis l’auteur retire le droit de l’ami : le repartage disparaît avec lui
  const user = await page.context().browser()!.newContext({ locale: 'fr-FR' })
  const userPage = await user.newPage()
  await loginV2(userPage, 'user')
  await gotoApp(userPage, '/partagees')
  await expect(userPage.getByTestId('shared-recipe').filter({ hasText: TITLE })).toBeVisible()

  await openShare(page)
  await expect(rows).toHaveCount(2)
  await expect(page.getByTestId('share-grants-list')).toContainText('repartagé par Ami E2E')
  await rows.filter({ hasText: 'Ami E2E' }).first().getByTestId('share-grant-revoke').click()
  await expect(page.getByTestId('share-grants-empty')).toBeVisible()
  await gotoApp(userPage, '/partagees')
  await expect(userPage.getByTestId('shared-recipe').filter({ hasText: TITLE })).toHaveCount(0)
  await user.close()
})

test('(6b-share2) lien public : lecture sans compte, ajout après connexion, révocation', async ({ page, browser }) => {
  const { client } = await signedIn('admin')
  const publicId = await createRecipe(client, `${E2E_6B}Public`, 'private')
  await loginV2(page, 'admin')
  await gotoApp(page, `/recettes/${publicId}`)
  await page.getByTestId('action-share').click()
  await page.getByTestId('share-link-create').click()
  const link = await page.getByTestId('share-link-input').inputValue()
  expect(link).toMatch(/\/r\/[0-9a-f-]{36}$/)

  // Navigation privée : aucun compte
  const anon = await browser.newContext({ locale: 'fr-FR' })
  const anonPage = await anon.newPage()
  const response = await anonPage.goto(link)
  expect(response?.headers()['x-robots-tag']).toContain('noindex')
  await expect(anonPage.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await expect(anonPage.getByRole('heading', { name: `${E2E_6B}Public` })).toBeVisible()
  await expect(anonPage.getByTestId('public-author')).toHaveText('Admin')
  await expect(anonPage.getByTestId('action-edit')).toHaveCount(0)
  await expect(anonPage.getByTestId('public-cook')).toBeVisible()

  // « Ajouter à mon carnet » → connexion → ajout, puis la fiche
  await anonPage.waitForFunction(() => (document.querySelector('#__nuxt') as unknown as { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } })?.__vue_app__?.$nuxt?.isHydrating === false)
  await anonPage.getByTestId('public-add').click()
  const dialog = anonPage.getByRole('dialog', { name: 'Connexion' })
  await dialog.getByRole('textbox', { name: 'Email' }).fill(V2_ACCOUNTS.ami)
  await dialog.getByRole('textbox', { name: 'Mot de passe' }).fill(V2_PASSWORD)
  await dialog.getByRole('button', { name: 'Se connecter' }).click()
  await expect(anonPage).toHaveURL(new RegExp(`/recettes/${publicId}`))
  await expect(anonPage.getByTestId('action-remove-cookbook')).toBeVisible()
  await expect(anonPage.getByTestId('action-copy')).toBeVisible()   // le lien donne « copie »

  // Révocation : la page devient neutre, mais l’ami garde la recette
  await page.getByTestId('share-link-revoke').click()
  await expect(page.getByTestId('share-link-create')).toBeVisible()
  const gone = await anon.newPage()
  const goneResponse = await gone.goto(link)
  expect(goneResponse?.status()).toBe(404)
  await expect(gone.getByTestId('public-not-found')).toBeVisible()
  await expect(gone.getByText(`${E2E_6B}Public`)).toHaveCount(0)
  const bad = await anon.newPage()
  await bad.goto('/r/pas-un-jeton')
  await expect(bad.getByTestId('public-not-found')).toBeVisible()
  await anon.close()
  const { data } = await (await signedIn('ami')).client.from('recipes').select('id').eq('id', publicId)
  expect(data).toHaveLength(1)
})

test('(6b-share3) carnet vide d’un compte neuf : trois façons de commencer', async ({ page }) => {
  await loginV2(page, 'ami')
  await gotoApp(page, '/recettes')
  // Le lien public du test précédent a mis une recette dans le carnet de l’ami : on la retire pour voir l’état vide
  const { client } = await signedIn('ami')
  await client.from('cookbook_entries').delete().neq('recipe_id', '00000000-0000-0000-0000-000000000000')
  await page.reload()
  await expect(page.getByTestId('cookbook-empty')).toBeVisible()
  await expect(page.getByTestId('empty-create')).toBeVisible()
  await expect(page.getByTestId('empty-import')).toHaveAttribute('href', /traducteur/)
  await expect(page.getByTestId('empty-explore')).toHaveAttribute('href', /partagees/)
})
