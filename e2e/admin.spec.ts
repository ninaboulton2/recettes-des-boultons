import { expect, test } from '@playwright/test'
import { storageStatePath, type AccountRole } from './support/accounts'
import { gotoApp } from './support/app'
import { SEARCH_TITLE } from './support/constants'
import { findRecipes, signedInClient } from './support/supabase'

let recipeId: string

test.beforeAll(async () => {
  const { client } = await signedInClient('user')
  const recipe = (await findRecipes(client, 'Gâteau au yaourt')).find(candidate => SEARCH_TITLE.test(candidate.title))
  if (!recipe) throw new Error('Recette « Gâteau au yaourt… » introuvable')
  recipeId = recipe.id
  await client.auth.signOut({ scope: 'local' })
})

const cases: { role: AccountRole, visible: boolean }[] = [
  { role: 'admin', visible: true },
  { role: 'user', visible: false }
]

for (const { role, visible } of cases) {
  test.describe(`(f) ${role}`, () => {
    test.use({ storageState: storageStatePath(role) })

    test(`bouton « Modifier » ${visible ? 'visible' : 'absent'} sur la fiche`, async ({ page }) => {
      await gotoApp(page, `/recettes/${recipeId}`)
      const main = page.getByRole('main')
      // Repère commun : la fiche est rendue et l'utilisateur connecté.
      await expect(main.getByRole('button', { name: /favoris$/ })).toBeVisible()
      const edit = main.getByRole('button', { name: 'Modifier', exact: true })
      if (visible) {
        await expect(edit).toBeVisible()
        await edit.click()
        await expect(page.getByRole('dialog')).toBeVisible()
      } else {
        await expect(edit).toHaveCount(0)
        await expect(main.getByRole('button', { name: 'Supprimer', exact: true })).toHaveCount(0)
      }
    })
  })
}
