import { expect, test } from '@playwright/test'
import { gotoApp } from '../support/app'
import { loginV2, signedIn } from './support'

/** Catégories personnelles (user@local.test) : création, renommage, ordre, suppression, Échap ferme les modales. */
const NAME = 'E2E_Tartes'

test.afterEach(async () => {
  const { client, userId } = await signedIn('user')
  await client.from('categories').delete().eq('owner_id', userId).like('name_fr', 'E2E_%')
})

test('(v2-cat1) créer, renommer, déplacer, supprimer une catégorie', async ({ page }) => {
  await loginV2(page, 'user')
  await gotoApp(page, '/reglages')
  const manager = page.getByTestId('category-manager')
  const items = manager.getByTestId('category-item')
  await expect(items.first()).toBeVisible()
  const initial = await items.count()

  // Création ; Échap ferme la modale sans rien créer
  await manager.getByTestId('category-add').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  expect(await items.count()).toBe(initial)

  await manager.getByTestId('category-add').click()
  await page.getByTestId('category-save').click()
  await expect(dialog).toContainText('Indiquez au moins un nom.')
  await page.getByTestId('category-name-fr').fill(NAME)
  await page.getByTestId('category-name-en').fill('E2E_Pies')
  await dialog.locator('label[title="cake"]').click()
  await page.getByTestId('category-save').click()
  await expect(dialog).toBeHidden()
  await expect(items).toHaveCount(initial + 1)
  await expect(items.last()).toContainText(NAME)

  // Renommage
  await items.last().getByRole('button', { name: `Modifier « ${NAME} »` }).click()
  await page.getByTestId('category-name-fr').fill('E2E_Tartes salées')
  await page.getByTestId('category-save').click()
  await expect(items.last()).toContainText('E2E_Tartes salées')

  // Ordre : monter d'un rang
  await items.last().getByRole('button', { name: /^Monter/ }).click()
  await expect(items.nth(initial - 1)).toContainText('E2E_Tartes salées')

  // Suppression avec confirmation (Échap annule)
  await items.nth(initial - 1).getByRole('button', { name: /^Supprimer/ }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(items).toHaveCount(initial + 1)
  await items.nth(initial - 1).getByRole('button', { name: /^Supprimer/ }).click()
  await page.getByTestId('category-confirm-delete').click()
  await expect(items).toHaveCount(initial)

  // Les filtres de /recettes utilisent mes catégories
  await gotoApp(page, '/recettes')
  await page.getByRole('main').getByText('Toutes les catégories').first().click()
  // `div[role="option"]` : la liste déroulante. Sur une base fraîche, la bannière « Explorer les recettes » est aussi affichée et son
  // <select> natif (data-testid entry-category) porte lui aussi une <option> « Soupes » (violation du mode strict de Playwright).
  await expect(page.locator('div[role="option"]', { hasText: 'Soupes' })).toBeVisible()
})
