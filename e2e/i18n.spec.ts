import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { gotoApp } from './support/app'
import { findRecipes, signedInClient } from './support/supabase'
import { SEARCH_TITLE } from './support/constants'

/** Espaces de noms de en.json : une clé brute affichée ressemble à « recipes.title ». */
const namespaces = Object.keys(JSON.parse(readFileSync(resolve(import.meta.dirname, '../i18n/locales/en.json'), 'utf8')) as Record<string, unknown>)
const RAW_KEY = new RegExp(`\\b(?:${namespaces.join('|')})\\.[A-Za-z][\\w.]*\\b`)

let recipeId: string

test.beforeAll(async () => {
  const { client } = await signedInClient('user')
  recipeId = (await findRecipes(client, 'Gâteau au yaourt')).find(candidate => SEARCH_TITLE.test(candidate.title))?.id ?? ''
  await client.auth.signOut({ scope: 'local' })
})

test('(g) /en : rendu anglais sans clé manquante', async ({ page }) => {
  const missing: string[] = []
  page.on('console', (message) => {
    if (/Not found '.+' key|missing.+translation/i.test(message.text())) missing.push(message.text())
  })

  for (const path of ['/en', '/en/recettes', `/en/recettes/${recipeId}`, '/en/planning', '/en/courses', '/en/favoris']) {
    await gotoApp(page, path)
    await expect(page.locator('html')).toHaveAttribute('lang', /^en/)
    const text = await page.locator('body').innerText()
    expect(text, `clé i18n brute sur ${path}`).not.toMatch(RAW_KEY)
  }

  // Quelques libellés anglais attendus.
  await gotoApp(page, '/en')
  await expect(page.getByRole('navigation', { name: /main/i }).or(page.getByRole('navigation', { name: 'Navigation' })).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Recipes' }).first()).toBeVisible()

  // Pagination (libellés accessibles) et recherche en anglais.
  await gotoApp(page, '/en/recettes')
  const pagination = page.getByRole('navigation', { name: 'Pagination' })
  await expect(pagination.getByRole('button', { name: 'Next page', exact: true })).toBeVisible()
  await expect(pagination.getByRole('button', { name: 'Page 2', exact: true })).toBeVisible()
  await expect(page.getByRole('main').getByRole('searchbox', { name: 'Search', exact: true })).toBeVisible()

  expect(missing, 'avertissements vue-i18n').toEqual([])
})
