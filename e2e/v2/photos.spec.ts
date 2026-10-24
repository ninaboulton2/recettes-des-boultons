import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, request as playwrightRequest, test, type Page } from '@playwright/test'
import { gotoApp } from '../support/app'
import { SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SUPABASE_URL } from '../support/env'
import { V2_PASSWORD, createRecipe, loginV2, signedIn } from './support'

/**
 * Photos privées (phase 8) : bucket `recipe-photos` privé, affichage par URL signée (co-membre), refus pour un étranger, page
 * publique `/r/<jeton>` servie par la route serveur, copie avec SA photo, remplacement et suppression nettoyés côté serveur.
 * Sur une base en état v2 APRÈS la bascule des photos (`npm run db:local:v2` applique v2/0029).
 */
const BUCKET = 'recipe-photos'
/** Préfixe propre à la phase 8 : ces parcours ne touchent jamais aux données `E2E_P8_*` des autres (la base locale est partagée). */
const E2E_P8 = 'E2E_P8_'
// PNG 1 × 1 valide (le bucket accepte jpeg / png / webp)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const service = (): SupabaseClient => createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

/** Téléverse la photo (compte `client`, comme l'éditeur) puis l'attache à la recette avec les mêmes sections (`save_recipe`). */
async function addPhoto(client: SupabaseClient, recipeId: string, name = `${Date.now()}.png`): Promise<string> {
  const path = `${recipeId}/${name}`
  const up = await client.storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png', upsert: false })
  if (up.error) throw new Error(`Téléversement impossible : ${up.error.message}`)
  const row = await client.from('recipes').select('title, category').eq('id', recipeId).single()
  if (row.error) throw new Error(row.error.message)
  const saved = await client.rpc('save_recipe', { payload: { id: recipeId, title: row.data.title, category: row.data.category, photo_path: path, sections: [] } })
  if (saved.error) throw new Error(`Enregistrement impossible : ${saved.error.message}`)
  return path
}

async function listFolder(recipeId: string): Promise<string[]> {
  const { data, error } = await service().storage.from(BUCKET).list(recipeId, { limit: 100 })
  if (error) throw new Error(error.message)
  return (data ?? []).filter(file => file.id).map(file => file.name)
}

/** L'image affichée est chargée (largeur naturelle > 0) et vient d'une URL signée du bucket privé. */
async function expectSignedPhoto(page: Page, selector: string): Promise<string> {
  const image = page.locator(selector).first()
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
  const src = (await image.getAttribute('src')) ?? ''
  expect(src).toContain('/storage/v1/object/sign/recipe-photos/')
  expect(src).toContain('token=')
  expect(src).not.toContain('/object/public/')
  return src
}

/** Étranger jetable (ni ami ni membre d'un groupe) : un compte à part, pour ne pas dépendre de l'état de `ami@`. */
let stranger: { id: string, client: SupabaseClient } | null = null
async function strangerClient(): Promise<SupabaseClient> {
  if (stranger) return stranger.client
  const email = `p8-etranger-${Date.now().toString(36)}@local.test`
  const created = await service().auth.admin.createUser({ email, password: V2_PASSWORD, email_confirm: true })
  if (created.error || !created.data.user) throw new Error(`Création de l'étranger impossible : ${created.error?.message}`)
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const signed = await client.auth.signInWithPassword({ email, password: V2_PASSWORD })
  if (signed.error) throw new Error(`Connexion de l'étranger impossible : ${signed.error.message}`)
  stranger = { id: created.data.user.id, client }
  return client
}

async function cleanupP8(): Promise<void> {
  const admin = service()
  const { data } = await admin.from('recipes').select('id').like('title', `${E2E_P8}%`)
  for (const row of data ?? []) {
    const names = await listFolder(row.id)
    if (names.length > 0) await admin.storage.from(BUCKET).remove(names.map(name => `${row.id}/${name}`))
  }
  await admin.from('recipes').delete().like('title', `${E2E_P8}%`)
  if (stranger) await admin.auth.admin.deleteUser(stranger.id)
  stranger = null
}

test.beforeAll(async () => { await cleanupP8() })
test.afterAll(async () => { await cleanupP8() })

test('(p8-read) le bucket est privé ; un co-membre voit la photo (carte « partagées avec moi » et fiche), un étranger est refusé', async ({ page }) => {
  const admin = await signedIn('admin')
  const user = await signedIn('user')
  const id = await createRecipe(admin.client, `${E2E_P8}Photo groupe`, 'groups')
  const path = await addPhoto(admin.client, id)

  // bucket privé : l'adresse publique ne répond plus
  const bucket = await service().storage.getBucket(BUCKET)
  expect(bucket.data?.public).toBe(false)
  const anon = await playwrightRequest.newContext()
  const publicTry = await anon.get(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`)
  expect(publicTry.ok()).toBe(false)

  // co-membre (user@, même groupe « Les Boultons ») : URL signée accordée par le RLS ; étranger : refusée
  const signedOk = await user.client.storage.from(BUCKET).createSignedUrl(path, 60)
  expect(signedOk.error).toBeNull()
  const signedBody = await anon.get(signedOk.data!.signedUrl)
  expect(signedBody.ok()).toBe(true)
  expect(signedBody.headers()['content-type']).toContain('image/png')

  const outsider = await strangerClient()
  const denied = await outsider.storage.from(BUCKET).createSignedUrl(path, 60)
  expect(denied.data?.signedUrl ?? null).toBeNull()
  expect(denied.error).not.toBeNull()
  const batch = await outsider.storage.from(BUCKET).createSignedUrls([path], 60)
  expect(batch.data?.[0]?.signedUrl ?? null).toBeNull()
  expect((await outsider.storage.from(BUCKET).download(path)).error).not.toBeNull()
  // un jeton inventé sur l'adresse signée ne marche pas non plus
  const forged = await anon.get(signedOk.data!.signedUrl.replace(/token=[^&]+/, 'token=xxx'))
  expect(forged.ok()).toBe(false)
  // l'étranger ne peut ni téléverser dans le dossier de la recette ni supprimer la photo
  expect((await outsider.storage.from(BUCKET).upload(`${id}/intrus.png`, PNG, { contentType: 'image/png' })).error).not.toBeNull()
  await outsider.storage.from(BUCKET).remove([path])
  expect(await listFolder(id)).toHaveLength(1)

  // interface : carte de « Partagées avec moi » et fiche pour le co-membre
  await loginV2(page, 'user')
  await gotoApp(page, '/partagees')
  const card = page.getByTestId('shared-recipe').filter({ hasText: `${E2E_P8}Photo groupe` })
  await expect(card).toBeVisible()
  await expectSignedPhoto(page, `[data-testid="shared-recipe"][data-recipe-id="${id}"] [data-recipe-visual] img`)
  await gotoApp(page, `/recettes/${id}`)
  await expectSignedPhoto(page, '[data-testid="recipe-photo"]')
  await anon.dispose()
})

test('(p8-public) page publique : la photo passe par la route serveur (jeton vérifié, jamais un chemin client)', async ({ browser }) => {
  const admin = await signedIn('admin')
  const id = await createRecipe(admin.client, `${E2E_P8}Photo publique`, 'private')
  const other = await createRecipe(admin.client, `${E2E_P8}Photo autre`, 'private')
  await addPhoto(admin.client, id, 'publique.png')
  await addPhoto(admin.client, other, 'secrete.png')
  const link = await admin.client.rpc('create_share_link', { p_recipe: id })
  expect(link.error).toBeNull()
  const token = String(link.data)

  const context = await browser.newContext({ locale: 'fr-FR' })
  const page = await context.newPage()
  await page.goto(`/r/${token}`)
  const image = page.getByTestId('recipe-photo')
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
  expect(await image.getAttribute('src')).toBe(`/api/v2/shared/${token}/photo`)

  // la route : 302 vers une URL signée courte de CETTE recette ; la requête ne peut rien y changer
  const raw = await playwrightRequest.newContext({ baseURL: page.url().split('/r/')[0] })
  const ok = await raw.get(`/api/v2/shared/${token}/photo`, { maxRedirects: 0 })
  expect(ok.status()).toBe(302)
  expect(ok.headers().location).toContain(`/object/sign/${BUCKET}/${id}/publique.png`)
  expect(ok.headers()['cache-control']).toContain('private')
  const tampered = await raw.get(`/api/v2/shared/${token}/photo?path=${encodeURIComponent(`${other}/secrete.png`)}&bucket=x`, { maxRedirects: 0 })
  expect(tampered.status()).toBe(302)
  expect(tampered.headers().location).toContain(`${id}/publique.png`)
  expect(tampered.headers().location).not.toContain(other)
  // jeton inconnu, mal formé, ou chemin à la place du jeton : le même 404, sans rien révéler
  for (const bad of ['00000000-0000-4000-8000-000000000000', 'pas-un-jeton', encodeURIComponent(`${id}/publique.png`), id]) {
    expect((await raw.get(`/api/v2/shared/${bad}/photo`, { maxRedirects: 0 })).status()).toBe(404)
  }
  // l'adresse signée obtenue est lisible ; la photo « secrète » reste inaccessible sans droit
  const bytes = await raw.get(ok.headers().location!)
  expect(bytes.ok()).toBe(true)
  expect((await raw.get(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${other}/secrete.png`)).ok()).toBe(false)

  // lien révoqué : 404 aussi, et la page n'affiche plus rien
  expect((await admin.client.rpc('revoke_share_link', { p_recipe: id })).error).toBeNull()
  expect((await raw.get(`/api/v2/shared/${token}/photo`, { maxRedirects: 0 })).status()).toBe(404)
  await raw.dispose()
  await context.close()
})

test('(p8-copy) la copie a SA photo (objet distinct) ; supprimer l’original efface sa photo mais pas celle de la copie', async ({ page }) => {
  const admin = await signedIn('admin')
  const user = await signedIn('user')
  const id = await createRecipe(admin.client, `${E2E_P8}Photo à copier`, 'private')
  const path = await addPhoto(admin.client, id, 'origine.png')
  const granted = await admin.client.rpc('grant_recipe', { p_recipe: id, p_grantee_user: user.userId, p_permission: 'copy' })
  expect(granted.error).toBeNull()

  await loginV2(page, 'user')
  await gotoApp(page, `/recettes/${id}`)
  await page.getByTestId('action-copy').click()
  await expect(page).not.toHaveURL(new RegExp(`/recettes/${id}$`))
  await expect(page).toHaveURL(/\/recettes\/[0-9a-f-]{36}$/)
  const copyId = page.url().split('/').pop()!
  expect(copyId).not.toBe(id)
  await expectSignedPhoto(page, '[data-testid="recipe-photo"]')

  const row = await user.client.from('recipes').select('photo_path, owner_id, copied_from').eq('id', copyId).single()
  expect(row.data).toMatchObject({ owner_id: user.userId, copied_from: id })
  const copyPath = (row.data as { photo_path: string }).photo_path
  expect(copyPath.startsWith(`${copyId}/`)).toBe(true)
  expect(copyPath).not.toBe(path)
  expect((await listFolder(copyId))).toHaveLength(1)
  expect((await listFolder(id))).toEqual(['origine.png'])

  // l'auteur supprime l'original par la route serveur : son dossier est vidé, la copie garde sa photo
  const session = (await admin.client.auth.getSession()).data.session!
  const api = await playwrightRequest.newContext({ baseURL: page.url().split('/recettes/')[0] })
  const del = await api.delete(`/api/delete-recipe?id=${id}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
  expect(del.ok()).toBe(true)
  expect(await listFolder(id)).toEqual([])
  expect((await listFolder(copyId))).toHaveLength(1)
  await page.reload()
  await expectSignedPhoto(page, '[data-testid="recipe-photo"]')

  // une suppression REFUSÉE (la copie n'est pas à l'admin) ne touche pas à la photo
  const refused = await api.delete(`/api/delete-recipe?id=${copyId}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
  expect(refused.ok()).toBe(false)
  expect((await listFolder(copyId))).toHaveLength(1)

  // copie sans droit de copie : refusée (403), rien n'est copié
  const sans = await createRecipe(admin.client, `${E2E_P8}Sans droit`, 'private')
  await addPhoto(admin.client, sans, 'x.png')
  const userSession = (await user.client.auth.getSession()).data.session!
  const noRight = await api.post(`/api/v2/recipes/${sans}/copy`, { headers: { Authorization: `Bearer ${userSession.access_token}` } })
  expect(noRight.status()).toBe(403)
  await api.dispose()
})

test('(p8-replace) remplacer ou retirer la photo supprime l’ancien objet (serveur) ; un éditeur « modifier l’original » ne peut pas supprimer lui-même', async () => {
  const admin = await signedIn('admin')
  const user = await signedIn('user')
  const id = await createRecipe(admin.client, `${E2E_P8}Photo remplacée`, 'private')
  const first = await addPhoto(admin.client, id, 'une.png')
  expect((await admin.client.rpc('grant_recipe', { p_recipe: id, p_grantee_user: user.userId, p_permission: 'edit_original' })).error).toBeNull()

  // l'éditeur téléverse la nouvelle photo (autorisé) mais ne peut pas supprimer l'ancienne objet lui-même
  const second = `${id}/deux.png`
  expect((await user.client.storage.from(BUCKET).upload(second, PNG, { contentType: 'image/png' })).error).toBeNull()
  await user.client.storage.from(BUCKET).remove([first])
  expect(await listFolder(id)).toEqual(['deux.png', 'une.png'])

  // l'enregistrement passe par le serveur, qui supprime l'ancien objet
  const session = (await user.client.auth.getSession()).data.session!
  const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_V2_PORT ?? 3043}`
  const api = await playwrightRequest.newContext({ baseURL })
  const put = await api.put(`/api/update-recipe?id=${id}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    data: { updates: { title: `${E2E_P8}Photo remplacée`, category: 'plats', photoPath: second, sections: [] } }
  })
  expect(put.ok()).toBe(true)
  expect(await listFolder(id)).toEqual(['deux.png'])

  // retrait de la photo : l'objet est supprimé aussi
  const removed = await api.put(`/api/update-recipe?id=${id}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    data: { updates: { title: `${E2E_P8}Photo remplacée`, category: 'plats', photoPath: null, sections: [] } }
  })
  expect(removed.ok()).toBe(true)
  expect(await listFolder(id)).toEqual([])
  await api.dispose()
})

test('(p8-editor) l’éditeur téléverse une photo (fichier choisi) ; elle s’affiche sur la fiche par URL signée', async ({ page }) => {
  const user = await signedIn('user')
  const id = await createRecipe(user.client, `${E2E_P8}Photo éditeur`, 'private')
  await loginV2(page, 'user')
  await gotoApp(page, `/recettes/${id}`)
  await page.getByTestId('action-edit').click()
  const dialog = page.getByRole('dialog', { name: 'Modifier la recette' })
  await expect(dialog).toBeVisible()
  await dialog.locator('input[type="file"]').first().setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG })
  await expect(dialog.getByText('Nouvelle photo : envoyée à l’enregistrement.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()
  await expect.poll(async () => (await listFolder(id)).length).toBe(1)
  await expectSignedPhoto(page, '[data-testid="recipe-photo"]')
})
