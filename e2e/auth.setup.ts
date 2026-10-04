import { expect, test as setup } from '@playwright/test'
import { storageStatePath, type AccountRole } from './support/accounts'
import { gotoApp, loginThroughUi } from './support/app'

/**
 * Connexion par l'interface (modale « Connexion ») de chaque compte, puis
 * sauvegarde de la session (cookies @nuxtjs/supabase) réutilisée par les
 * parcours authentifiés.
 */
for (const role of ['user', 'admin'] as const satisfies AccountRole[]) {
  setup(`connexion ${role}`, async ({ page }) => {
    await gotoApp(page, '/')
    await loginThroughUi(page, role)
    // Le menu utilisateur remplace le bouton « Connexion ».
    await expect(page.getByRole('banner').getByRole('button', { name: 'Connexion' })).toBeHidden()
    await page.context().storageState({ path: storageStatePath(role) })
  })
}
