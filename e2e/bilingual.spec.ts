import { expect, test, type Page } from '@playwright/test'
import { e2eName, storageStatePath } from './support/accounts'
import { gotoApp } from './support/app'
import {
  createE2eBilingualRecipe,
  signedInClient
} from './support/supabase'

/**
 * Recettes bilingues (0016). Le serveur tourne avec `AI_PROVIDER=mock` :
 * la « traduction » préfixe chaque texte de « [EN] » (source française) ou
 * « [FR] » (source anglaise), aucun appel payant.
 */

test.use({ storageState: storageStatePath('admin') })

const recipeTextBox = (page: Page) => page.getByRole('textbox', { name: 'Texte de la recette' })

test.describe('affichage dans la langue de l\'interface', () => {
  let translatedId = ''
  let untranslatedId = ''
  let translatedTitle = ''
  let untranslatedTitle = ''

  test.beforeAll(async ({}, testInfo) => {
    const { client } = await signedInClient('admin')
    translatedTitle = e2eName('Bilingue', testInfo.project.name)
    untranslatedTitle = e2eName('Seule', testInfo.project.name)
    translatedId = await createE2eBilingualRecipe(client, translatedTitle)
    untranslatedId = await createE2eBilingualRecipe(client, untranslatedTitle, { translated: false })
    await client.auth.signOut({ scope: 'local' })
  })

  test('(a) /en affiche la fiche en anglais, / en français', async ({ page }) => {
    await gotoApp(page, `/en/recettes/${translatedId}`)
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(`[EN] ${translatedTitle}`)
    await expect(main.getByText('[EN] A disposable marmalade recipe.')).toBeVisible()
    await expect(main.getByText('[EN] farine')).toBeVisible()
    await expect(main.getByText('[EN] au goût')).toBeVisible()
    await expect(main.getByText('[EN] Mélanger.')).toBeVisible()
    // L'unité suit la langue de l'interface (c. à s. → tbsp) et la quantité reste un nombre.
    await expect(main.getByText(/2\s+tbsp/)).toBeVisible()
    await expect(page.locator('#recipe-sheet')).toHaveAttribute('lang', 'en')
    await expect(page.getByTestId('recipe-language-hint')).toContainText('Automatically translated from French')

    await gotoApp(page, `/recettes/${translatedId}`)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(translatedTitle)
    await expect(page.getByRole('main').getByText('Mélanger.', { exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByText(/2\s+c\. à s\./)).toBeVisible()
    await expect(page.getByRole('main').getByText('[EN]')).toHaveCount(0)
    await expect(page.getByTestId('recipe-language-hint')).toHaveCount(0)
  })

  test('(b) une recette sans traduction reste en français sur /en, avec une mention discrète', async ({ page }) => {
    await gotoApp(page, `/en/recettes/${untranslatedId}`)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(untranslatedTitle)
    await expect(page.getByRole('main').getByText('Mélanger.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('recipe-language-hint')).toContainText('Original text (French): not translated yet.')
  })

  test('(c) la liste et la recherche fonctionnent dans les deux langues', async ({ page }) => {
    await gotoApp(page, '/en/recettes')
    const search = page.getByRole('main').getByRole('searchbox', { name: 'Search', exact: true })
    await search.fill('marmalade')
    // Trouvée par sa description traduite ; la carte montre le titre anglais.
    await expect(page.getByRole('main').getByRole('link', { name: `[EN] ${translatedTitle}` })).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: untranslatedTitle })).toHaveCount(0)

    await gotoApp(page, '/recettes')
    const recherche = page.getByRole('main').getByRole('searchbox', { name: 'Rechercher', exact: true })
    await recherche.fill('confiture jetable')
    // Même recette, trouvée par le texte d'origine, titre français.
    await expect(page.getByRole('main').getByRole('link', { name: translatedTitle, exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: untranslatedTitle, exact: true })).toBeVisible()
    await recherche.fill('marmalade')
    // La traduction se cherche aussi depuis l'interface française.
    await expect(page.getByRole('main').getByRole('link', { name: translatedTitle, exact: true })).toBeVisible()
  })

  test('(d) l\'éditeur indique la langue éditée (version d\'origine)', async ({ page }) => {
    await gotoApp(page, `/recettes/${translatedId}`)
    await page.getByRole('main').getByRole('button', { name: 'Modifier', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('editor-language')).toContainText('Vous modifiez la version d\'origine (français)')
    // Le formulaire contient bien le texte d'origine, pas la traduction.
    await expect(dialog.getByRole('textbox', { name: /Titre/ }).first()).toHaveValue(translatedTitle)
  })
})

test.describe('favoris et planning dans la langue de l\'interface', () => {
  test('(i) un favori et un repas planifié montrent le titre anglais sur /en, français sur /', async ({ browser }, testInfo) => {
    const { client: admin } = await signedInClient('admin')
    const title = e2eName('Favori', testInfo.project.name)
    const recipeId = await createE2eBilingualRecipe(admin, title)
    await admin.auth.signOut({ scope: 'local' })

    const { client, userId } = await signedInClient('user')
    const context = await browser.newContext({ storageState: storageStatePath('user') })
    const page = await context.newPage()
    const today = new Date()
    const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    try {
      const favorite = await client.from('favorites').insert({ user_id: userId, recipe_id: recipeId })
      expect(favorite.error).toBeNull()
      const meal = await client.from('planning').insert({ user_id: userId, date_string: dateString, meal_type: 'dinner', recipe_id: recipeId })
      expect(meal.error).toBeNull()

      await gotoApp(page, '/en/favoris')
      await expect(page.getByRole('main').getByRole('link', { name: `[EN] ${title}` })).toBeVisible()
      await gotoApp(page, '/favoris')
      await expect(page.getByRole('main').getByRole('link', { name: title, exact: true })).toBeVisible()

      await gotoApp(page, '/en/planning')
      await expect(page.getByRole('main').getByText(`[EN] ${title}`).first()).toBeVisible()
      await gotoApp(page, '/planning')
      await expect(page.getByRole('main').getByText(title, { exact: true }).first()).toBeVisible()
    } finally {
      await client.from('favorites').delete().eq('recipe_id', recipeId)
      await client.from('planning').delete().eq('recipe_id', recipeId)
      await client.auth.signOut({ scope: 'local' })
      await context.close()
    }
  })
})

test.describe('traducteur IA', () => {
  test('(e) plus de choix de langue ; l\'aperçu bascule entre les deux versions ; les deux sont enregistrées', async ({ page }, testInfo) => {
    await gotoApp(page, '/traducteur')
    await expect(page.getByRole('heading', { level: 1, name: 'Ajouter une recette par IA' })).toBeVisible()
    await expect(page.getByText('Langue de la recette structurée')).toHaveCount(0)
    await expect(page.getByRole('radio')).toHaveCount(0)

    const title = e2eName('Traducteur', testInfo.project.name)
    await recipeTextBox(page).fill(`${title}\n\nMélanger la farine avec le sucre et les œufs, puis cuire au four 30 minutes.`)
    await page.getByRole('button', { name: 'Structurer la recette' }).click()

    // Interface française, texte français : la version d'origine s'affiche d'abord.
    const previewTitle = page.getByTestId('preview-title')
    await expect(previewTitle).toHaveText(title)
    const french = page.getByTestId('preview-lang-fr')
    const english = page.getByTestId('preview-lang-en')
    await expect(french).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('preview-languages')).toContainText('Langue d\'origine détectée : Français')

    await english.click()
    await expect(english).toHaveAttribute('aria-pressed', 'true')
    await expect(previewTitle).toHaveText(`[EN] ${title}`)
    await expect(page.getByText('[EN] farine', { exact: true })).toBeVisible()

    await french.click()
    await expect(previewTitle).toHaveText(title)

    await page.getByRole('button', { name: /Ajouter aux recettes|Créer quand même/ }).click()
    await expect(page.getByText(`Recette « ${title} » ajoutée`).first()).toBeVisible()

    // Les deux langues ont été enregistrées en base.
    const { client } = await signedInClient('admin')
    const { data: recipes } = await client.from('recipes').select('id, lang, recipe_translations(locale, title, stale)').eq('title', title)
    // La recette simulée ressemble à celle des autres parcours du traducteur (mêmes ingrédients) :
    // on la supprime tout de suite pour ne pas déclencher leur avertissement « doublon ».
    await client.from('recipes').delete().eq('title', title)
    await client.auth.signOut({ scope: 'local' })
    expect(recipes).toHaveLength(1)
    expect(recipes![0]).toMatchObject({ lang: 'fr', recipe_translations: [{ locale: 'en', title: `[EN] ${title}`, stale: false }] })
  })

  test('(f) interface anglaise : l\'aperçu s\'ouvre dans la langue de l\'interface', async ({ page }, testInfo) => {
    await gotoApp(page, '/en/traducteur')
    await expect(page.getByText('Language of the structured recipe')).toHaveCount(0)
    const title = e2eName('Translator', testInfo.project.name)
    await page.getByRole('textbox', { name: 'Recipe text' }).fill(`${title}\n\nMix the flour with the butter and bake until golden for about 30 minutes.`)
    await page.getByRole('button', { name: 'Structure the recipe' }).click()
    // Texte anglais détecté : la traduction française est enregistrée avec lui ; aperçu en anglais d'abord.
    await expect(page.getByTestId('preview-title')).toHaveText(title)
    await expect(page.getByTestId('preview-languages')).toContainText('Original language detected: English')
    await page.getByTestId('preview-lang-fr').click()
    await expect(page.getByTestId('preview-title')).toHaveText(`[FR] ${title}`)
  })
})
