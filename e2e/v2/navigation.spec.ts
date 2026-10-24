import { expect, test } from '@playwright/test'
import { loginV2, signedIn } from './support'

/** Navigation v2, cloche, pages « bientôt », bannière « Explorer les recettes de X » (fermeture mémorisée). */
test.afterAll(async () => {
  const { client, userId } = await signedIn('user')
  await client.from('dismissed_prompts').delete().eq('user_id', userId)
})

test('(v2-nav1) entrées de navigation et pages à venir', async ({ page }) => {
  await loginV2(page, 'user')
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  for (const label of ['Mon carnet', 'Partagées avec moi', 'Amis', 'Groupes']) await expect(nav.getByRole('link', { name: label })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Planning' })).toHaveCount(0)
  await expect(page.getByTestId('notification-bell')).toBeVisible()

  await nav.getByRole('link', { name: 'Amis' }).click()
  await expect(page.getByTestId('coming-soon')).toBeVisible()
  await page.getByTestId('notification-bell').click()
  await expect(page).toHaveURL(/\/notifications$/)

  await page.getByRole('banner').getByRole('button', { name: /user|Utilisateur/i }).click()
  await expect(page.getByRole('menuitem', { name: 'Réglages' })).toBeVisible()
})

test('(v2-nav2) bannière « Explorer les recettes de X » : fermer la rend définitivement invisible', async ({ page }) => {
  await loginV2(page, 'user')
  const banner = page.getByTestId('prompt-banner').first()
  await expect(banner).toContainText('Explorer les recettes de')
  await banner.getByTestId('prompt-dismiss').click()
  await expect(page.getByTestId('prompt-banners')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('prompt-banners')).toHaveCount(0)
})
