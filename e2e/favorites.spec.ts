import { expect, test } from '@playwright/test'
import { storageStatePath } from './support/accounts'
import { gotoApp } from './support/app'
import { SEARCH_TITLE } from './support/constants'
import { findRecipes, signedInClient } from './support/supabase'

test.use({ storageState: storageStatePath('user') })

let recipe: { id: string, title: string }

test.beforeAll(async () => {
  // Une recette qui n'est PAS déjà en favori (données réelles en local).
  const { client } = await signedInClient('user')
  const { data: favorites, error } = await client.from('favorites').select('recipe_id')
  if (error) throw error
  const taken = new Set((favorites ?? []).map(row => row.recipe_id as string))
  const candidates = (await findRecipes(client, 'Gâteau au yaourt')).filter(candidate => SEARCH_TITLE.test(candidate.title))
  const free = candidates.find(candidate => !taken.has(candidate.id))
  if (!free) throw new Error('Aucune recette « Gâteau au yaourt… » hors favoris pour user@local.test')
  recipe = free
  await client.auth.signOut({ scope: 'local' })
})

test.afterAll(async () => {
  // Filet de sécurité : le favori ajouté ne doit pas survivre à un échec.
  if (!recipe) return
  const { client } = await signedInClient('user')
  await client.from('favorites').delete().eq('recipe_id', recipe.id)
  await client.auth.signOut({ scope: 'local' })
})

test('(c) user@local.test : favori ajouté puis retiré', async ({ page }) => {
  await gotoApp(page, `/recettes/${recipe.id}`)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(recipe.title)

  await main.getByRole('button', { name: 'Ajouter aux favoris' }).click()
  await expect(main.getByRole('button', { name: 'Retirer des favoris' })).toBeVisible()

  await gotoApp(page, '/favoris')
  const favoriteLink = page.getByRole('main').getByRole('link', { name: recipe.title, exact: true })
  await expect(favoriteLink).toBeVisible()

  // Rechargements complets de la fiche : l'état favori est rendu côté serveur
  // et conservé à l'hydratation (régression : « Ajouter aux favoris » affiché
  // à tort ~1 fois sur 3 quand le payload SSR portait isLoading=true).
  for (let attempt = 0; attempt < 3; attempt++) {
    await gotoApp(page, `/recettes/${recipe.id}`)
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(recipe.title)
    await expect(main.getByRole('button', { name: 'Retirer des favoris' })).toBeVisible()
  }
  await main.getByRole('button', { name: 'Retirer des favoris' }).click()
  await expect(main.getByRole('button', { name: 'Ajouter aux favoris' })).toBeVisible()

  await gotoApp(page, '/favoris')
  await expect(page.getByRole('main').getByRole('link', { name: recipe.title, exact: true })).toHaveCount(0)
})
