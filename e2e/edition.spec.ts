import { expect, test } from '@playwright/test'
import { getEdition } from '../shared/editions'
import { gotoApp, isMobile } from './support/app'

/**
 * Édition du site (NUXT_PUBLIC_EDITION, `boultons` par défaut, comme en CI) :
 * attribut `data-edition`, thème, accueil et repli visuel des cartes.
 */
const edition = getEdition(process.env.NUXT_PUBLIC_EDITION)

test('(ed1) accueil : attribut data-edition, thème et visuels de l\'édition', async ({ page }) => {
  await gotoApp(page, '/')

  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-edition', edition.id)
  await expect(page.locator('#edition-theme')).toHaveCount(1)
  await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')).toHaveAttribute('content', edition.theme.themeColor.light)
  await expect(page).toHaveTitle(new RegExp(edition.brand.name.fr))

  // Nuance de `--ui-primary` en clair (rendu serveur, sans flash).
  const uiPrimary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-primary').trim())
  expect(uiPrimary).toBe(edition.theme.primary[edition.theme.primaryShade.light])

  const firstCategory = page.getByTestId('category-card').first()
  if (edition.categoryImages) {
    // Accueil d'origine : héros + illustration de catégorie.
    await expect(page.getByTestId('home-hero')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: edition.brand.name.fr })).toBeVisible()
    const image = firstCategory.locator('img')
    await expect(image).toBeVisible()
    await expect(image).toHaveAttribute('src', /\/images\/categories\/.+\.png/)
    await expect(image).toHaveAttribute('alt', /.+/)
  } else {
    await expect(page.getByTestId('home-hero')).toHaveCount(0)
    await expect(firstCategory.locator('img')).toHaveCount(0)
  }

  // Pas de défilement horizontal (héros pleine largeur).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('(ed2) liste : cartes de même hauteur par rangée, repli visuel de l\'édition', async ({ page }) => {
  await gotoApp(page, '/recettes')
  const grid = page.getByTestId('recipe-grid')
  await expect(grid.locator('article').first()).toBeVisible()

  const layout = await grid.evaluate((element) => {
    const rows = new Map<number, number[]>()
    for (const card of Array.from(element.querySelectorAll(':scope > article'))) {
      const box = card.getBoundingClientRect()
      const top = Math.round(box.top)
      rows.set(top, [...(rows.get(top) ?? []), Math.round(box.height)])
    }
    const visuals = Array.from(element.querySelectorAll('[data-recipe-visual]')).map(visual => Math.round(visual.getBoundingClientRect().height))
    return { rows: [...rows.values()], visuals }
  })

  for (const heights of layout.rows) expect(new Set(heights).size, `hauteurs d'une rangée : ${heights.join('/')}`).toBe(1)
  // Zone visuelle identique pour toute la grille.
  expect(new Set(layout.visuals).size).toBe(1)

  if (edition.categoryImages) {
    // Sans photo : illustration de catégorie (aucune photo dans les données de test).
    await expect(grid.locator('[data-recipe-visual] img').first()).toHaveAttribute('src', /\/images\/categories\//)
  }
  if (!isMobile(page)) expect(layout.rows.some(heights => heights.length > 1)).toBe(true)
})
