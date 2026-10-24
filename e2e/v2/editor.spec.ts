import { expect, test } from '@playwright/test'
import { gotoApp } from '../support/app'
import { E2E_6B, cleanup6B, createRecipe, loginV2, signedIn } from './support'

/**
 * Éditeur, suppression et routes serveur v2 (phase 6B) : ouverts à un compte non admin (`user@`), modification par un détenteur
 * d’« edit_original », avertissement avant suppression, détection de recette similaire limitée aux recettes lisibles, IA ouverte.
 */
test.beforeAll(async () => { await cleanup6B() })
test.afterAll(async () => { await cleanup6B() })

test('(6b-edit1) un compte non admin crée une recette : MA catégorie et la visibilité', async ({ page }) => {
  await loginV2(page, 'user')
  await gotoApp(page, '/recettes')
  await page.getByTestId('new-recipe').click()
  await page.getByRole('menuitem', { name: 'Saisir une recette' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nouvelle recette' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('recipe-v2-options')).toBeVisible()

  await dialog.getByLabel('Titre de la recette').fill(`${E2E_6B}Éditeur`)
  // Catégorie obligatoire pour une recette neuve
  await dialog.getByRole('button', { name: 'Créer la recette' }).click()
  await expect(dialog.getByText('Choisissez une catégorie.')).toBeVisible()
  await dialog.getByTestId('option-category').click()
  await page.getByRole('option').first().click()
  await dialog.getByRole('radio', { name: /Privée/ }).click()
  await dialog.getByRole('button', { name: 'Ajouter un ingrédient' }).first().click()
  await dialog.getByLabel('Ingrédient', { exact: true }).first().fill('sel')
  await dialog.getByRole('button', { name: 'Ajouter une étape' }).first().click()
  await dialog.getByLabel('Étape 1').fill('Saler.')
  await dialog.getByRole('button', { name: 'Créer la recette' }).click()

  await expect(page).toHaveURL(/\/recettes\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: `${E2E_6B}Éditeur` })).toBeVisible()
  await expect(page.getByTestId('action-edit')).toBeVisible()
  const { client, userId } = await signedIn('user')
  const { data } = await client.from('recipes').select('owner_id, visibility, category_id').like('title', `${E2E_6B}Éditeur`).single()
  expect(data).toMatchObject({ owner_id: userId, visibility: 'private' })
  expect((data as { category_id: string | null }).category_id).not.toBeNull()
})

test('(6b-edit2) « modifier l’original » : modifier oui, supprimer non, catégorie et visibilité masquées', async ({ page }) => {
  const admin = await signedIn('admin')
  const user = await signedIn('user')
  const id = await createRecipe(admin.client, `${E2E_6B}Partagée en écriture`, 'private')
  const granted = await admin.client.rpc('grant_recipe', { p_recipe: id, p_grantee_user: user.userId, p_permission: 'edit_original' })
  expect(granted.error).toBeNull()

  await loginV2(page, 'user')
  await gotoApp(page, `/recettes/${id}`)
  await expect(page.getByTestId('action-edit')).toBeVisible()
  await expect(page.getByTestId('action-delete')).toHaveCount(0)
  await page.getByTestId('action-edit').click()
  const dialog = page.getByRole('dialog', { name: 'Modifier la recette' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('recipe-v2-options')).toHaveCount(0)
  await dialog.getByLabel('Titre de la recette').fill(`${E2E_6B}Modifiée par un éditeur`)
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()

  const { data } = await admin.client.from('recipes').select('title, owner_id, visibility').eq('id', id).single()
  expect(data).toMatchObject({ title: `${E2E_6B}Modifiée par un éditeur`, owner_id: admin.userId, visibility: 'private' })
})

test('(6b-delete) suppression : avertissement « dans le carnet de N personnes et copiée N fois »', async ({ page }) => {
  const admin = await signedIn('admin')
  const user = await signedIn('user')
  const id = await createRecipe(admin.client, `${E2E_6B}À supprimer`, 'groups')
  expect((await user.client.rpc('add_to_cookbook', { p_recipe: id })).error).toBeNull()
  expect((await user.client.rpc('copy_recipe', { p_source: id })).error).toBeNull()

  await loginV2(page, 'admin')
  await gotoApp(page, `/recettes/${id}`)
  await page.getByTestId('action-delete').click()
  const warning = page.getByTestId('delete-usage')
  await expect(warning).toContainText('Cette recette est dans le carnet d’une personne et a été copiée une fois.')
  // Échap annule
  await page.keyboard.press('Escape')
  await expect(warning).toBeHidden()
  await page.getByTestId('action-delete').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page).toHaveURL(/\/recettes$/)
  const gone = await admin.client.from('recipes').select('id').eq('id', id)
  expect(gone.data).toHaveLength(0)
  // La copie reste à son auteur, sans lien vers l’original
  const copy = await user.client.from('recipes').select('copied_from').like('title', `${E2E_6B}À supprimer`)
  expect(copy.data).toHaveLength(1)
  expect((copy.data as Array<{ copied_from: string | null }>)[0]!.copied_from).toBeNull()

  // Sans usage : aucun avertissement
  const lonely = await createRecipe(admin.client, `${E2E_6B}Sans usage`, 'private')
  await gotoApp(page, `/recettes/${lonely}`)
  await page.getByTestId('action-delete').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByTestId('delete-usage')).toHaveCount(0)
})

test('(6b-api) similaire : seulement des recettes lisibles ; IA ouverte à un compte non admin', async ({ page }) => {
  const admin = await signedIn('admin')
  await createRecipe(admin.client, `${E2E_6B}Tarte aux noix secrète`, 'private')
  await createRecipe(admin.client, `${E2E_6B}Tarte aux noix visible`, 'groups')
  await loginV2(page, 'ami')   // hors du groupe : ne lit aucune des deux (ami@ n’a pas fini son accueil, l’API s’en moque)
  const ami = await page.request.post('/api/recipes/similar', { data: { title: `${E2E_6B}Tarte aux noix visible` } })
  expect(ami.status()).toBe(200)
  expect((await ami.json()).similar).toHaveLength(0)

  await page.context().clearCookies()
  await loginV2(page, 'user')   // membre du groupe : lit la recette visible, pas la privée
  const visible = await (await page.request.post('/api/recipes/similar', { data: { title: `${E2E_6B}Tarte aux noix visible` } })).json()
  expect(visible.similar.map((item: { title: string }) => item.title)).toContain(`${E2E_6B}Tarte aux noix visible`)
  const secret = await (await page.request.post('/api/recipes/similar', { data: { title: `${E2E_6B}Tarte aux noix secrète` } })).json()
  expect(secret.similar.map((item: { title: string }) => item.title)).not.toContain(`${E2E_6B}Tarte aux noix secrète`)

  // Traducteur IA (fournisseur simulé en local) : ouvert à un compte non admin, avec le quota par compte
  const ai = await page.request.post('/api/translate-recipe', { data: { recipeText: 'Gâteau au yaourt : un pot de yaourt, trois pots de farine, deux pots de sucre, trois oeufs, cuire 30 minutes.' } })
  expect(ai.status()).toBe(200)
  // Sans compte : refusé
  await page.context().clearCookies()
  const anon = await page.request.post('/api/translate-recipe', { data: { recipeText: 'Gâteau au yaourt : un pot de yaourt, trois pots de farine, deux pots de sucre.' } })
  expect(anon.status()).toBe(401)
})
