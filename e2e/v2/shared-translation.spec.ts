import { expect, test } from '@playwright/test'
import { gotoApp } from '../support/app'
import { E2E_6B, cleanup6B, createRecipe, loginV2, signedIn, sqlLocal } from './support'

/**
 * Recettes partagées dans la langue de la personne qui les lit (retour de test n° 1, point 3 ; migration 0031).
 *
 * Serveur en `AI_PROVIDER=mock` (.env.local) : la « traduction » vers l'anglais préfixe chaque texte de « [EN] » (server/utils/ai/mock.ts), aucun
 * appel payant. Les recettes sont créées par `save_recipe` (sans passer par l'IA) : elles n'ont donc AUCUNE traduction au départ.
 * Le coût de la traduction est compté sur l'AUTEUR (admin@), jamais sur la personne qui lit.
 *
 * Prérequis : migration 0031 appliquée sur la base locale (`db:local:v2` rejoue les migrations).
 */
test.beforeAll(async () => { await cleanup6B() })
test.afterAll(async () => { await cleanup6B() })

const usageOf = (email: string): number => Number(sqlLocal(
  `select count(*) from public.ai_usage u join auth.users a on a.id = u.user_id where a.email = '${email}' and u.feature = 'translate_recipe'`
).trim())

test('(v2-tr1) lien public /en/r/<jeton> : texte d\'origine puis traduction anglaise, sans compte', async ({ browser, baseURL }) => {
  const admin = await signedIn('admin')
  const title = `${E2E_6B}Tarte du lien`
  const id = await createRecipe(admin.client, title, 'private')
  const { data: token, error } = await admin.client.rpc('create_share_link', { p_recipe: id })
  expect(error).toBeNull()

  const before = usageOf('admin@local.test')
  const anon = await browser.newContext({ baseURL, locale: 'en-US' })
  const page = await anon.newPage()
  await gotoApp(page, `/en/r/${token as string}`)
  // La traduction se fait en arrière-plan : le titre anglais apparaît, la mention « en cours » disparaît.
  await expect(page.getByRole('heading', { name: `[EN] ${title}` })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('public-language-hint')).toContainText('Automatically translated')
  expect(usageOf('admin@local.test')).toBe(before + 1)

  // Page française du même lien : texte d'origine, aucun nouvel appel
  await gotoApp(page, `/r/${token as string}`)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  expect(usageOf('admin@local.test')).toBe(before + 1)
  await anon.close()
})

test('(v2-tr2) droit à une personne : sa fiche, sa liste et sa notification en anglais, coût compté sur l\'auteur', async ({ page }) => {
  const admin = await signedIn('admin')
  const user = await signedIn('user')
  const title = `${E2E_6B}Tarte partagée`
  const id = await createRecipe(admin.client, title, 'private')
  expect((await admin.client.rpc('grant_recipe', { p_recipe: id, p_grantee_user: user.userId, p_permission: 'read' })).error).toBeNull()

  const authorBefore = usageOf('admin@local.test')
  const readerBefore = usageOf('user@local.test')
  await loginV2(page, 'user')
  await gotoApp(page, `/en/recettes/${id}`)
  await expect(page.getByRole('heading', { name: `[EN] ${title}` })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('recipe-language-hint')).toContainText('Automatically translated')
  expect(usageOf('admin@local.test')).toBe(authorBefore + 1)
  expect(usageOf('user@local.test')).toBe(readerBefore)   // le quota de la personne qui lit n'est pas touché

  // Une fois traduite, la recette l'est partout : liste « partagées avec moi » et notification
  await gotoApp(page, '/en/partagees')
  await expect(page.getByTestId('shared-recipe').filter({ hasText: `[EN] ${title}` })).toBeVisible()
  await gotoApp(page, '/en/notifications')
  await expect(page.getByTestId('notification-text').filter({ hasText: `[EN] ${title}` }).first()).toBeVisible()
  expect(usageOf('admin@local.test')).toBe(authorBefore + 1)
})

test('(v2-tr3) recette illisible : la route de traduction répond 404 (rien n\'est traduit pour un étranger)', async ({ page, browser, baseURL }) => {
  const admin = await signedIn('admin')
  const id = await createRecipe(admin.client, `${E2E_6B}Secrète`, 'private')
  await loginV2(page, 'user')
  const response = await page.request.post(`/api/v2/recipes/${id}/translate`, { data: { locale: 'en' } })
  expect(response.status()).toBe(404)
  const anonymous = await browser.newContext({ baseURL })
  const refused = await anonymous.request.post(`/api/v2/recipes/${id}/translate`, { data: { locale: 'en' } })
  expect(refused.status()).toBe(401)
  const unknownToken = await anonymous.request.post('/api/v2/shared/00000000-0000-4000-8000-000000000000/translate', { data: { locale: 'en' } })
  expect(unknownToken.status()).toBe(404)
  await anonymous.close()
})
