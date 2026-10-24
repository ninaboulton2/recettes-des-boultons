import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { waitForHydration } from '../support/app'
import { SUPABASE_SERVICE_KEY } from '../support/env'
import { cleanup6DE, createDisposableUser, createRecipe, E2E_6D, loginAs, loginV2, signedIn, sqlLocal, userExists } from './support'

/**
 * Phase 6D : réglages (langue, notifications, visibilité), export de mes données, suppression de compte
 * (bloquée par un groupe, puis réussie ; reconnexion exigée). Base `npm run db:local:v2`. Les suppressions utilisent
 * des comptes jetables créés par l'API d'administration locale (clé service_role locale dans .env.local).
 */
test.beforeEach(() => { cleanup6DE() })
test.afterAll(() => { cleanup6DE() })

async function restoreUserPreferences(): Promise<void> {
  const { client, userId } = await signedIn('user')
  await client.from('profiles').update({ language: 'fr', notifications: true, discoverable: true }).eq('id', userId)
  await client.auth.signOut({ scope: 'local' })
}

test('(6d-settings) langue, notifications et visibilité : enregistrées en base, interface passée en anglais', async ({ page }) => {
  await restoreUserPreferences()
  await loginV2(page, 'user')
  await page.goto('/reglages')
  await waitForHydration(page)

  const prefs = page.getByTestId('settings-preferences')
  await expect(prefs.getByRole('switch', { name: /Notifications par e-mail/ })).toBeChecked()
  await expect(prefs.getByRole('switch', { name: /Visible dans la recherche/ })).toBeChecked()
  await prefs.getByRole('switch', { name: /Notifications par e-mail/ }).click()
  await prefs.getByRole('switch', { name: /Visible dans la recherche/ }).click()
  await prefs.getByTestId('settings-language-en').check()
  await prefs.getByTestId('prefs-save').click()

  // L'interface passe en anglais (route /en/…)
  await expect(page).toHaveURL(/\/en\/reglages$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')

  const { client, userId } = await signedIn('user')
  const { data } = await client.from('profiles').select('language, notifications, discoverable').eq('id', userId).single()
  expect(data).toEqual({ language: 'en', notifications: false, discoverable: false })
  await client.auth.signOut({ scope: 'local' })

  // Rechargée, la page relit les valeurs enregistrées
  await page.reload()
  await waitForHydration(page)
  await expect(page.getByTestId('settings-preferences').getByRole('switch', { name: /E-mail notifications/ })).not.toBeChecked()
  await expect(page.getByTestId('settings-preferences').getByRole('switch', { name: /Visible in search/ })).not.toBeChecked()
  await restoreUserPreferences()
})

test('(6d-export) télécharge un JSON lisible ; la 4e demande du jour est refusée avec un message clair', async ({ page }) => {
  await loginV2(page, 'user')
  await page.goto('/reglages')
  await waitForHydration(page)

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-button').click()])
  expect(download.suggestedFilename()).toMatch(/^mes-donnees-recettes-\d{4}-\d{2}-\d{2}\.json$/)
  const path = await download.path()
  const raw = readFileSync(path, 'utf8')
  expect(raw).toContain('\n  "data": {')   // indenté
  const file = JSON.parse(raw)
  expect(file.export.format_version).toBe(1)
  expect(file.data).toHaveProperty('profile')
  expect(file.data).toHaveProperty('recipes')
  expect(file.data.profile.email ?? 'user@local.test').toBeTruthy()
  // aucun identifiant ni e-mail d'une autre personne : l'e-mail de l'admin n'apparaît nulle part
  expect(raw).not.toContain('admin@local.test')
  await expect(page.getByTestId('export-done')).toBeVisible()

  // 3 par jour : 2 de plus passent, la 4e est refusée
  await page.getByTestId('export-button').click()
  await expect(page.getByTestId('export-done')).toBeVisible()
  await page.getByTestId('export-button').click()
  await page.waitForTimeout(500)
  const fourth = page.getByTestId('export-button')
  await fourth.click()
  await expect(page.getByTestId('export-error')).toHaveText('Vous avez déjà fait 3 exports aujourd\'hui. Réessayez demain.')
  sqlLocal('delete from private.rate_events')
})

test('(6d-delete1) suppression bloquée par un groupe, puis réussie après le transfert du rôle', async ({ page }) => {
  test.skip(!SUPABASE_SERVICE_KEY, 'clé service_role locale absente')
  const me = await createDisposableUser('suppr')
  const friend = await signedIn('ami')
  // le compte jetable crée un groupe et y invite « ami », qui accepte
  const group = await me.client.rpc('create_group', { p_name: `${E2E_6D}bloquant` })
  expect(group.error).toBeNull()
  const groupId = group.data as string
  const invited = await me.client.rpc('invite_to_group', { p_group: groupId, p_user: friend.userId })
  expect(invited.error).toBeNull()
  const joined = await friend.client.rpc('respond_group_invitation', { p_id: invited.data as string, p_accept: true })
  expect(joined.error).toBeNull()
  // une recette à lui
  const recipeId = await createRecipe(me.client, `${E2E_6D}recette`, 'private')

  await loginAs(page, me.email)
  await page.goto('/reglages')
  await waitForHydration(page)
  await page.getByTestId('deletion-start').click()

  const blockers = page.getByTestId('deletion-blockers')
  await expect(blockers).toContainText(`${E2E_6D}bloquant`)
  await expect(blockers).toContainText('1 autre membre')
  await page.getByRole('link', { name: 'Gérer ce groupe' }).click()
  await expect(page).toHaveURL(new RegExp(`/groupes/${groupId}$`))

  // la personne transfère le rôle (l'écran du groupe le propose : testé en 6C), puis revient
  const transfer = await me.client.rpc('transfer_group_ownership', { p_group: groupId, p_new_creator: friend.userId })
  expect(transfer.error).toBeNull()
  await page.goto('/reglages')
  await waitForHydration(page)
  await page.getByTestId('deletion-start').click()

  // confirmation forte : le bouton reste grisé tant que l'adresse n'est pas exacte
  const confirm = page.getByTestId('deletion-confirm')
  await expect(page.getByTestId('deletion-consequences')).toContainText('Vos recettes sont supprimées')
  await expect(confirm).toBeDisabled()
  await page.getByTestId('deletion-email').fill('autre@local.test')
  await expect(confirm).toBeDisabled()
  await page.getByTestId('deletion-email').fill(me.email.toUpperCase())
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(page).toHaveURL(/\/compte-supprime$/)
  await expect(page.getByTestId('account-deleted')).toContainText('Compte supprimé')
  // déconnectée, compte et recette disparus, le groupe reste à son nouveau créateur
  await expect(page.getByRole('banner').getByRole('button', { name: 'Connexion' })).toBeVisible()
  expect(await userExists(me.userId)).toBe(false)
  expect(sqlLocal(`select count(*) from public.recipes where id = '${recipeId}'`).trim()).toBe('0')
  expect(sqlLocal(`select count(*) from public.groups where id = '${groupId}'`).trim()).toBe('1')
})

test('(6d-delete2) connexion trop ancienne : reconnexion par mot de passe demandée, puis suppression reprise', async ({ page }) => {
  test.skip(!SUPABASE_SERVICE_KEY, 'clé service_role locale absente')
  const me = await createDisposableUser('reauth')
  await loginAs(page, me.email)
  await page.goto('/reglages')
  await waitForHydration(page)

  // Première tentative : le serveur répond « reconnexion exigée » (simulé ici ; la règle réelle est testée au niveau de la route, test suivant)
  let calls = 0
  await page.route('**/api/account/delete', async (route) => {
    calls += 1
    if (calls === 1) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 401, statusMessage: 'Reconnectez-vous pour confirmer cette action', data: { code: 'REAUTH_REQUIRED' } })
      })
    } else {
      await route.continue()
    }
  })
  await page.getByTestId('deletion-start').click()
  await page.getByTestId('deletion-email').fill(me.email)
  await page.getByTestId('deletion-confirm').click()

  const submit = page.getByTestId('deletion-reauth-submit')
  await expect(page.getByRole('dialog', { name: 'Confirmez que c\'est bien vous' })).toBeVisible()
  await page.getByTestId('deletion-password').fill('mauvais')
  await submit.click()
  await expect(page.getByTestId('deletion-reauth-error')).toHaveText('Mot de passe incorrect.')
  await page.getByTestId('deletion-password').fill('password123')
  await submit.click()

  await expect(page).toHaveURL(/\/compte-supprime$/)
  expect(calls).toBe(2)
  expect(await userExists(me.userId)).toBe(false)
})

test('(6d-delete3) route réelle : un jeton récent passe le contrôle de fraîcheur (adresse fausse = 400, rien n\'est supprimé)', async ({ request }) => {
  test.skip(!SUPABASE_SERVICE_KEY, 'clé service_role locale absente')
  const me = await createDisposableUser('iat')
  const { data } = await me.client.auth.getSession()
  const recent = await request.post('/api/account/delete', { headers: { Authorization: `Bearer ${data.session!.access_token}` }, data: { confirmEmail: 'faux@local.test' } })
  expect(recent.status()).toBe(400)
  expect(await userExists(me.userId)).toBe(true)
  // Le refus d'un jeton de plus de 10 minutes (401 REAUTH_REQUIRED) ne peut pas être fabriqué ici : la pile locale signe en ES256.
  // Il est couvert par test/unit/recentAuth.test.ts (règle et code), et le parcours d'interface par (6d-delete2).
})

test('(6d-escape) Échap ferme la confirmation de suppression sans rien supprimer', async ({ page }) => {
  test.skip(!SUPABASE_SERVICE_KEY, 'clé service_role locale absente')
  const me = await createDisposableUser('escape')
  await loginAs(page, me.email)
  await page.goto('/reglages')
  await waitForHydration(page)
  await page.getByTestId('deletion-start').click()
  const dialog = page.getByRole('dialog', { name: 'Supprimer définitivement mon compte ?' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  expect(await userExists(me.userId)).toBe(true)
})
