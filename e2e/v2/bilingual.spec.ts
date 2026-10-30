import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { gotoApp } from '../support/app'
import { E2E_6B, cleanup6B, loginV2, signedIn, sqlLocal } from './support'

/**
 * Recettes bilingues en v2 : la langue d'affichage suit la langue de l'interface (retour de test : « titre, ingrédients et étapes restent dans
 * une seule langue quand on bascule FR / EN »). Les traductions sont ENREGISTRÉES (`save_recipe` avec `lang` + `translation`, comme en prod :
 * contenu sans les clés `unit` / `amount` nulles) : aucune traduction à la demande, donc aucun appel IA.
 */
test.beforeAll(async () => { await cleanup6B() })
test.afterAll(async () => { await cleanup6B() })

const translatedUsage = (): number => Number(sqlLocal(`select count(*) from public.ai_usage where feature = 'translate_shared'`).trim())

/** Recette (un ingrédient, une étape) avec sa traduction vers l'autre langue, au format stocké en prod. */
async function createBilingual(client: SupabaseClient, input: {
  title: string
  lang: 'fr' | 'en'
  visibility?: 'private' | 'groups'
  translated: { title: string, description: string, ingredient: string, step: string }
  source: { description: string, ingredient: string, step: string }
}): Promise<string> {
  const { data, error } = await client.rpc('save_recipe', {
    payload: {
      title: input.title,
      category: 'plats',
      visibility: input.visibility ?? 'private',
      description: input.source.description,
      servings: 4,
      lang: input.lang,
      sections: [
        { name: '', type: 'ingredients', order_index: 0, ingredients: [{ name: input.source.ingredient, amount: '200', unit: 'g', order_index: 0 }], instructions: [] },
        { name: '', type: 'instructions', order_index: 1, ingredients: [], instructions: [{ content: input.source.step, order_index: 0 }] }
      ],
      translation: {
        title: input.translated.title,
        description: input.translated.description,
        tags: [],
        source_hash: 'e2e',
        model: 'e2e',
        content: {
          sections: [
            { name: '', ingredients: [{ name: input.translated.ingredient }], instructions: [] },
            { name: '', ingredients: [], instructions: [input.translated.step] }
          ]
        }
      }
    }
  })
  if (error || typeof data !== 'string') throw new Error(`Création de « ${input.title} » impossible : ${error?.message}`)
  return data
}

test('(v2-bi1) recette française : carnet et fiche en anglais sur /en, en français sur /, bascule par le sélecteur', async ({ page }) => {
  const admin = await signedIn('admin')
  const title = `${E2E_6B}Tarte bilingue`
  const id = await createBilingual(admin.client, {
    title,
    lang: 'fr',
    source: { description: 'Une tarte jetable.', ingredient: 'farine', step: 'Mélanger puis cuire.' },
    translated: { title: `[EN] ${title}`, description: '[EN] Une tarte jetable.', ingredient: '[EN] farine', step: '[EN] Mélanger puis cuire.' }
  })
  const before = translatedUsage()

  await loginV2(page, 'admin')
  await gotoApp(page, '/en/recettes')
  const card = page.getByTestId('recipe-grid').locator('article', { hasText: `[EN] ${title}` })
  await expect(card).toBeVisible()
  await card.getByRole('link', { name: `[EN] ${title}` }).click()
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(`[EN] ${title}`)
  await expect(main.getByText('[EN] farine')).toBeVisible()
  await expect(main.getByText('[EN] Mélanger puis cuire.')).toBeVisible()
  await expect(page.getByTestId('recipe-language-hint')).toContainText('Automatically translated from French')

  // Bascule en français par le sélecteur de langue : la même fiche passe au texte d'origine.
  await page.getByRole('button', { name: 'Language' }).click()
  await page.getByRole('menuitem', { name: 'Français' }).click()
  await expect(page).toHaveURL(new RegExp(`/recettes/${id}$`))
  await expect(page).not.toHaveURL(/\/en\//)
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(title)
  await expect(main.getByText('Mélanger puis cuire.', { exact: true })).toBeVisible()
  await expect(main.getByText('[EN]')).toHaveCount(0)

  // …et retour en anglais.
  await page.getByRole('button', { name: 'Langue' }).click()
  await page.getByRole('menuitem', { name: 'English' }).click()
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(`[EN] ${title}`)
  expect(translatedUsage()).toBe(before)   // traduction enregistrée : aucune traduction à la demande
})

test('(v2-bi2) recette anglaise : sa traduction française s\'affiche sur /, le texte d\'origine sur /en', async ({ page }) => {
  const admin = await signedIn('admin')
  const title = `${E2E_6B}Blueberry pie`
  const id = await createBilingual(admin.client, {
    title,
    lang: 'en',
    source: { description: 'A disposable pie.', ingredient: 'flour', step: 'Mix then bake.' },
    translated: { title: `[FR] ${title}`, description: '[FR] A disposable pie.', ingredient: '[FR] flour', step: '[FR] Mix then bake.' }
  })

  await loginV2(page, 'admin')
  await gotoApp(page, '/recettes')
  await expect(page.getByTestId('recipe-grid').locator('article', { hasText: `[FR] ${title}` })).toBeVisible()
  await gotoApp(page, `/recettes/${id}`)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(`[FR] ${title}`)
  await expect(main.getByText('[FR] flour')).toBeVisible()
  await expect(main.getByText('[FR] Mix then bake.')).toBeVisible()

  await gotoApp(page, `/en/recettes/${id}`)
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(title)
  await expect(main.getByText('Mix then bake.', { exact: true })).toBeVisible()
  await expect(main.getByText('[FR]')).toHaveCount(0)
})

test('(v2-bi3) recette partagée déjà traduite : « Partagées avec moi » et recherche en anglais, sans appel IA', async ({ page }) => {
  const admin = await signedIn('admin')
  const user = await signedIn('user')
  const title = `${E2E_6B}Tarte partagée traduite`
  const id = await createBilingual(admin.client, {
    title,
    lang: 'fr',
    source: { description: 'Une tarte partagée.', ingredient: 'farine', step: 'Mélanger puis cuire.' },
    translated: { title: `[EN] ${title}`, description: '[EN] Une tarte partagée.', ingredient: '[EN] farine', step: '[EN] Mélanger puis cuire.' }
  })
  expect((await admin.client.rpc('grant_recipe', { p_recipe: id, p_grantee_user: user.userId, p_permission: 'read' })).error).toBeNull()
  const before = translatedUsage()

  await loginV2(page, 'user')
  await gotoApp(page, '/en/partagees')
  await expect(page.getByTestId('shared-recipe').filter({ hasText: `[EN] ${title}` })).toBeVisible()
  await gotoApp(page, `/en/recettes/${id}`)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(`[EN] ${title}`)
  await expect(page.getByRole('main').getByText('[EN] Mélanger puis cuire.')).toBeVisible()
  await gotoApp(page, '/partagees')
  await expect(page.getByTestId('shared-recipe').filter({ hasText: title })).toBeVisible()
  expect(translatedUsage()).toBe(before)
})
