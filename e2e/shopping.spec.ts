import { expect, test, type Page } from '@playwright/test'
import { e2eName, storageStatePath } from './support/accounts'
import { gotoApp, isMobile, searchBox } from './support/app'
import { SEARCH_INGREDIENT, SEARCH_QUERY, SEARCH_TITLE } from './support/constants'
import { signedInClient } from './support/supabase'

test.use({ storageState: storageStatePath('user') })

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Liste DÉDIÉE au test : `add_recipe_to_list` fusionne les doublons en base,
 * ajouter à une vraie liste modifierait des articles existants.
 */
let listName: string

test.beforeEach(async ({}, testInfo) => {
  listName = e2eName('courses', testInfo.project.name)
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

/** Sélectionne une liste : onglets (desktop) ou menu déroulant (mobile). */
async function selectList(page: Page, name: string): Promise<void> {
  const main = page.getByRole('main')
  if (isMobile(page)) {
    await main.getByRole('button', { name: 'Liste', exact: true }).click()
    await page.getByRole('option', { name: new RegExp(`^${escapeRegExp(name)}`) }).click()
  } else {
    const tab = main.getByRole('tab', { name: new RegExp(`^${escapeRegExp(name)}`) })
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
  }
}

test('(d) fiche → « Ajouter aux courses » → article dans /courses → nettoyage', async ({ page }) => {
  await gotoApp(page, '/recettes')
  await searchBox(page).fill(SEARCH_QUERY)
  await page.getByRole('article').getByRole('link', { name: SEARCH_TITLE }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(SEARCH_TITLE)

  await page.getByRole('main').getByRole('button', { name: 'Courses', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajouter à une liste de courses' })
  await dialog.getByRole('button', { name: 'Liste', exact: true }).click()
  await page.getByRole('option', { name: listName, exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Liste', exact: true })).toContainText(listName)
  await dialog.getByRole('button', { name: 'Ajouter à la liste' }).click()
  await expect(dialog).toBeHidden()

  await gotoApp(page, '/courses')
  await selectList(page, listName)
  const toBuy = page.getByRole('main').getByRole('region', { name: /^À acheter/ })
  await expect(toBuy.getByRole('checkbox', { name: SEARCH_INGREDIENT }).first()).toBeVisible()

  // Nettoyage par l'interface (l'afterEach supprime la liste en cas d'échec).
  await page.getByRole('main').getByRole('button', { name: 'Actions sur la liste' }).click()
  await page.getByRole('menuitem', { name: 'Supprimer la liste' }).click()
  const confirm = page.getByRole('dialog', { name: 'Supprimer la liste ?' })
  await confirm.getByRole('button', { name: 'Supprimer' }).click()
  await expect(confirm).toBeHidden()
  if (isMobile(page)) {
    await page.getByRole('main').getByRole('button', { name: 'Liste', exact: true }).click()
    await expect(page.getByRole('option', { name: new RegExp(`^${escapeRegExp(listName)}`) })).toHaveCount(0)
    await page.keyboard.press('Escape')
  } else {
    await expect(page.getByRole('main').getByRole('tab', { name: new RegExp(`^${escapeRegExp(listName)}`) })).toHaveCount(0)
  }
})
