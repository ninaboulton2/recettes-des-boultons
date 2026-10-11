import { expect, test, type Page } from '@playwright/test'
import { e2eName, storageStatePath } from './support/accounts'
import { gotoApp } from './support/app'
import { signedInClient } from './support/supabase'

/**
 * Traducteur IA : détection des recettes déjà existantes. Le serveur tourne
 * avec `AI_PROVIDER=mock` : le titre de l'aperçu est la première ligne du texte
 * collé, les ingrédients sont ceux (fixes) de la recette simulée. La recette
 * « déjà existante » est créée par le test (`E2E_…`, supprimée ensuite).
 */

test.use({ storageState: storageStatePath('admin') })

let base: string
let existingId: string
let existingTitle: string

test.beforeEach(async ({}, testInfo) => {
  base = e2eName('doublon', testInfo.project.name)
  existingTitle = `${base} Gateau aux carottes`
  const { client } = await signedInClient('admin')
  const { data, error } = await client.from('recipes')
    .insert({ title: existingTitle, category: 'desserts et gâteaux' })
    .select('id')
    .single()
  if (error) throw error
  existingId = (data as { id: string }).id
  await client.auth.signOut({ scope: 'local' })
})

test.afterEach(async () => {
  const { client } = await signedInClient('admin')
  await client.from('recipes').delete().like('title', `${base}%`)
  await client.auth.signOut({ scope: 'local' })
})

async function translateText(page: Page, firstLine: string): Promise<void> {
  await gotoApp(page, '/traducteur')
  await page.getByRole('textbox', { name: 'Texte de la recette' })
    .fill(`${firstLine}\n\n200 g de farine\n100 g de sucre\n\nMélanger puis cuire 30 minutes à 180 °C.`)
  await page.getByRole('button', { name: 'Structurer la recette' }).click()
  await expect(page.getByText('Aperçu avant ajout')).toBeVisible()
  await expect(page.getByRole('heading', { name: firstLine })).toBeVisible()
}

test('une recette au même titre (accents, casse, ponctuation différents) est signalée, avec un lien', async ({ page, context }) => {
  await translateText(page, `${base} GÂTEAU à la carotte !`)

  const warning = page.getByTestId('similar-recipes')
  await expect(warning).toContainText('Cette recette semble déjà exister :')
  const link = warning.getByRole('link', { name: new RegExp(`^${existingTitle}`) })
  await expect(link).toHaveAttribute('href', `/recettes/${existingId}`)
  await expect(link).toHaveAttribute('target', '_blank')

  // Le lien ouvre la recette existante dans un nouvel onglet, l'aperçu reste en place.
  const popupPromise = context.waitForEvent('page')
  await link.click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(new RegExp(`/recettes/${existingId}$`))
  await popup.close()
  await expect(page.getByText('Aperçu avant ajout')).toBeVisible()

  // « Créer quand même » ajoute bien la recette.
  await expect(page.getByRole('button', { name: 'Ajouter aux recettes' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Créer quand même' }).click()
  await expect(page.getByText(/Recette « .* » ajoutée/).first()).toBeVisible()
})

test('rien n\'est affiché quand aucune recette ne ressemble à l\'aperçu', async ({ page }) => {
  await translateText(page, `${base} Zébulon farci au kalamansi`)

  await expect(page.getByTestId('similar-recipes')).toHaveCount(0)
  await expect(page.getByText('Cette recette semble déjà exister')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ajouter aux recettes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Créer quand même' })).toHaveCount(0)
})
