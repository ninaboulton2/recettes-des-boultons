import { expect, test } from '@playwright/test'
import { boultonsEdition } from '../../shared/editions/boultons'
import { gotoApp, waitForHydration } from '../support/app'
import { E2E_6C, cssVar, createGroupWith, loginV2, signedIn, sqlLocal } from './support'

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

// Thème « Les Boultons » réservé (migration 0034) : grisé et expliqué pour les autres, choisissable par les membres du groupe.
const RESERVED_NOTE = 'Thème réservé aux Boultons. Demandez à un membre de la famille de vous ajouter au groupe.'

test('(v2-th2) membre de Les Boultons : le préréglage Boultons reste choisissable dans son sélecteur personnel', async ({ page }) => {
  await loginV2(page, 'user')
  await gotoApp(page, '/reglages')
  const themeSection = page.getByTestId('settings-theme')
  await themeSection.getByTestId('theme-source-personal').check()
  const boultons = themeSection.getByTestId('theme-preset-boultons')
  await expect(boultons).not.toHaveAttribute('data-unavailable', 'true')
  await expect(boultons.locator('input')).toBeEnabled()
  await expect(themeSection.getByTestId('theme-reserved-note')).toHaveCount(0)
  await boultons.click()
  await themeSection.getByTestId('theme-save').click()
  await expect.poll(async () => {
    const { client, userId } = await signedIn('user')
    const { data } = await client.from('profiles').select('theme_settings').eq('id', userId).single()
    return data?.theme_settings
  }).toMatchObject({ preset: 'boultons' })
})

test('(v2-th3) hors des Boultons : la base refuse un enregistrement forcé du préréglage Boultons (RPC et écriture directe)', async () => {
  // Un appel direct à l'API est refusé (SQLSTATE 42501) ; l'interface grisée est vérifiée dans onboarding.spec (v2-ob1).
  const ami = await signedIn('ami')
  const forced = await ami.client.rpc('update_my_profile', { p_theme_settings: { preset: 'boultons' } })
  expect(forced.error?.code).toBe('42501')
  expect(forced.error?.message).toContain('Boultons')
  const direct = await ami.client.from('profiles').update({ theme_settings: { preset: 'boultons' } }).eq('id', ami.userId)
  expect(direct.error?.code).toBe('42501')
})

test('(v2-th4) créateur d\'un AUTRE groupe : pas de thème Boultons pour son groupe (interface et base)', async ({ page }) => {
  const name = `${E2E_6C}Th4 Groupe`
  const groupId = await createGroupWith('user', name, [])
  try {
    const { client } = await signedIn('user')
    // user@ est membre de Les Boultons ET créateur de ce groupe : le refus vaut quand même pour le groupe
    const refused = await client.rpc('update_group_theme', { p_group: groupId, p_theme: { preset: 'boultons' } })
    expect(refused.error?.code).toBe('42501')
    const ok = await client.rpc('update_group_theme', { p_group: groupId, p_theme: { preset: 'olive' } })
    expect(ok.error).toBeNull()

    await loginV2(page, 'user')
    await gotoApp(page, `/groupes/${groupId}`)
    const reserved = page.getByTestId('theme-preset-boultons')
    await expect(reserved).toHaveAttribute('data-unavailable', 'true')
    await expect(reserved.locator('input')).toBeDisabled()
    await expect(page.getByTestId('theme-reserved-note')).toHaveText(RESERVED_NOTE)

  } finally {
    sqlLocal(`delete from public.groups where name = '${name}';`)
  }
})

// Le groupe Les Boultons (dont admin@local.test est le créateur) garde son thème : le préréglage reste sélectionnable pour lui.
test('(v2-th5) le groupe Les Boultons garde son thème : préréglage disponible pour son créateur', async ({ page }) => {
  await loginV2(page, 'admin')
  await gotoApp(page, `/groupes/${await boultonsGroupId('admin')}`)
  await expect(page.getByTestId('theme-preset-boultons')).toBeVisible()
  await expect(page.getByTestId('theme-preset-boultons')).not.toHaveAttribute('data-unavailable', 'true')
  await expect(page.getByTestId('theme-reserved-note')).toHaveCount(0)
})

async function boultonsGroupId(account: 'user' | 'admin' = 'user'): Promise<string> {
  const { client } = await signedIn(account)
  const { data, error } = await client.rpc('list_my_groups')
  if (error) throw new Error(error.message)
  const group = ((data ?? []) as Array<{ name: string, group_id: string }>).find(candidate => candidate.name === 'Les Boultons')
  if (!group) throw new Error('Groupe Les Boultons introuvable')
  return group.group_id as string
}
