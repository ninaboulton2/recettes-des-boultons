import { expect, test } from '@playwright/test'
import { boultonsEdition } from '../../shared/editions/boultons'
import { gotoApp, waitForHydration } from '../support/app'
import { cssVar, loginV2, signedIn } from './support'

/**
 * Thèmes (user@local.test, membre du groupe « Les Boultons » dont le thème est le préréglage `boultons`) :
 * look d'origine, passage au thème personnel (préréglage puis couleur libre), refus d'une couleur illisible,
 * retour au thème du groupe. La base est remise comme avant.
 */
let groupId: string
let before: { theme_settings: unknown, active_theme_group_id: string | null }

test.beforeAll(async () => {
  const { client, userId } = await signedIn('user')
  const { data } = await client.from('profiles').select('theme_settings, active_theme_group_id').eq('id', userId).single()
  before = data as typeof before
  groupId = before.active_theme_group_id as string
  expect(groupId, 'user@local.test doit avoir le thème du groupe Boultons (setup_v2.sh)').toBeTruthy()
})

test.afterAll(async () => {
  const { client, userId } = await signedIn('user')
  await client.from('profiles').update({ theme_settings: before.theme_settings, active_theme_group_id: before.active_theme_group_id }).eq('id', userId)
})

test('(v2-th1) thème du groupe Boultons, puis thème personnel, puis retour', async ({ page }) => {
  await loginV2(page, 'user')
  await page.reload()
  await waitForHydration(page)

  // Look d'origine (rendu serveur, sans flash)
  await expect(page.locator('html')).toHaveAttribute('data-edition', 'boultons')
  expect(await cssVar(page, '--color-primary-500')).toBe(boultonsEdition.theme.primary[500])
  expect(await cssVar(page, '--ui-primary')).toBe(boultonsEdition.theme.primary[boultonsEdition.theme.primaryShade.light])
  await expect(page.getByTestId('site-name')).toHaveText('Recettes des Boultons')

  await gotoApp(page, '/reglages')
  const themeSection = page.getByTestId('settings-theme')
  await themeSection.getByTestId('theme-source-personal').check()
  await themeSection.getByTestId('theme-preset-olive').click()
  await expect.poll(() => cssVar(page, '--color-primary-500')).toBe('#6f8a3a')

  // Couleur libre : trop claire = refusée, avec explication ; valide = appliquée
  await themeSection.getByTestId('theme-preset-custom').click()
  const hex = themeSection.locator('#theme-custom-hex')
  await hex.fill('#ffffff')
  await expect(themeSection.getByTestId('theme-custom')).toContainText('trop claire')
  await hex.fill('#aa4466')
  await expect.poll(() => cssVar(page, '--color-primary-500')).toBe('#aa4466')

  await themeSection.getByTestId('theme-save').click()
  await expect.poll(async () => {
    const { client, userId } = await signedIn('user')
    const { data } = await client.from('profiles').select('theme_settings, active_theme_group_id').eq('id', userId).single()
    return data
  }).toEqual({ theme_settings: { preset: 'custom', primary: '#aa4466', neutral: 'stone' }, active_theme_group_id: null })

  // Persistant au rechargement (rendu serveur)
  await page.reload()
  await waitForHydration(page)
  await expect(page.locator('html')).toHaveAttribute('data-edition', 'generic')
  expect(await cssVar(page, '--color-primary-500')).toBe('#aa4466')

  // Retour au thème du groupe
  await themeSection.getByTestId(`theme-source-${groupId}`).check()
  await themeSection.getByTestId('theme-save').click()
  await expect(page.locator('html')).toHaveAttribute('data-edition', 'boultons')
  expect(await cssVar(page, '--color-primary-500')).toBe(boultonsEdition.theme.primary[500])
})
