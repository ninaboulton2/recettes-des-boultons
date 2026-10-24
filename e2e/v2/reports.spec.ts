import { expect, test } from '@playwright/test'
import { waitForHydration } from '../support/app'
import { cleanup6DE, createGroupWith, createRecipe, E2E_6E, loginV2, logoutV2, signedIn, sqlLocal } from './support'

/**
 * Phase 6E : « Signaler » (fiche et page publique), limite de 10 par jour, écran du support. Base `npm run db:local:v2`.
 * `admin@` = auteur et support ; `user@` = membre d'un groupe qui lit la recette et la signale.
 */
test.beforeEach(() => { cleanup6DE() })
test.afterAll(() => { cleanup6DE() })

async function reportedSetup(title = `${E2E_6E}Tarte signalée`) {
  const author = await signedIn('admin')
  const recipeId = await createRecipe(author.client, title, 'groups')
  await createGroupWith('admin', `${E2E_6E}groupe`, ['user'])
  return { author, recipeId, title }
}

test('(6e-report1) signaler depuis la fiche : absent pour l\'auteur, formulaire, Échap, envoi, base', async ({ page }) => {
  const { recipeId } = await reportedSetup()

  // l'auteur ne voit pas « Signaler » sur sa propre recette
  await loginV2(page, 'admin')
  await page.goto(`/recettes/${recipeId}`)
  await waitForHydration(page)
  await expect(page.getByTestId('action-edit')).toBeVisible()
  await expect(page.getByTestId('report-link')).toHaveCount(0)
  await logoutV2(page)

  await loginV2(page, 'user')
  await page.goto(`/recettes/${recipeId}`)
  await waitForHydration(page)
  await page.getByTestId('report-link').click()
  const dialog = page.getByRole('dialog', { name: 'Signaler cette recette' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('report-submit')).toBeDisabled()   // motif obligatoire

  // Échap ferme
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // envoi : motif + détails, compteur
  await page.getByTestId('report-link').click()
  await dialog.getByTestId('report-reason-copyright').check()
  await dialog.getByTestId('report-details').fill('Texte recopié du blog de Mamie')
  await expect(dialog.getByTestId('report-counter')).toHaveText('30 / 2000')
  await dialog.getByTestId('report-submit').click()
  await expect(dialog.getByTestId('report-sent')).toContainText('Merci')

  const { client } = await signedIn('admin')
  const rows = await client.from('reports').select('recipe_id, reason, details, status').eq('recipe_id', recipeId)
  expect(rows.data).toEqual([{ recipe_id: recipeId, reason: 'copyright', details: 'Texte recopié du blog de Mamie', status: 'open' }])
})

test('(6e-report2) la 11e demande du jour est refusée avec un message clair', async ({ page }) => {
  const { recipeId } = await reportedSetup()
  const { userId } = await signedIn('user')
  sqlLocal(`insert into public.reports (recipe_id, reporter_id, reason) select '${recipeId}', '${userId}', 'spam' from generate_series(1, 10)`)

  await loginV2(page, 'user')
  await page.goto(`/recettes/${recipeId}`)
  await waitForHydration(page)
  await page.getByTestId('report-link').click()
  const dialog = page.getByRole('dialog', { name: 'Signaler cette recette' })
  await dialog.getByTestId('report-reason-spam').check()
  await dialog.getByTestId('report-submit').click()
  await expect(dialog.getByTestId('report-error')).toHaveText('Vous avez atteint la limite de 10 signalements par jour. Réessayez demain.')
  expect(sqlLocal('select count(*) from public.reports').trim()).toBe('10')
})

test('(6e-report3) page publique : connexion demandée, puis la fenêtre s\'ouvre ; signalement par le jeton', async ({ page }) => {
  const { author, recipeId } = await reportedSetup()
  const link = await author.client.rpc('create_share_link', { p_recipe: recipeId })
  expect(link.error).toBeNull()
  const token = link.data as string

  await page.goto(`/r/${token}`)
  await waitForHydration(page)
  await expect(page.getByTestId('public-recipe-page')).toBeVisible()
  await page.getByTestId('public-report-link').click()
  const login = page.getByRole('dialog', { name: 'Connexion' })
  await login.getByRole('textbox', { name: 'Email' }).fill('user@local.test')
  await login.getByRole('textbox', { name: 'Mot de passe' }).fill('password123')
  await login.getByRole('button', { name: 'Se connecter' }).click()

  const dialog = page.getByRole('dialog', { name: 'Signaler cette recette' })
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('report-reason-illegal').check()
  await dialog.getByTestId('report-submit').click()
  await expect(dialog.getByTestId('report-sent')).toBeVisible()
  expect(sqlLocal(`select reason from public.reports where recipe_id = '${recipeId}'`).trim()).toBe('illegal')
})

test('(6e-support) le support traite les signalements ; un simple membre n\'a pas accès', async ({ page }) => {
  const { recipeId, title } = await reportedSetup()
  const { client: member, userId } = await signedIn('user')
  const first = await member.from('reports').insert({ recipe_id: recipeId, reporter_id: userId, reason: 'spam', details: 'publicité déguisée' })
  expect(first.error).toBeNull()

  // un membre : page introuvable
  await loginV2(page, 'user')
  const denied = await page.goto('/support/signalements')
  expect(denied?.status()).toBe(404)
  await logoutV2(page)

  // le support : liste, ouverture, examen, traitement
  await loginV2(page, 'admin')
  await page.goto('/support/signalements')
  await waitForHydration(page)
  const card = page.locator('[data-testid^="support-report-"]').first()
  await expect(card.getByTestId('support-recipe-title')).toHaveText(title)
  await expect(card.getByTestId('support-reason')).toHaveText('Spam')
  await expect(card.getByTestId('support-details')).toHaveText('publicité déguisée')
  await expect(card.getByTestId('support-status')).toHaveText('Ouvert')

  await card.getByTestId('support-reviewed').click()
  await expect(card.getByTestId('support-status')).toHaveText('Examiné')
  await expect(card.getByTestId('support-reviewed')).toHaveCount(0)

  // ouvrir la recette (lisible par le support tant que le signalement est ouvert ou examiné)
  await card.getByTestId('support-open').click()
  await expect(page).toHaveURL(new RegExp(`/recettes/${recipeId}$`))
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await page.goBack()
  await waitForHydration(page)

  await page.locator('[data-testid^="support-report-"]').first().getByTestId('support-actioned').click()
  await expect(page.getByTestId('support-empty')).toBeVisible()
  expect(sqlLocal(`select status from public.reports where recipe_id = '${recipeId}'`).trim()).toBe('actioned')
})

test('(6e-support2) le support supprime la recette signalée : signalement traité, recette partie', async ({ page }) => {
  const { recipeId } = await reportedSetup(`${E2E_6E}À supprimer`)
  const { client: member, userId } = await signedIn('user')
  await member.from('reports').insert({ recipe_id: recipeId, reporter_id: userId, reason: 'illegal' })

  await loginV2(page, 'admin')
  await page.goto('/support/signalements')
  await waitForHydration(page)
  await page.locator('[data-testid^="support-report-"]').first().getByTestId('support-delete').click()
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByTestId('support-empty')).toBeVisible()
  expect(sqlLocal(`select count(*) from public.recipes where id = '${recipeId}'`).trim()).toBe('0')
  expect(sqlLocal('select status || \':\' || coalesce(recipe_id::text, \'null\') from public.reports').trim()).toBe('actioned:null')
})
