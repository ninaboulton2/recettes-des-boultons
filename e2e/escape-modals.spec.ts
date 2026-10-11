import { expect, test, type Page } from '@playwright/test'
import { e2eName, storageStatePath } from './support/accounts'
import { gotoApp, isMobile } from './support/app'
import { SEARCH_TITLE } from './support/constants'
import { findRecipes, signedInClient } from './support/supabase'

/**
 * Échap ferme TOUTES les modales de l'app. Parcours représentatifs : ajout aux
 * courses (avec menu déroulant : un premier Échap ferme le menu, le second la
 * modale), planning (fiche et page), confirmations, éditeur de recette
 * (`dismissible: false` avant), connexion, mode cuisine, menu « Moi » mobile.
 * Le traducteur IA est une page (pas une modale) : rien à tester ici.
 */

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let recipeId: string

test.beforeAll(async () => {
  const { client } = await signedInClient('user')
  const recipe = (await findRecipes(client, 'Gâteau au yaourt')).find(candidate => SEARCH_TITLE.test(candidate.title))
  if (!recipe) throw new Error('Recette « Gâteau au yaourt… » introuvable')
  recipeId = recipe.id
  await client.auth.signOut({ scope: 'local' })
})

const recipeActions = (page: Page) => page.getByRole('main')

test.describe('utilisateur connecté', () => {
  test.use({ storageState: storageStatePath('user') })

  let listName: string

  test.beforeEach(async ({}, testInfo) => {
    listName = e2eName('esc', testInfo.project.name)
    const { client, userId } = await signedInClient('user')
    const { error } = await client.from('shopping_lists').insert({ name: listName, user_id: userId })
    if (error) throw error
    await client.auth.signOut({ scope: 'local' })
  })

  test.afterEach(async () => {
    const { client } = await signedInClient('user')
    await client.from('shopping_lists').delete().eq('name', listName)
    await client.auth.signOut({ scope: 'local' })
  })

  test('ajout aux courses : Échap ferme d\'abord le menu, puis la modale', async ({ page }) => {
    await gotoApp(page, `/recettes/${recipeId}`)
    await recipeActions(page).getByRole('button', { name: 'Courses', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Ajouter à une liste de courses' })
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Liste', exact: true }).click()
    const option = page.getByRole('option', { name: listName, exact: true })
    await expect(option).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(option).toBeHidden()
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('planning depuis la fiche : Échap ferme la modale', async ({ page }) => {
    await gotoApp(page, `/recettes/${recipeId}`)
    await recipeActions(page).getByRole('button', { name: 'Planning', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /au planning$/ })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('planning : Échap ferme « Ajouter au planning » même avec le focus dans un champ', async ({ page }) => {
    await gotoApp(page, '/planning')
    const main = page.getByRole('main')
    await main.getByRole('region', { name: /^Déjeuner/ }).first().getByRole('button', { name: 'Ajouter — Déjeuner' }).click()
    const dialog = page.getByRole('dialog', { name: 'Ajouter au planning' })
    await dialog.getByRole('tab', { name: 'Autre chose' }).click()
    const field = dialog.getByRole('textbox', { name: 'Intitulé' })
    await field.fill('E2E_brouillon')
    await expect(field).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('confirmation « Supprimer la liste ? » : Échap annule, la liste reste', async ({ page }) => {
    await gotoApp(page, '/courses')
    const main = page.getByRole('main')
    if (isMobile(page)) {
      await main.getByRole('button', { name: 'Liste', exact: true }).click()
      await page.getByRole('option', { name: new RegExp(`^${escapeRegExp(listName)}`) }).click()
    } else {
      const tab = main.getByRole('tab', { name: new RegExp(`^${escapeRegExp(listName)}`) })
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
    }
    await main.getByRole('button', { name: 'Actions sur la liste' }).click()
    await page.getByRole('menuitem', { name: 'Supprimer la liste' }).click()
    const confirm = page.getByRole('dialog', { name: 'Supprimer la liste ?' })
    await expect(confirm).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(confirm).toBeHidden()

    const { client, userId } = await signedInClient('user')
    const { data } = await client.from('shopping_lists').select('id').eq('user_id', userId).eq('name', listName)
    await client.auth.signOut({ scope: 'local' })
    expect(data).toHaveLength(1)
  })

  test('mode cuisine : Échap ferme le plein écran', async ({ page }) => {
    await gotoApp(page, `/recettes/${recipeId}`)
    await recipeActions(page).getByRole('button', { name: 'Mode cuisine', exact: true }).click()
    const cooking = page.locator('[data-cooking-mode]')
    await expect(cooking).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(cooking).toBeHidden()
  })

  test('mobile : Échap ferme le menu « Moi »', async ({ page }) => {
    test.skip(!isMobile(page), 'menu en feuille réservé à la mise en page mobile')
    await gotoApp(page, '/recettes')
    await page.getByRole('navigation', { name: 'Navigation' }).getByRole('button', { name: 'Moi' }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
  })
})

test.describe('administrateur', () => {
  test.use({ storageState: storageStatePath('admin') })

  test('éditeur de recette : Échap ferme la modale (focus dans le titre)', async ({ page }) => {
    await gotoApp(page, `/recettes/${recipeId}`)
    await recipeActions(page).getByRole('button', { name: 'Modifier', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const title = dialog.getByRole('textbox', { name: /^Titre/ })
    await title.click()
    await expect(title).toBeFocused()

    // Un clic à côté ne ferme toujours pas l'éditeur (saisie en cours protégée) ; Échap, si.
    await page.mouse.click(2, 2)
    await expect(dialog).toBeVisible()
    await title.click()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('confirmation « Supprimer la recette » : Échap annule', async ({ page }) => {
    await gotoApp(page, `/recettes/${recipeId}`)
    await recipeActions(page).getByRole('button', { name: 'Supprimer', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: 'Supprimer la recette' })
    await expect(confirm).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(confirm).toBeHidden()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SEARCH_TITLE)
  })
})

test.describe('visiteur', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('connexion : Échap ferme la modale', async ({ page }) => {
    await gotoApp(page, '/recettes')
    if (isMobile(page)) {
      await page.getByRole('navigation', { name: 'Navigation' }).getByRole('button', { name: 'Moi' }).click()
    } else {
      await page.getByRole('banner').getByRole('button', { name: 'Connexion' }).click()
    }
    const dialog = page.getByRole('dialog', { name: 'Connexion' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox', { name: 'Email' }).fill('quelqu-un@example.com')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})
