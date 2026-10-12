import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import { storageStatePath } from './support/accounts'
import { gotoApp } from './support/app'

/**
 * Traducteur IA : import depuis Google Drive. Aucun appel à Google : les deux
 * scripts (Google Identity Services, gapi + Picker) et l'API Drive sont
 * remplacés par des doublures (`page.route`). Le serveur est lancé avec les
 * trois variables NUXT_PUBLIC_GOOGLE_* (playwright.config.ts) ; sans elles le
 * bouton est masqué et les parcours sont ignorés.
 */

test.use({ storageState: storageStatePath('admin') })

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const DOCX_BYTES = readFileSync(resolve(process.cwd(), 'test/fixtures/gateau-yaourt.docx'))
const MOCK_TITLE = 'Cookies aux pépites de chocolat'

// Doublure de https://accounts.google.com/gsi/client : l'autorisation aboutit aussitôt.
const GIS_STUB = `
window.google = window.google || {};
window.google.accounts = { oauth2: {
  initTokenClient: function (config) {
    return { requestAccessToken: function () {
      window.__driveTokenRequests = (window.__driveTokenRequests || 0) + 1;
      setTimeout(function () { config.callback({ access_token: 'fake-token', expires_in: 3600, scope: config.scope }); }, 0);
    } };
  },
  hasGrantedAllScopes: function () { return true; }
} };`

// Doublure de https://apis.google.com/js/api.js : le « Picker » choisit window.__drivePick.
const GAPI_STUB = `
window.gapi = { load: function (name, options) {
  window.google = window.google || {};
  function View() {}
  View.prototype.setMimeTypes = function () { return this; };
  View.prototype.setMode = function () { return this; };
  View.prototype.setIncludeFolders = function () { return this; };
  function Builder() {}
  ['addView', 'setOAuthToken', 'setDeveloperKey', 'setAppId', 'setLocale', 'setOrigin'].forEach(function (method) {
    Builder.prototype[method] = function () { return this; };
  });
  Builder.prototype.setCallback = function (callback) { this.callback = callback; return this; };
  Builder.prototype.build = function () {
    var callback = this.callback;
    return { setVisible: function () {
      setTimeout(function () {
        var pick = window.__drivePick;
        callback(pick ? { action: 'picked', docs: [pick] } : { action: 'cancel' });
      }, 0);
    } };
  };
  window.google.picker = {
    ViewId: { DOCS: 'all' }, DocsViewMode: { LIST: 'list' },
    Action: { PICKED: 'picked', CANCEL: 'cancel' },
    Response: { ACTION: 'action', DOCUMENTS: 'docs' },
    Document: { ID: 'id', NAME: 'name', MIME_TYPE: 'mimeType', SIZE_BYTES: 'sizeBytes' },
    DocsView: View, PickerBuilder: Builder
  };
  options.callback();
} };`

interface FakeDriveFile { id: string, name: string, mimeType: string, sizeBytes?: number }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, OPTIONS'
}

/** Remplace les scripts Google et l'API Drive ; renvoie la liste des requêtes Drive reçues. */
async function stubGoogle(page: Page, content: (url: URL) => { body: Buffer | string, contentType: string }): Promise<Array<{ url: string, authorization: string | undefined }>> {
  const driveRequests: Array<{ url: string, authorization: string | undefined }> = []
  const script = (body: string) => (route: Route) => route.fulfill({ status: 200, contentType: 'text/javascript', body })
  await page.route('https://accounts.google.com/gsi/client', script(GIS_STUB))
  await page.route('https://apis.google.com/js/api.js', script(GAPI_STUB))
  await page.route('https://www.googleapis.com/drive/v3/files/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    driveRequests.push({ url: request.url(), authorization: request.headers().authorization })
    const { body, contentType } = content(new URL(request.url()))
    await route.fulfill({ status: 200, headers: CORS, contentType, body })
  })
  return driveRequests
}

const pickInDrive = (page: Page, file: FakeDriveFile | null) => page.evaluate((value) => {
  (window as unknown as { __drivePick: unknown }).__drivePick = value
}, file)

const recipeTextBox = (page: Page) => page.getByRole('textbox', { name: 'Texte de la recette' })
const driveButton = (page: Page) => page.getByRole('button', { name: 'Importer depuis Google Drive' })

test.beforeEach(async ({ page }) => {
  await gotoApp(page, '/traducteur')
  await expect(page.getByRole('heading', { level: 1, name: 'Ajouter une recette par IA' })).toBeVisible()
  test.skip(await driveButton(page).count() === 0, 'Serveur lancé sans NUXT_PUBLIC_GOOGLE_* : bouton Drive masqué')
})

test('(a) un fichier texte du Drive remplit la zone de texte, scripts chargés au clic seulement', async ({ page }) => {
  const scriptRequests: string[] = []
  page.on('request', (request) => {
    if (/accounts\.google\.com|apis\.google\.com/.test(request.url())) scriptRequests.push(request.url())
  })
  const text = 'E2E_Gâteau du Drive\n\n200 g de farine\n100 g de sucre\n\nMélanger puis cuire 30 minutes à 180 °C.'
  const driveRequests = await stubGoogle(page, () => ({ body: text, contentType: 'text/plain' }))
  expect(scriptRequests).toEqual([])

  await pickInDrive(page, { id: 'file-txt', name: 'gateau.txt', mimeType: 'text/plain', sizeBytes: text.length })
  await driveButton(page).click()

  await expect(recipeTextBox(page)).toHaveValue(text)
  await expect(page.getByRole('button', { name: 'Structurer la recette' })).toBeEnabled()
  expect(scriptRequests.length).toBeGreaterThanOrEqual(2)
  // Jeton transmis à l'API Drive, téléchargement du contenu (alt=media).
  expect(driveRequests).toHaveLength(1)
  expect(driveRequests[0]?.url).toContain('/files/file-txt?alt=media')
  expect(driveRequests[0]?.authorization).toBe('Bearer fake-token')
})

test('(b) un Google Docs est exporté en texte brut', async ({ page }) => {
  const driveRequests = await stubGoogle(page, () => ({ body: 'Tarte aux pommes\n\n3 pommes\n1 pâte brisée\n\nCuire 40 minutes.', contentType: 'text/plain' }))
  await pickInDrive(page, { id: 'doc-1', name: 'Tarte', mimeType: 'application/vnd.google-apps.document' })
  await driveButton(page).click()

  await expect(recipeTextBox(page)).toHaveValue(/Tarte aux pommes[\s\S]*Cuire 40 minutes\./)
  expect(driveRequests[0]?.url).toContain('/files/doc-1/export')
  expect(driveRequests[0]?.url).toContain('mimeType=text%2Fplain')
})

test('(c) une photo du Drive rejoint les fichiers à analyser puis l\'IA (mock) affiche l\'aperçu', async ({ page }) => {
  await stubGoogle(page, () => ({ body: Buffer.from(PNG_1X1, 'base64'), contentType: 'image/png' }))
  await pickInDrive(page, { id: 'img-1', name: 'page-livre.png', mimeType: 'image/png', sizeBytes: 70 })
  await driveButton(page).click()

  // L'image suit le flux habituel : réduite en JPEG avant envoi.
  await expect(page.getByText('page-livre.jpg')).toBeVisible()
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/extract-recipe'))
  await page.getByRole('button', { name: 'Structurer la recette' }).click()
  expect((await responsePromise).status()).toBe(200)
  await expect(page.getByText('Aperçu avant ajout')).toBeVisible()
  await expect(page.getByRole('heading', { name: MOCK_TITLE })).toBeVisible()
})

test('(d) une feuille Google Sheets est refusée avec un message clair, annuler ne fait rien', async ({ page }) => {
  const driveRequests = await stubGoogle(page, () => ({ body: 'x', contentType: 'text/plain' }))
  await pickInDrive(page, { id: 'sheet-1', name: 'Courses', mimeType: 'application/vnd.google-apps.spreadsheet' })
  await driveButton(page).click()
  await expect(page.getByText('Format non pris en charge depuis Google Drive : Courses.')).toBeVisible()
  await expect(recipeTextBox(page)).toHaveValue('')

  await pickInDrive(page, null)
  await driveButton(page).click()
  await expect(page.getByText('Format non pris en charge depuis Google Drive')).toHaveCount(0)
  await expect(driveButton(page)).toBeEnabled()
  expect(driveRequests).toEqual([])
})

test('(e) un document Word .docx du Drive est téléchargé tel quel puis son texte extrait dans le navigateur', async ({ page }) => {
  const apiCalls: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiCalls.push(request.url())
  })
  const driveRequests = await stubGoogle(page, () => ({ body: DOCX_BYTES, contentType: DOCX_MIME }))
  await pickInDrive(page, { id: 'word-1', name: 'gateau-yaourt.docx', mimeType: DOCX_MIME, sizeBytes: DOCX_BYTES.length })
  await driveButton(page).click()

  await expect(recipeTextBox(page)).toHaveValue(/Gâteau au yaourt de Mamie[\s\S]*- 1 pot de yaourt nature[\s\S]*320 kcal/)
  expect(driveRequests).toHaveLength(1)
  expect(driveRequests[0]?.url).toContain('/files/word-1?alt=media')
  // Extraction côté navigateur : aucun appel à nos endpoints (donc aucun coût IA).
  expect(apiCalls).toEqual([])
})

test('(f) un ancien Word .doc du Drive est refusé avec le conseil d\'enregistrer en .docx ou PDF', async ({ page }) => {
  const driveRequests = await stubGoogle(page, () => ({ body: 'x', contentType: 'application/msword' }))
  await pickInDrive(page, { id: 'word-2', name: 'vieux.doc', mimeType: 'application/msword' })
  await driveButton(page).click()
  await expect(page.getByText('Le format Word ancien (.doc) n\'est pas pris en charge : vieux.doc.')).toBeVisible()
  await expect(recipeTextBox(page)).toHaveValue('')
  expect(driveRequests).toEqual([])
})
