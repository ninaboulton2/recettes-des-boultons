import { expect, test } from '@playwright/test'
import { gotoApp } from '../support/app'
import { E2E_6B, cleanup6B, createRecipe, loginV2, signedIn, sqlLocal } from './support'

/**
 * Recettes partagées dans la langue de la personne qui les lit (retour de test n° 1, point 3 ; migration 0031).
 *
 * Serveur en `AI_PROVIDER=mock` (.env.local) : la « traduction » vers l'anglais préfixe chaque texte de « [EN] » (server/utils/ai/mock.ts), aucun
 * appel payant. Les recettes sont créées par `save_recipe` (sans passer par l'IA) : elles n'ont donc AUCUNE traduction au départ.
 * La traduction à la demande ne compte que dans le budget global du mois (feature `translate_shared`, migration 0032) : jamais dans le plafond du jour
 * de l'auteur (admin@) ni de la personne qui lit (user@) ; le plafond du jour = les lignes `ai_usage` hors `translate_shared`.
 *
 * Prérequis : migrations 0031 et 0032 appliquées sur la base locale (`db:local:v2` rejoue les migrations).
 */
test.beforeAll(async () => { await cleanup6B() })
test.afterAll(async () => { await cleanup6B() })

/** Lignes `translate_shared` (budget du mois) rattachées au compte, et appels comptés dans son plafond du jour (tout sauf translate_shared). */
const sharedUsageOf = (email: string): number => Number(sqlLocal(
  `select count(*) from public.ai_usage u join auth.users a on a.id = u.user_id where a.email = '${email}' and u.feature = 'translate_shared'`
).trim())
const quotaUsageOf = (email: string): number => Number(sqlLocal(
  `select count(*) from public.ai_usage u join auth.users a on a.id = u.user_id where a.email = '${email}' and u.feature <> 'translate_shared' and u.created_at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`
).trim())
const globalSharedUsage = (): number => Number(sqlLocal(`select count(*) from public.ai_usage where feature = 'translate_shared'`).trim())

test('(v2-tr1) lien public /en/r/<jeton> : texte d\'origine puis traduction anglaise, sans compte', async ({ browser, baseURL }) => {
  const admin = await signedIn('admin')
  const title = `${E2E_6B}Tarte du lien`
  const id = await createRecipe(admin.client, title, 'private')
  const { data: token, error } = await admin.client.rpc('create_share_link', { p_recipe: id })
  expect(error).toBeNull()

  const before = globalSharedUsage()
  const quotaBefore = quotaUsageOf('admin@local.test')
  const anon = await browser.newContext({ baseURL, locale: 'en-US' })
  const page = await anon.newPage()
  await gotoApp(page, `/en/r/${token as string}`)
  // La traduction se fait en arrière-plan : le titre anglais apparaît, la mention « en cours » disparaît.
  await expect(page.getByRole('heading', { name: `[EN] ${title}` })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('public-language-hint')).toContainText('Automatically translated')
  expect(globalSharedUsage()).toBe(before + 1)                       // compté dans le budget global du mois
  expect(quotaUsageOf('admin@local.test')).toBe(quotaBefore)         // pas dans le plafond du jour de l'auteur

  // Page française du même lien : texte d'origine, aucun nouvel appel
  await gotoApp(page, `/r/${token as string}`)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  expect(globalSharedUsage()).toBe(before + 1)
  await anon.close()
})

test('(v2-tr2) droit à une personne : sa fiche, sa liste et sa notification en anglais, budget global seulement, plafond de personne intact', async ({ page }) => {
  const admin = await signedIn('admin')
  const user = await signedIn('user')
  const title = `${E2E_6B}Tarte partagée`
  const id = await createRecipe(admin.client, title, 'private')
  expect((await admin.client.rpc('grant_recipe', { p_recipe: id, p_grantee_user: user.userId, p_permission: 'read' })).error).toBeNull()

  const globalBefore = globalSharedUsage()
  const authorQuotaBefore = quotaUsageOf('admin@local.test')
  const readerQuotaBefore = quotaUsageOf('user@local.test')
  const authorSharedBefore = sharedUsageOf('admin@local.test')
  await loginV2(page, 'user')
  await gotoApp(page, `/en/recettes/${id}`)
  await expect(page.getByRole('heading', { name: `[EN] ${title}` })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('recipe-language-hint')).toContainText('Automatically translated')
  expect(globalSharedUsage()).toBe(globalBefore + 1)                  // une ligne, dans le budget global du mois
  expect(sharedUsageOf('admin@local.test')).toBe(authorSharedBefore + 1)
  expect(quotaUsageOf('admin@local.test')).toBe(authorQuotaBefore)    // plafond du jour de l'auteur intact
  expect(quotaUsageOf('user@local.test')).toBe(readerQuotaBefore)     // plafond de la personne qui lit intact

  // Une fois traduite, la recette l'est partout : liste « partagées avec moi » et notification
  await gotoApp(page, '/en/partagees')
  await expect(page.getByTestId('shared-recipe').filter({ hasText: `[EN] ${title}` })).toBeVisible()
  await gotoApp(page, '/en/notifications')
  await expect(page.getByTestId('notification-text').filter({ hasText: `[EN] ${title}` }).first()).toBeVisible()
  expect(globalSharedUsage()).toBe(globalBefore + 1)
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
