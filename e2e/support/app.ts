import { expect, type Page } from '@playwright/test'
import { ACCOUNTS, type AccountRole } from './accounts'

/**
 * Attend la fin de l'hydratation Nuxt : avant, les clics sur les boutons
 * rendus côté serveur ne déclenchent rien.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const app = (document.querySelector('#__nuxt') as (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } }) | null)?.__vue_app__
    return app?.$nuxt?.isHydrating === false
  }, undefined, { timeout: 30_000 })
}

/** Navigation + hydratation. */
export async function gotoApp(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await waitForHydration(page)
}

/** Vrai si la mise en page mobile est active (navigation en bas d'écran). */
export function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 768
}

/**
 * Connexion par la modale de l'app (bouton « Connexion » du header en
 * desktop, « Moi » de la barre de navigation en mobile).
 */
export async function loginThroughUi(page: Page, role: AccountRole): Promise<void> {
  const { email, password } = ACCOUNTS[role]
  if (isMobile(page)) {
    await page.getByRole('navigation', { name: 'Navigation' }).getByRole('button', { name: 'Moi' }).click()
  } else {
    await page.getByRole('banner').getByRole('button', { name: 'Connexion' }).click()
  }
  const dialog = page.getByRole('dialog', { name: 'Connexion' })
  await dialog.getByRole('textbox', { name: 'Email' }).fill(email)
  await dialog.getByRole('textbox', { name: 'Mot de passe' }).fill(password)
  await dialog.getByRole('button', { name: 'Se connecter' }).click()
  await expect(dialog).toBeHidden()
}

/**
 * Champ de recherche de /recettes, par son libellé « Rechercher » (relié au
 * champ par un id fixe, y compris dans le build de production).
 */
export function searchBox(page: Page) {
  return page.getByRole('main').getByRole('searchbox', { name: 'Rechercher', exact: true })
}
