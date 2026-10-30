import { expect, test } from '@playwright/test'
import { gotoApp } from '../support/app'
import { E2E_6B, createRecipe, deleteOwnRecipes, loginV2, signedIn } from './support'

/**
 * Courses v2 (retour de test n° 2, points 4, 6 et 7) : « Changer de rayon » (retenu pour les futures listes), plus de « Mode magasin »,
 * liste créée automatiquement depuis « ajouter aux courses » quand il n'y en a aucune. Prérequis : migration 0032 sur la base locale.
 */
const LIST = 'E2E_AISLE_liste'
const LIST_B = 'E2E_AISLE_liste_b'

async function cleanup(): Promise<void> {
  const { client, userId } = await signedIn('user')
  await client.from('shopping_lists').delete().in('name', [LIST, LIST_B])
  await client.from('shopping_aisle_prefs').delete().eq('user_id', userId)
  await client.auth.signOut({ scope: 'local' })
}

test.beforeAll(cleanup)
test.afterAll(cleanup)

async function newList(name: string, itemName: string): Promise<string> {
  const { client, userId } = await signedIn('user')
  const list = await client.from('shopping_lists').insert({ name, user_id: userId }).select('id').single()
  expect(list.error).toBeNull()
  const id = (list.data as { id: string }).id
  expect((await client.from('shopping_items').insert({ list_id: id, name: itemName }).select('id')).error).toBeNull()
  await client.auth.signOut({ scope: 'local' })
  return id
}

test('(v2-aisle1) changer l\'article de rayon : persistant, retenu pour la prochaine liste, pas de Mode magasin', async ({ page }) => {
  await newList(LIST, 'Tomates E2E')
  await loginV2(page, 'user')
  await gotoApp(page, '/courses')
  await expect(page.getByRole('switch', { name: 'Mode magasin' })).toHaveCount(0)
  await page.getByRole('switch', { name: 'Par rayon' }).click()
  const row = (name: string) => page.locator('li', { hasText: name })
  const group = (title: string) => page.locator('div.mb-3', { has: page.getByRole('heading', { name: title }) })
  await expect(group('Fruits et légumes').locator('li', { hasText: 'Tomates E2E' })).toBeVisible()

  await row('Tomates E2E').getByRole('button', { name: 'Actions sur l\'article' }).click()
  await page.getByRole('menuitem', { name: 'Changer de rayon' }).click()
  await page.getByRole('menuitem', { name: 'Boulangerie' }).click()
  await expect(group('Boulangerie').locator('li', { hasText: 'Tomates E2E' })).toBeVisible()

  // Persistant : après rechargement
  await page.reload()
  await expect(group('Boulangerie').locator('li', { hasText: 'Tomates E2E' })).toBeVisible()

  // Retenu pour la personne : le même article dans une nouvelle liste arrive dans ce rayon
  await newList(LIST_B, 'tomate e2e')
  await gotoApp(page, '/courses')
  await page.getByRole('tab', { name: new RegExp(LIST_B) }).click()
  await expect(group('Boulangerie').locator('li', { hasText: 'tomate e2e' })).toBeVisible()

  // « Automatique » : retour aux mots-clés
  await row('tomate e2e').getByRole('button', { name: 'Actions sur l\'article' }).click()
  await page.getByRole('menuitem', { name: 'Changer de rayon' }).click()
  await page.getByRole('menuitem', { name: 'Automatique' }).click()
  await expect(group('Fruits et légumes').locator('li', { hasText: 'tomate e2e' })).toBeVisible()
})

test('(v2-aisle2) « ajouter aux courses » sans aucune liste : une liste par défaut est créée, sans redirection', async ({ page }) => {
  const { client, userId } = await signedIn('ami')
  await client.from('shopping_lists').delete().eq('user_id', userId)
  const recipe = await client.from('recipes').select('id').limit(1)
  await client.auth.signOut({ scope: 'local' })
  if (!recipe.data?.length) test.skip(true, 'aucune recette lisible pour ami@')
  await loginV2(page, 'ami')
  await gotoApp(page, '/recettes')
  await page.getByRole('button', { name: 'Ajouter à une liste de courses' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').getByText('Ma liste')).toBeVisible()
  await expect(page).toHaveURL(/\/recettes/)
  const after = await signedIn('ami')
  const lists = await after.client.from('shopping_lists').select('name')
  expect((lists.data ?? []).map(l => l.name)).toEqual(['Ma liste'])
  await after.client.from('shopping_lists').delete().eq('user_id', after.userId)
})

test('(v2-aisle3) fiche : « Ajouter aux courses » sans aucune liste crée « Ma liste » et la présélectionne', async ({ page }) => {
  const { client, userId } = await signedIn('ami')
  await client.from('shopping_lists').delete().eq('user_id', userId)
  const recipeId = await createRecipe(client, `${E2E_6B}Courses fiche`, 'private')
  await client.auth.signOut({ scope: 'local' })
  await loginV2(page, 'ami')
  await gotoApp(page, `/recettes/${recipeId}`)
  await page.getByRole('button', { name: 'Courses', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Ma liste')).toBeVisible()
  await expect(dialog.getByPlaceholder('Nom de la nouvelle liste')).toHaveCount(0)
  await expect(page).toHaveURL(/\/recettes\//)
  const after = await signedIn('ami')
  expect(((await after.client.from('shopping_lists').select('name')).data ?? []).map(l => l.name)).toEqual(['Ma liste'])
  await after.client.from('shopping_lists').delete().eq('user_id', after.userId)
  await deleteOwnRecipes(after.client)
})
