import { expect, test } from '@playwright/test'
import { e2eName, storageStatePath } from './support/accounts'
import { gotoApp } from './support/app'
import { signedInClient } from './support/supabase'

test.use({ storageState: storageStatePath('user') })

let mealTitle: string

test.afterEach(async () => {
  const { client } = await signedInClient('user')
  await client.from('planning').delete().eq('custom_title', mealTitle)
  await client.auth.signOut({ scope: 'local' })
})

test('(e) planning : repas personnalisé ajouté puis retiré', async ({ page }, testInfo) => {
  mealTitle = e2eName('repas', testInfo.project.name)
  await gotoApp(page, '/planning')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1, name: 'Planning de la semaine' })).toBeVisible()

  // Semaine suivante : n'encombre pas la semaine en cours.
  const week = main.getByRole('navigation', { name: 'Planning de la semaine' })
  const currentWeek = (await week.getByRole('paragraph').textContent())?.trim() ?? ''
  await week.getByRole('button', { name: 'Semaine suivante' }).click()
  await expect(week.getByRole('paragraph')).not.toHaveText(currentWeek)

  const slot = main.getByRole('region', { name: /^Déjeuner/ }).first()
  await slot.getByRole('button', { name: 'Ajouter — Déjeuner' }).click()

  const dialog = page.getByRole('dialog', { name: 'Ajouter au planning' })
  await dialog.getByRole('tab', { name: 'Autre chose' }).click()
  await dialog.getByRole('textbox', { name: 'Intitulé' }).fill(mealTitle)
  await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(dialog).toBeHidden()

  await expect(slot.getByText(mealTitle)).toBeVisible()

  await slot.getByRole('button', { name: 'Actions sur ce repas' }).click()
  await page.getByRole('menuitem', { name: 'Retirer' }).click()
  await expect(slot.getByText(mealTitle)).toHaveCount(0)
})
