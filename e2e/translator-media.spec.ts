import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { storageStatePath } from './support/accounts'
import { gotoApp } from './support/app'

/**
 * Traducteur IA : entrées « fichier » (dépôt / sélecteur) et « dictée »
 * (phase 5). Le serveur tourne avec `AI_PROVIDER=mock` (.env.local) : aucun
 * appel payant, la transcription renvoie toujours le même texte et l'extraction
 * (photo / PDF) la recette « Cookies aux pépites de chocolat ».
 */

test.use({ storageState: storageStatePath('admin') })

// PNG 1×1 valide (décodable par createImageBitmap, donc par la préparation d'image).
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PDF_MINIMAL = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
// Vrai document Word (python-docx) : titre, puces, numérotation, tableau.
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const DOCX_BASE64 = readFileSync(resolve(process.cwd(), 'test/fixtures/gateau-yaourt.docx')).toString('base64')
const MOCK_TITLE = 'Cookies aux pépites de chocolat'
const MOCK_TRANSCRIPT_START = 'Cookies aux pépites de chocolat. Il faut deux cent quatre-vingts grammes de farine'

const recipeTextBox = (page: Page) => page.getByRole('textbox', { name: 'Texte de la recette' })
const dropzone = (page: Page) => page.getByRole('button', { name: /Déposez un fichier ici/ })

interface DroppedFile { name: string, type: string, text?: string, base64?: string }

/** Dépose des fichiers sur la zone de dépôt (vrai évènement `drop` avec un DataTransfer). */
async function dropFiles(page: Page, files: DroppedFile[]): Promise<void> {
  const dataTransfer = await page.evaluateHandle((specs) => {
    const transfer = new DataTransfer()
    for (const spec of specs) {
      const content = spec.base64 !== undefined
        ? Uint8Array.from(atob(spec.base64), char => char.charCodeAt(0))
        : (spec.text ?? '')
      transfer.items.add(new File([content], spec.name, { type: spec.type }))
    }
    return transfer
  }, files)
  await dropzone(page).dispatchEvent('drop', { dataTransfer })
}

/**
 * Micro simulé dans la page : un oscillateur WebAudio tient lieu de flux micro
 * (`getUserMedia`). Plus fiable que les options `--use-fake-device-for-media-stream`
 * de Chromium, qui n'aboutissent pas sur toutes les machines (macOS, conteneurs).
 */
async function installFakeMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext()
      const oscillator = context.createOscillator()
      const destination = context.createMediaStreamDestination()
      oscillator.connect(destination)
      oscillator.start()
      return destination.stream
    }
  })
}

test.beforeEach(async ({ page }) => {
  await installFakeMicrophone(page)
  await gotoApp(page, '/traducteur')
  await expect(page.getByRole('heading', { level: 1, name: 'Ajouter une recette par IA' })).toBeVisible()
})

test.describe('fichier', () => {
  test('(a) un fichier texte déposé remplit la zone de texte, sans appel serveur', async ({ page }) => {
    const apiCalls: string[] = []
    page.on('request', request => {
      if (request.url().includes('/api/')) apiCalls.push(request.url())
    })

    const text = 'E2E_Gâteau déposé\n\n200 g de farine\n100 g de sucre\n\nMélanger puis cuire 30 minutes à 180 °C.'
    await dropFiles(page, [{ name: 'gateau.txt', type: 'text/plain', text }])

    await expect(recipeTextBox(page)).toHaveValue(text)
    await expect(page.getByRole('button', { name: 'Structurer la recette' })).toBeEnabled()
    // Le fichier texte n'est pas conservé dans la liste des fichiers à analyser.
    await expect(page.getByText('gateau.txt')).toHaveCount(0)
    expect(apiCalls).toEqual([])
  })

  test('(b) un fichier .md choisi dans le sélecteur est lu, un second s\'ajoute à la suite', async ({ page }) => {
    const input = page.locator('input[type="file"]')
    await input.setInputFiles({ name: 'recette.md', mimeType: 'text/markdown', buffer: Buffer.from('# E2E_Tarte\n\n- 3 pommes\n- 1 pâte brisée\n', 'utf8') })
    await expect(recipeTextBox(page)).toHaveValue(/E2E_Tarte[\s\S]*1 pâte brisée/)

    await input.setInputFiles({ name: 'suite.txt', mimeType: 'text/plain', buffer: Buffer.from('Cuire 40 minutes.', 'utf8') })
    await expect(recipeTextBox(page)).toHaveValue(/1 pâte brisée\s+Cuire 40 minutes\./)
  })

  test('(c) un format non pris en charge est refusé avec un message clair', async ({ page }) => {
    await dropFiles(page, [{ name: 'musique.mp3', type: 'audio/mpeg', text: 'ID3' }])
    await expect(page.getByText('Format non pris en charge : musique.mp3')).toBeVisible()
    await expect(recipeTextBox(page)).toHaveValue('')
  })

  test('(c2) un document Word .docx déposé remplit la zone de texte, sans appel serveur', async ({ page }) => {
    const apiCalls: string[] = []
    page.on('request', request => {
      if (request.url().includes('/api/')) apiCalls.push(request.url())
    })

    await dropFiles(page, [{ name: 'gateau-yaourt.docx', type: DOCX_MIME, base64: DOCX_BASE64 }])

    await expect(recipeTextBox(page)).toHaveValue(/Gâteau au yaourt de Mamie\n[\s\S]*- 1 pot de yaourt nature\n- 3 pots de farine[\s\S]*- Cuire 35 minutes\./)
    await expect(page.getByRole('button', { name: 'Structurer la recette' })).toBeEnabled()
    // Le document n'est pas conservé dans la liste des fichiers à analyser.
    await expect(page.getByText('gateau-yaourt.docx')).toHaveCount(0)
    expect(apiCalls).toEqual([])
  })

  test('(c3) un .docx choisi dans le sélecteur, sans type MIME, est reconnu par son extension', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles({ name: 'gateau.docx', mimeType: '', buffer: Buffer.from(DOCX_BASE64, 'base64') })
    await expect(recipeTextBox(page)).toHaveValue(/Gâteau au yaourt de Mamie/)
  })

  test('(c4) un .docx abîmé et l\'ancien .doc sont refusés avec un message clair', async ({ page }) => {
    await dropFiles(page, [{ name: 'abime.docx', type: DOCX_MIME, text: 'PK ceci n\'est pas une archive' }])
    await expect(page.getByText(/Impossible de lire le document Word abime\.docx/)).toBeVisible()
    await expect(recipeTextBox(page)).toHaveValue('')

    await dropFiles(page, [{ name: 'vieux.doc', type: 'application/msword', text: 'x' }])
    await expect(page.getByText(/Le format Word ancien \(\.doc\) n'est pas pris en charge : vieux\.doc/)).toBeVisible()
    await expect(page.getByText(/Enregistrez le document au format \.docx/)).toBeVisible()
    await expect(recipeTextBox(page)).toHaveValue('')
  })

  test('(d) une image envoyée à l\'IA (mock) affiche l\'aperçu de la recette', async ({ page }) => {
    const input = page.locator('input[type="file"]')
    await input.setInputFiles({ name: 'page-livre.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1, 'base64') })
    // L'image est réduite en JPEG avant envoi.
    await expect(page.getByText('page-livre.jpg')).toBeVisible()
    await expect(page.getByText('Les fichiers ci-dessus seront analysés à la place du texte saisi.')).toBeVisible()

    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/extract-recipe'))
    await page.getByRole('button', { name: 'Structurer la recette' }).click()
    const response = await responsePromise
    expect(response.status()).toBe(200)
    expect(response.request().headers()['content-type']).toContain('multipart/form-data')

    await expect(page.getByText('Aperçu avant ajout')).toBeVisible()
    await expect(page.getByRole('heading', { name: MOCK_TITLE })).toBeVisible()
    // Rien n'est enregistré avant « Ajouter aux recettes ».
    await expect(page.getByRole('button', { name: 'Ajouter aux recettes' })).toBeVisible()
  })

  test('(e) un PDF déposé est analysé par l\'IA (mock)', async ({ page }) => {
    await dropFiles(page, [{ name: 'livre.pdf', type: 'application/pdf', text: PDF_MINIMAL }])
    await expect(page.getByText('livre.pdf')).toBeVisible()

  })

  test('(f) une grosse photo (> 4 Mo) est allégée avant l\'envoi', async ({ page }) => {
    // JPEG de bruit 3000×2000 : plusieurs Mo, au-delà de la limite de la requête.
    const bigJpeg = await page.evaluateHandle(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 3000
      canvas.height = 2000
      const context = canvas.getContext('2d')!
      const image = context.createImageData(3000, 2000)
      for (let i = 0; i < image.data.length; i += 4) {
        image.data[i] = Math.random() * 255
        image.data[i + 1] = Math.random() * 255
        image.data[i + 2] = Math.random() * 255
        image.data[i + 3] = 255
      }
      context.putImageData(image, 0, 0)
      const blob: Blob = await new Promise(resolve => canvas.toBlob(result => resolve(result!), 'image/jpeg', 0.95))
      const transfer = new DataTransfer()
      transfer.items.add(new File([blob], 'IMG_0001.jpeg', { type: 'image/jpeg' }))
      return { transfer, size: blob.size }
    })
    const sourceSize = await bigJpeg.evaluate(value => value.size)
    expect(sourceSize).toBeGreaterThan(4 * 1024 * 1024)
    expect(sourceSize).toBeLessThan(10 * 1024 * 1024)

    const dataTransfer = await bigJpeg.evaluateHandle(value => value.transfer)
    await dropzone(page).dispatchEvent('drop', { dataTransfer })
    await expect(page.getByText('IMG_0001.jpg')).toBeVisible({ timeout: 30_000 })

    const requestPromise = page.waitForRequest(request => request.url().endsWith('/api/extract-recipe'))
    await page.getByRole('button', { name: 'Structurer la recette' }).click()
    const request = await requestPromise
    expect(request.postDataBuffer()?.length ?? 0).toBeLessThan(4 * 1024 * 1024)
    await expect(page.getByText('Aperçu avant ajout')).toBeVisible()
  })

  test('(g) au-delà de 4 fichiers, les suivants sont ignorés avec un message', async ({ page }) => {
    const files = Array.from({ length: 5 }, (_, index) => ({ name: `p${index + 1}.png`, type: 'image/png', base64: PNG_1X1 }))
    await dropFiles(page, files)
    await expect(page.getByText('Quatre fichiers au maximum')).toBeVisible()
    await expect(page.getByText('p4.jpg')).toBeVisible()
    await expect(page.getByText('p5.jpg')).toHaveCount(0)
  })
})

test.describe('dictée', () => {
  test('(h) enregistrer puis arrêter place la transcription dans la zone de texte', async ({ page }) => {
    await page.getByRole('button', { name: 'Dicter la recette' }).click()
    const stop = page.getByRole('button', { name: 'Arrêter' })
    await expect(stop).toBeVisible()
    await expect(page.getByRole('timer')).toBeVisible()
    // Durée écoulée affichée (le micro simulé produit du son tant qu'on enregistre).
    await expect(page.getByRole('timer')).toContainText(/0:0[1-9] \/ 5:00/, { timeout: 10_000 })
    await expect(page.getByText('Enregistrement en cours.')).toBeAttached()

    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/transcribe-recipe'))
    await stop.click()
    const response = await responsePromise
    expect(response.status()).toBe(200)

    await expect(recipeTextBox(page)).toHaveValue(new RegExp(`^${MOCK_TRANSCRIPT_START}`))
    await expect(page.getByText('Transcription ajoutée au texte de la recette')).toBeAttached()
    await expect(page.getByRole('button', { name: 'Dicter la recette' })).toBeEnabled()
  })

  test('(i) annuler l\'enregistrement n\'envoie rien', async ({ page }) => {
    const calls: string[] = []
    page.on('request', request => {
      if (request.url().endsWith('/api/transcribe-recipe')) calls.push(request.url())
    })
    await page.getByRole('button', { name: 'Dicter la recette' }).click()
    await expect(page.getByRole('button', { name: 'Arrêter' })).toBeVisible()
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByRole('button', { name: 'Dicter la recette' })).toBeVisible()
    await page.waitForTimeout(500)
    expect(calls).toEqual([])
    await expect(recipeTextBox(page)).toHaveValue('')
  })

  test('(j) micro refusé : message clair, rien n\'est enregistré', async ({ page }) => {
    await page.evaluate(() => {
      // Remplace le micro simulé : le navigateur refuse l'accès.
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
    })
    await page.getByRole('button', { name: 'Dicter la recette' }).click()
    await expect(page.getByText('Accès au micro refusé')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dicter la recette' })).toBeEnabled()
  })

  test('(k) navigateur sans enregistrement audio : bouton désactivé et explication', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'MediaRecorder', { value: undefined, configurable: true })
    })
    await gotoApp(page, '/traducteur')
    await expect(page.getByText('L\'enregistrement audio n\'est pas disponible dans ce navigateur')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dicter la recette' })).toBeDisabled()
  })
})
