import { expect, test } from '@playwright/test'
import { waitForHydration } from '../support/app'
import { boultonsEdition } from '../../shared/editions/boultons'
import { cssVar, loginV2, resetNewcomer, signedIn } from './support'

/**
 * Accueil d'un compte neuf (nouveau@local.test) en 3 écrans : pseudonyme (erreurs d'unicité et de caractères),
 * titre du carnet, thème (aperçu en direct), fin. Nécessite la base `npm run db:local:v2`.
 */
test.beforeEach(async () => { await resetNewcomer() })
test.afterAll(async () => { await resetNewcomer() })

test('(v2-ob1) 3 écrans : pseudonyme, titre, thème, puis accueil', async ({ page }) => {
  await loginV2(page, 'nouveau')

  // Un compte non accueilli est renvoyé sur l'accueil, même pour une autre page.
  await page.goto('/recettes')
  await expect(page).toHaveURL(/\/onboarding$/)
  await expect(page.getByTestId('onboarding-progress')).toHaveText('Étape 1 sur 3')
  await waitForHydration(page)

  // Écran 1 : obligatoire, « @ » refusé, pseudonyme déjà pris (celui d'un autre compte, casse et accents ignorés)
  const name = page.getByTestId('onboarding-display-name')
  const next = page.getByTestId('onboarding-next')
  await next.click()
  await expect(page.getByTestId('onboarding-name-help')).toHaveText('Le pseudonyme est obligatoire.')
  await name.fill('nina@exemple.fr')
  await next.click()
  await expect(page.getByTestId('onboarding-name-help')).toContainText('« @ »')
  await name.fill('ADMIN')
  await next.click()
  await expect(page.getByTestId('onboarding-name-help')).toHaveText('Ce pseudonyme est déjà pris.')
  await name.fill('Nouvelle cuisinière')
  await next.click()

  // Écran 2 : titre proposé « Recettes de … », modifiable
  await expect(page.getByTestId('onboarding-progress')).toHaveText('Étape 2 sur 3')
  const title = page.getByTestId('onboarding-cookbook-title')
  await expect(title).toHaveValue('Recettes de Nouvelle cuisinière')
  await title.fill('Carnet de test')
  await next.click()

  // Écran 3 : aperçu en direct du thème Océan
  await expect(page.getByTestId('onboarding-progress')).toHaveText('Étape 3 sur 3')
  await page.getByTestId('theme-preset-ocean').click()
  await expect.poll(() => cssVar(page, '--color-primary-500')).toBe('#2f74b5')
  await next.click()

  await expect(page).toHaveURL(/\/$/)
  const { client, userId } = await signedIn('nouveau')
  const { data } = await client.from('profiles').select('display_name, cookbook_title, onboarded_at, theme_settings').eq('id', userId).single()
  expect(data).toMatchObject({ display_name: 'Nouvelle cuisinière', cookbook_title: 'Carnet de test', theme_settings: { preset: 'ocean' } })
  expect(data?.onboarded_at).toBeTruthy()
  const { count } = await client.from('categories').select('id', { count: 'exact', head: true }).eq('owner_id', userId)
  expect(count).toBe(9)

  // Accueil terminé : plus de redirection, et la page d'accueil du compte est ouvrable
  await page.goto('/onboarding')
  await expect(page).toHaveURL(/\/$/)
  expect(await cssVar(page, '--color-primary-500')).toBe('#2f74b5')
  expect(await cssVar(page, '--color-primary-500')).not.toBe(boultonsEdition.theme.primary[500])
})
