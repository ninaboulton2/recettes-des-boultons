import { expect, test } from '@playwright/test'
import { waitForHydration } from '../support/app'
import { loginV2, signedIn } from './support'

/** Navigation v2, cloche, pages « bientôt », bannière « Explorer les recettes de X » (fermeture mémorisée). */
let recipeId: string | undefined

// Une recette de l'admin, lisible par le groupe et pas encore dans le carnet de user@ : déclenche « Explorer les recettes de Admin ».
test.beforeAll(async () => {
  const { client } = await signedIn('admin')
  const { data, error } = await client.from('recipes').insert({ title: 'E2E_Bannière', category: 'plats', visibility: 'groups' }).select('id').single()
  if (error) throw new Error(error.message)
  recipeId = (data as { id: string }).id
})

test.afterAll(async () => {
  const { client, userId } = await signedIn('user')
  await client.from('dismissed_prompts').delete().eq('user_id', userId)
  const admin = await signedIn('admin')
  if (recipeId) await admin.client.from('recipes').delete().eq('id', recipeId)
})

test('(v2-nav1) entrées de navigation, pages amis et notifications', async ({ page }) => {
  await loginV2(page, 'user')
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  for (const label of ['Mon carnet', 'Partagées avec moi', 'Amis', 'Groupes']) await expect(nav.getByRole('link', { name: label })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Planning' })).toHaveCount(0)
  await expect(page.getByTestId('notification-bell')).toBeVisible()

  await nav.getByRole('link', { name: 'Amis' }).click()
  await expect(page.getByTestId('friends-page')).toBeVisible()
  await page.getByTestId('notification-bell').click()
  await expect(page).toHaveURL(/\/notifications$/)
  await expect(page.getByTestId('notifications-page')).toBeVisible()

  await page.getByRole('banner').getByRole('button', { name: /user|Utilisateur/i }).click()
  await expect(page.getByRole('menuitem', { name: 'Réglages' })).toBeVisible()
})

test('(v2-nav2) bannières : fermer les rend définitivement invisibles', async ({ page }) => {
  await loginV2(page, 'user')
  const banners = page.getByTestId('prompt-banner')
  await expect(banners.first()).toContainText(/Explorer les recettes de|a ajouté une recette/)
  // Selon les données : « Explorer les recettes de X » et / ou « X a ajouté une recette »
  while (await banners.count() > 0) {
    const before = await banners.count()
    await banners.first().getByTestId('prompt-dismiss').click()
    await expect(banners).toHaveCount(before - 1)
  }
  await page.reload()
  await waitForHydration(page)
  await expect(page.getByTestId('prompt-banners')).toHaveCount(0)
})
