import { expect, test, type Page } from '@playwright/test'
import { waitForHydration } from '../support/app'
import { loginV2, logoutV2, sqlLocal } from './support'

/**
 * Phase 7 : IA ouverte à tous, crédit épuisé, plafond du jour. Base `npm run db:local:v2` (0028 appliquée), serveur avec
 * `AI_PROVIDER=mock` : aucun appel payant, aucun e-mail (Resend vide). L'état « crédit épuisé » est posé par la même fonction SQL
 * que celle appelée par le serveur à la première erreur de facturation (`report_ai_billing_error`).
 */
const SAMPLE = 'Gâteau test phase sept\nIngrédients : 200 g de farine, 100 g de sucre, 2 oeufs.\nMélanger puis cuire 30 minutes à 180 degrés.'

function resetAi(): void {
  sqlLocal(`
    delete from public.system_alerts where key in ('ai_credit', 'ai_budget');
    update public.profiles set ai_daily_quota = null where email in ('user@local.test', 'admin@local.test');
    delete from public.ai_usage where user_id in (select id from auth.users where email in ('user@local.test', 'admin@local.test'));
  `)
}
test.beforeEach(() => { resetAi() })
test.afterAll(() => { resetAi() })

const recipeText = (page: Page) => page.getByRole('textbox', { name: 'Texte de la recette' })
const submit = (page: Page) => page.getByRole('button', { name: 'Structurer la recette' })

async function openTranslator(page: Page): Promise<void> {
  await page.goto('/traducteur')
  await waitForHydration(page)
  await expect(recipeText(page)).toBeVisible()
}

test('(p7-credit) crédit épuisé : boutons IA désactivés pour tous avec un message clair, 503 côté serveur, support réactive', async ({ page }) => {
  sqlLocal('select public.report_ai_billing_error()')

  await loginV2(page, 'user')
  await openTranslator(page)
  const notice = page.getByTestId('ai-status-notice')
  await expect(notice).toBeVisible()
  await expect(notice).toHaveAttribute('data-reason', 'credit')
  await expect(notice).toContainText('momentanément indisponibles')
  await expect(notice).toContainText('saisir la recette à la main')
  await recipeText(page).fill(SAMPLE)
  await expect(submit(page)).toBeDisabled()
  await expect(page.getByRole('button', { name: /Enregistrer la dictée|Dicter/ })).toBeDisabled()

  // le serveur refuse aussi (503 + code), sans passer par l'interface
  const response = await page.request.post('/api/translate-recipe', { data: { recipeText: SAMPLE } })
  expect(response.status()).toBe(503)
  expect((await response.json()).data).toMatchObject({ code: 'AI_UNAVAILABLE' })

  // le support voit l'état et réactive l'IA
  await logoutV2(page)
  await loginV2(page, 'admin')
  await page.goto('/support/signalements')
  await waitForHydration(page)
  await expect(page.getByTestId('support-ai-state')).toContainText('Crédit IA épuisé')
  await page.getByTestId('support-ai-reactivate').click()
  await expect(page.getByTestId('support-ai-badge')).toContainText('L\'IA fonctionne')
  await expect(page.getByTestId('support-ai-reactivate')).toHaveCount(0)
  expect(sqlLocal(`select status from public.system_alerts where key = 'ai_credit'`).trim()).toBe('ok')

  // et le bouton redevient utilisable
  await logoutV2(page)
  await loginV2(page, 'user')
  await openTranslator(page)
  await expect(page.getByTestId('ai-status-notice')).toHaveCount(0)
  await recipeText(page).fill(SAMPLE)
  await expect(submit(page)).toBeEnabled()
})

test('(p7-quota) plafond du jour atteint : message avec l\'heure de remise à zéro, distinct du crédit épuisé', async ({ page }) => {
  sqlLocal(`
    update public.profiles set ai_daily_quota = 2 where email = 'user@local.test';
    insert into public.ai_usage (user_id, provider, model, status)
      select id, 'mock', 'mock-recipe', 'ok' from auth.users, generate_series(1, 2) where email = 'user@local.test';
  `)
  await loginV2(page, 'user')
  await openTranslator(page)
  const notice = page.getByTestId('ai-status-notice')
  await expect(notice).toHaveAttribute('data-reason', 'quota')
  await expect(notice).toContainText('Quota du jour atteint')
  await expect(notice).toContainText('2 appels IA')
  await expect(notice).toContainText('00:00')
  await expect(notice).not.toContainText('momentanément indisponibles')
  await recipeText(page).fill(SAMPLE)
  await expect(submit(page)).toBeDisabled()

  const response = await page.request.post('/api/translate-recipe', { data: { recipeText: SAMPLE } })
  expect(response.status()).toBe(429)
  expect((await response.json()).data).toMatchObject({ code: 'AI_QUOTA_REACHED', quota: 2 })

  // un autre compte n'est pas concerné
  await logoutV2(page)
  await loginV2(page, 'admin')
  await openTranslator(page)
  await expect(page.getByTestId('ai-status-notice')).toHaveCount(0)
})

test('(p7-remaining) un appel réussi (fournisseur simulé) est compté sur le plafond de la personne', async ({ page }) => {
  sqlLocal(`update public.profiles set ai_daily_quota = 5 where email = 'user@local.test'`)
  await loginV2(page, 'user')
  await openTranslator(page)
  await expect(page.getByTestId('ai-remaining')).toContainText('5 appels IA aujourd\'hui sur 5')
  await recipeText(page).fill(SAMPLE)
  await submit(page).click()
  await expect(page.getByText('Aperçu avant ajout')).toBeVisible()
  expect(sqlLocal(`select count(*) from public.ai_usage u join auth.users a on a.id = u.user_id where a.email = 'user@local.test'`).trim()).toBe('1')
})

test('(p7-cron) routes cron : fermées sans le secret ; avec le secret, sans Resend rien ne part ; la sonde lève l\'alerte', async ({ request }) => {
  for (const path of ['/api/cron/notification-emails', '/api/cron/ai-credit-probe']) {
    expect([401, 503]).toContain((await request.get(path)).status())
    expect([401, 503]).toContain((await request.get(path, { headers: { authorization: 'Bearer pas-le-bon-secret-du-tout' } })).status())
  }
  const secret = process.env.CRON_SECRET ?? ''
  test.skip(secret.length < 16, 'CRON_SECRET (16 caractères au moins) absent de .env.local')
  const headers = { authorization: `Bearer ${secret}` }

  // Resend non configuré en local : rien n'est réclamé ni envoyé
  sqlLocal(`insert into public.notifications (user_id, type, payload) select id, 'friend_request', '{"from_name":"Test"}' from auth.users where email = 'user@local.test'`)
  const mails = await request.get('/api/cron/notification-emails', { headers })
  expect(mails.status()).toBe(200)
  expect(await mails.json()).toMatchObject({ skipped: 'not_configured', claimed: 0, sent: 0 })
  expect(sqlLocal(`select count(*) from public.notifications where emailed_at is not null`).trim()).toBe('0')
  sqlLocal('delete from public.notifications')

  // sonde : sans alerte, aucun appel ; avec alerte, le fournisseur simulé répond et l'alerte est levée
  const idle = await request.get('/api/cron/ai-credit-probe', { headers })
  expect(await idle.json()).toEqual({ status: 'idle' })
  sqlLocal('select public.report_ai_billing_error()')
  const probe = await request.get('/api/cron/ai-credit-probe', { headers })
  expect(await probe.json()).toEqual({ status: 'reset', changed: true })
  expect(sqlLocal(`select status from public.system_alerts where key = 'ai_credit'`).trim()).toBe('ok')
})

test('(p7-billing) le fournisseur (simulé) refuse faute de crédit : alerte enregistrée, message clair, boutons désactivés ; un simple débit ne déclenche rien', async ({ page }) => {
  await loginV2(page, 'user')
  await openTranslator(page)

  // simple limite de débit : message « très sollicité », aucune alerte
  await recipeText(page).fill(`${SAMPLE}\n__MOCK_AI_RATE_LIMIT__`)
  await submit(page).click()
  await expect(page.getByText('très sollicité')).toBeVisible()
  expect(sqlLocal(`select count(*) from public.system_alerts where key = 'ai_credit'`).trim()).toBe('0')
  await expect(page.getByTestId('ai-status-notice')).toHaveCount(0)

  // crédit épuisé : 429 insufficient_quota → alerte, e-mail à Nina (ignoré ici : Resend non configuré), IA coupée pour tous
  await recipeText(page).fill(`${SAMPLE}\n__MOCK_AI_NO_CREDIT__`)
  await submit(page).click()
  await expect(page.getByTestId('ai-status-notice')).toHaveAttribute('data-reason', 'credit')
  await expect(page.getByText('momentanément indisponibles').first()).toBeVisible()
  await expect(submit(page)).toBeDisabled()
  expect(sqlLocal(`select status || ':' || count || ':' || (notified_at is not null) from public.system_alerts where key = 'ai_credit'`).trim()).toBe('alert:1:true')

  // un autre compte (admin) est lui aussi coupé
  await logoutV2(page)
  await loginV2(page, 'admin')
  await openTranslator(page)
  await expect(page.getByTestId('ai-status-notice')).toHaveAttribute('data-reason', 'credit')
})
