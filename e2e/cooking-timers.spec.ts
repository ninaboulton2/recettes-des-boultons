import { expect, test, type Page } from '@playwright/test'
import { E2E_PREFIX } from './support/accounts'
import { gotoApp } from './support/app'
import { createE2eTimedRecipe, deleteE2eRecipe, signedInClient } from './support/supabase'

/**
 * Minuteurs du mode cuisine : passer à l'étape suivante lance le minuteur de la
 * durée lue dans l'étape quittée ; il flotte pendant qu'on avance, sonne à
 * l'échéance (horloge de Playwright avancée) et se ferme. Parcours identiques en
 * desktop et mobile. Le son (Web Audio) et la vibration ne sont pas observables
 * ici : ils sont couverts par les tests unitaires.
 */

const STEPS = [
  'Préchauffer le four à 180 °C.',
  'Cuire 10 minutes à feu doux.',
  'Laisser reposer 5 minutes.',
  'Servir.'
]

let recipeId: string

test.beforeAll(async () => {
  const { client } = await signedInClient('admin')
  recipeId = await createE2eTimedRecipe(client, `${E2E_PREFIX}Minuteurs`, STEPS)
  await client.auth.signOut({ scope: 'local' })
})

test.afterAll(async () => {
  const { client } = await signedInClient('admin')
  await deleteE2eRecipe(client, recipeId)
  await client.auth.signOut({ scope: 'local' })
})

async function openCookingMode(page: Page) {
  // Horloge pilotable (fastForward) ; le temps continue de s'écouler normalement.
  await page.clock.install({ time: new Date() })
  await gotoApp(page, `/recettes/${recipeId}`)
  await page.getByRole('main').getByRole('button', { name: 'Mode cuisine', exact: true }).click()
  const cooking = page.locator('[data-cooking-mode]')
  await expect(cooking).toBeVisible()
  return cooking
}

const next = (page: Page) => page.locator('[data-cooking-mode]').getByRole('button', { name: 'Suivant', exact: true })

test('aller à l’étape suivante lance le minuteur, qui sonne puis se ferme', async ({ page }) => {
  const cooking = await openCookingMode(page)
  const timers = page.locator('[data-cooking-timer]')

  // Étape 1 : 180 °C n’est pas une durée.
  await expect(cooking.getByRole('button', { name: /Lancer le minuteur/ })).toHaveCount(0)
  await next(page).click()
  await expect(timers).toHaveCount(0)

  // Étape 2 : la durée est proposée, mais rien ne démarre avant de quitter l’étape.
  await expect(cooking.getByRole('button', { name: 'Lancer le minuteur · 10 min' })).toBeEnabled()
  await expect(timers).toHaveCount(0)
  await next(page).click()

  // Étape 3 : le minuteur de l’étape 2 flotte et continue.
  const timer = timers.first()
  await expect(timers).toHaveCount(1)
  await expect(timer).toContainText('Étape 2 · 10 min')
  await expect(timer.locator('[data-timer-clock]')).toHaveText(/^(10:00|09:5\d)$/)
  await expect(timer).toHaveAttribute('data-status', 'running')
  await expect(page.getByRole('status').filter({ hasText: 'Minuteur lancé pour l’étape 2 : 10 min.' })).toHaveCount(1)

  // Le temps passe : alerte visible et annonce assertive.
  await page.clock.fastForward('10:05')
  await expect(timer).toHaveAttribute('data-status', 'ringing')
  await expect(timer).toContainText('Terminé !')
  await expect(page.getByRole('alert').filter({ hasText: 'Minuteur terminé pour l’étape 2' })).toHaveCount(1)

  // Un clic sur « Arrêter » ferme l’alarme.
  await timer.getByRole('button', { name: 'Arrêter l’alarme du minuteur de l’étape 2' }).click()
  await expect(timers).toHaveCount(0)
})

test('plusieurs minuteurs empilés, pause, +1 min, annulation, sans doublon', async ({ page }) => {
  const cooking = await openCookingMode(page)
  const timers = page.locator('[data-cooking-timer]')

  await next(page).click()
  // Lancement manuel sur l’étape 2 ; le bouton se désactive (pas de doublon).
  await cooking.getByRole('button', { name: 'Lancer le minuteur · 10 min' }).click()
  await expect(timers).toHaveCount(1)
  await expect(cooking.getByRole('button', { name: 'Minuteur en cours · 10 min' })).toBeDisabled()

  // Passer à l’étape suivante ne relance pas celui de l’étape 2.
  await next(page).click()
  await expect(timers).toHaveCount(1)
  // Étape 3 -> 4 : le minuteur de 5 min s’ajoute.
  await next(page).click()
  await expect(timers).toHaveCount(2)
  await expect(timers.nth(0)).toContainText('Étape 2 · 10 min')
  await expect(timers.nth(1)).toContainText('Étape 3 · 5 min')

  // Pause : le décompte est figé.
  const second = timers.nth(1)
  await second.getByRole('button', { name: 'Mettre en pause le minuteur de l’étape 3' }).click()
  await expect(second).toHaveAttribute('data-status', 'paused')
  const frozen = await second.locator('[data-timer-clock]').textContent()
  await page.clock.fastForward('01:00')
  await expect(second.locator('[data-timer-clock]')).toHaveText(frozen ?? '')

  // +1 min sur le minuteur en pause, puis reprise.
  await second.getByRole('button', { name: 'Ajouter une minute au minuteur de l’étape 3' }).click()
  await expect(second.locator('[data-timer-clock]')).not.toHaveText(frozen ?? '')
  await second.getByRole('button', { name: 'Reprendre le minuteur de l’étape 3' }).click()
  await expect(second).toHaveAttribute('data-status', 'running')

  // Annulation du premier.
  await timers.nth(0).getByRole('button', { name: 'Annuler le minuteur de l’étape 2' }).click()
  await expect(timers).toHaveCount(1)
  await expect(timers.first()).toContainText('Étape 3 · 5 min')
})

test('quitter avec un minuteur demande confirmation ; Échap annule la confirmation', async ({ page }) => {
  const cooking = await openCookingMode(page)
  await next(page).click()
  await cooking.getByRole('button', { name: 'Lancer le minuteur · 10 min' }).click()
  await expect(page.locator('[data-cooking-timer]')).toHaveCount(1)

  await page.keyboard.press('Escape')
  const confirm = page.getByRole('dialog', { name: 'Quitter le mode cuisine ?' })
  await expect(confirm).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirm).toBeHidden()
  await expect(cooking).toBeVisible()
  await expect(page.locator('[data-cooking-timer]')).toHaveCount(1)

  await cooking.getByRole('button', { name: 'Quitter', exact: true }).click()
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Rester' }).click()
  await expect(cooking).toBeVisible()

  await cooking.getByRole('button', { name: 'Quitter', exact: true }).click()
  await confirm.getByRole('button', { name: 'Quitter', exact: true }).click()
  await expect(cooking).toBeHidden()

  // Rouvert : plus aucun minuteur.
  await page.getByRole('main').getByRole('button', { name: 'Mode cuisine', exact: true }).click()
  await expect(page.locator('[data-cooking-timer]')).toHaveCount(0)
})
