import { expect, test } from '@playwright/test'
import { gotoApp } from '../support/app'
import { E2E_6B, cleanup6B, createRecipe, loginV2, signedIn } from './support'

/**
 * Carnet v2 (phase 6B) : copie d'une recette d'un co-membre, ajout et retrait, « Tout ajouter » depuis Explorer,
 * provenance des cartes, état vide. `admin@` écrit, `user@` lit (ils sont dans le même groupe).
 */
let adminId = ''
let recipeId = ''
let secondId = ''
const TITLE = `${E2E_6B}Gratin`
const SECOND = `${E2E_6B}Quiche`

test.beforeAll(async () => {
  await cleanup6B()
  const { client, userId } = await signedIn('admin')
  adminId = userId
  recipeId = await createRecipe(client, TITLE, 'groups')
  secondId = await createRecipe(client, SECOND, 'groups')
})
test.afterAll(async () => { await cleanup6B() })

test('(6b-copy) copie modifiable d’une recette d’un co-membre : « Inspirée de », badge « Copie de »', async ({ page }) => {
  await loginV2(page, 'user')
  await gotoApp(page, `/recettes/${recipeId}`)
  await expect(page.getByTestId('action-copy')).toBeVisible()
  await expect(page.getByTestId('action-add-cookbook')).toBeVisible()
  // Pas l’auteur : ni modifier, ni supprimer, ni gestion du partage
  await expect(page.getByTestId('action-edit')).toHaveCount(0)
  await expect(page.getByTestId('action-delete')).toHaveCount(0)
  await expect(page.getByTestId('action-share')).toHaveCount(0)
  await expect(page.getByTestId('recipe-author')).toContainText('Admin')

  await page.getByTestId('action-copy').click()
  await expect(page).not.toHaveURL(new RegExp(recipeId))
  await expect(page.getByTestId('recipe-inspired')).toContainText(`Inspirée de ${TITLE}`)
  // C’est devenu MA recette : je peux la modifier, la supprimer et la partager
  await expect(page.getByTestId('action-edit')).toBeVisible()
  await expect(page.getByTestId('action-delete')).toBeVisible()
  await expect(page.getByTestId('action-share')).toBeVisible()

  await gotoApp(page, '/recettes')
  const copyCard = page.getByTestId('recipe-provenance').filter({ hasText: `Copie de ${TITLE}` })
  await expect(copyCard).toBeVisible()
})

test('(6b-add) ajouter à mon carnet puis retirer ; badge « Ajoutée — de Admin »', async ({ page }) => {
  await loginV2(page, 'user')
  await gotoApp(page, `/recettes/${secondId}`)
  await page.getByTestId('action-add-cookbook').click()
  await expect(page.getByTestId('action-remove-cookbook')).toBeVisible()

  await gotoApp(page, '/recettes')
  const card = page.getByTestId('recipe-grid').locator('article', { hasText: SECOND })
  await expect(card.getByTestId('recipe-provenance')).toContainText('Ajoutée — de Admin')
  await expect(card.getByTestId('recipe-provenance')).toHaveAttribute('data-provenance', 'added')

  await card.getByRole('link', { name: SECOND }).click()
  await page.getByTestId('action-remove-cookbook').click()
  await expect(page.getByTestId('action-add-cookbook')).toBeVisible()
  await gotoApp(page, '/recettes')
  await expect(page.getByTestId('recipe-grid').locator('article', { hasText: SECOND })).toHaveCount(0)
})

test('(6b-explore) Explorer : « Ajouter », « Déjà dans mon carnet » et « Tout ajouter » ; la bannière disparaît', async ({ page }) => {
  await loginV2(page, 'user')
  // La bannière « Explorer les recettes de Admin » est dans Mon carnet (pas sur l'accueil) et mène à la page
  await expect(page.getByTestId('prompt-banner')).toHaveCount(0)
  await gotoApp(page, '/recettes')
  await expect(page.getByTestId('prompt-banner').filter({ hasText: 'Explorer les recettes de Admin' })).toBeVisible()
  await page.getByRole('link', { name: 'Explorer', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/explorer/${adminId}`))
  await expect(page.getByTestId('explore-title')).toBeVisible()

  const grid = page.getByTestId('explore-grid')
  const first = grid.getByTestId('shared-recipe').filter({ hasText: TITLE })
  await first.getByTestId('explore-add').click()
  await expect(first.getByTestId('in-cookbook')).toBeVisible()
  const second = grid.getByTestId('shared-recipe').filter({ hasText: SECOND })
  await expect(second.getByTestId('explore-add')).toBeVisible()

  await page.getByTestId('explore-add-all').click()
  await expect(second.getByTestId('in-cookbook')).toBeVisible()
  await expect(page.getByTestId('explore-all-added')).toBeVisible()

  await gotoApp(page, '/recettes')
  await expect(page.getByTestId('cookbook-page')).toBeVisible()
  await expect(page.getByTestId('prompt-banner').filter({ hasText: 'Explorer les recettes de Admin' })).toHaveCount(0)
})

test('(6b-shared) Partagées avec moi : « Ajouter à mon carnet » (la carte disparaît de la liste)', async ({ page }) => {
  // user@ n’a rien ajouté : la recette de admin y est (partage « mes groupes », niveau copie)
  const { client } = await signedIn('user')
  await client.from('cookbook_entries').delete().in('recipe_id', [recipeId, secondId])
  await loginV2(page, 'user')
  await gotoApp(page, '/partagees')
  const card = page.getByTestId('shared-grid').getByTestId('shared-recipe').filter({ hasText: SECOND })
  await expect(card).toContainText('De Admin, via un groupe')
  await expect(card.getByTestId('shared-copy')).toBeVisible()
  await card.getByTestId('shared-add').click()
  await expect(card).toHaveCount(0)
})
