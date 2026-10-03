import { expect, test } from '@playwright/test'
import { gotoApp, searchBox } from './support/app'
import { PAGINATION_CATEGORY, PAGINATION_CATEGORY_LABEL, RECIPES_PER_PAGE, SEARCH_INGREDIENT, SEARCH_QUERY, SEARCH_TITLE } from './support/constants'

/** « 182 recettes » → 182 (compteur de RecipeFilters). */
async function recipeCount(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.getByRole('main').getByText(/^\d+ recettes?$/).first().textContent()
  return Number.parseInt(text ?? '', 10)
}

test('(a) accueil → liste → recherche sans accent → fiche avec ingrédients', async ({ page }) => {
  await gotoApp(page, '/')
  await page.getByRole('main').getByRole('link', { name: 'Explorer les recettes' }).click()
  await expect(page).toHaveURL(/\/recettes$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Toutes nos recettes' })).toBeVisible()

  const total = await recipeCount(page)
  await searchBox(page).fill(SEARCH_QUERY)
  // La recherche (RPC search_recipes, unaccent) réduit la liste…
  await expect.poll(() => recipeCount(page)).toBeLessThan(total)
  // … et « gateau » trouve « Gâteau ».
  const result = page.getByRole('article').getByRole('link', { name: SEARCH_TITLE }).first()
  await expect(result).toBeVisible()
  const title = (await result.textContent())?.trim() ?? ''
  await result.click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
  const ingredients = page.getByRole('region', { name: 'Ingrédients' })
  await expect(ingredients.getByRole('listitem').first()).toBeVisible()
  await expect(ingredients.getByRole('checkbox', { name: SEARCH_INGREDIENT }).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Préparation' })).toBeVisible()
})

test('(b) filtre par catégorie + pagination', async ({ page }) => {
  await gotoApp(page, '/recettes')
  await page.getByRole('button', { name: 'Catégorie' }).click()
  await page.getByRole('option', { name: PAGINATION_CATEGORY_LABEL, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`category=${PAGINATION_CATEGORY}`))
  await expect.poll(() => recipeCount(page)).toBeGreaterThan(RECIPES_PER_PAGE)

  const cards = page.getByRole('article')
  await expect(cards).toHaveCount(RECIPES_PER_PAGE)
  const firstTitle = (await cards.first().getByRole('heading').textContent())?.trim() ?? ''

  const pagination = page.getByRole('navigation', { name: 'Pagination' })
  await pagination.getByRole('button', { name: /(^|\s)2$/ }).click()
  await expect(page).toHaveURL(/[?&]page=2/)
  await expect(page).toHaveURL(new RegExp(`category=${PAGINATION_CATEGORY}`))
  await expect(cards.first().getByRole('heading')).not.toHaveText(firstTitle)

  // Rechargement : catégorie et page conservées (SSR depuis l'URL).
  await page.reload()
  await expect(page.getByRole('button', { name: 'Catégorie' })).toContainText(PAGINATION_CATEGORY_LABEL)
  await expect(cards.first().getByRole('heading')).not.toHaveText(firstTitle)
})
