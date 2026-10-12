import { computed, ref } from 'vue'
import { classifyRecipeFile, DOCX_MIME_TYPE, isLegacyWordFile, RECIPE_FILE_MAX_BYTES } from '#shared/schemas/media'

/**
 * Import depuis Google Drive (traducteur IA, administrateurs).
 *
 * Tout se passe dans le navigateur, sans serveur ni stockage :
 *  1. Google Identity Services (jeton OAuth, portée minimale `drive.file`) ;
 *  2. Google Picker (l'utilisateur choisit UN fichier : c'est ce choix qui
 *     donne à l'appli l'accès à ce seul fichier, rien d'autre dans le Drive) ;
 *  3. API Drive : `files.get?alt=media` (PDF, photo, texte, Word .docx) ou `files.export`
 *     (Google Docs → texte brut) ;
 *  4. le résultat est un `File` remis au flux « fichier » existant du
 *     traducteur (`useTranslator().addFiles`), mêmes types et mêmes limites
 *     (un .docx est téléchargé tel quel, son texte est extrait dans le navigateur).
 *
 * Indépendant de la connexion Google de Supabase (qui ne fait qu'authentifier) :
 * le jeton d'accès ne vit qu'en mémoire (variable du module), jamais dans
 * localStorage ni côté serveur. Les scripts Google ne sont chargés qu'au clic.
 *
 * Désactivé (`enabled` faux, bouton masqué) tant que les trois variables
 * publiques ne sont pas toutes renseignées : voir docs/GOOGLE_DRIVE_SETUP.md.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
export const GAPI_SCRIPT_URL = 'https://apis.google.com/js/api.js'
export const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files'

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'
const GOOGLE_APPS_PREFIX = 'application/vnd.google-apps.'
/** Marge de sécurité sur la durée de vie du jeton (secondes). */
const TOKEN_MARGIN_SECONDS = 60

/** Types proposés dans le sélecteur Drive (le Picker n'accepte pas de joker `image/*`). */
export const PICKER_MIME_TYPES: readonly string[] = [
  GOOGLE_DOC_MIME,
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  // Word (.docx) : téléchargé tel quel, le texte est extrait ensuite dans le navigateur.
  DOCX_MIME_TYPE
]

/**
 * Config publique. Nuxt convertit les valeurs d'environnement numériques en
 * nombres à l'exécution : le numéro de projet (`appId`) arrive donc en `number`.
 */
export interface GoogleDriveConfig {
  clientId?: string | number
  apiKey?: string | number
  /** Numéro du projet Google Cloud. */
  appId?: string | number
}

const text = (value: string | number | null | undefined): string => String(value ?? '').trim()

/** Les trois variables sont nécessaires : sinon le bouton Drive n'existe pas. */
export function isDriveConfigured(config: GoogleDriveConfig | null | undefined): boolean {
  return Boolean(text(config?.clientId) && text(config?.apiKey) && text(config?.appId))
}

export type DriveErrorCode =
  | 'notConfigured'
  | 'scriptFailed'
  | 'popupBlocked'
  | 'accessDenied'
  | 'pickerFailed'
  | 'unsupported'
  | 'legacyDoc'
  | 'tooBig'
  | 'empty'
  | 'network'
  | 'failed'

/** Erreur d'import : un code (traduit par l'interface) et, si utile, le nom du fichier. */
export class DriveImportError extends Error {
  code: DriveErrorCode
  fileName?: string

  constructor(code: DriveErrorCode, fileName?: string) {
    super(`Import Google Drive : ${code}`)
    this.name = 'DriveImportError'
    this.code = code
    this.fileName = fileName
  }
}

/** Fenêtre d'autorisation fermée : annulation silencieuse. */
class DriveCancelled extends Error {}

/** Fichier choisi dans le Picker (champs de `google.picker.Document`). */
export interface DrivePickedFile {
  id: string
  name: string
  mimeType: string
  sizeBytes?: number
}

/** Comment récupérer un fichier choisi : adresse, nom et type du `File` produit. */
export interface DriveDownloadPlan {
  url: string
  fileName: string
  mimeType: string
}

function withExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  return `${base}.${extension}`
}

/**
 * Décide comment lire un fichier du Drive. Google Docs → export en texte brut ;
 * autres types Google (Sheets, Slides…) et formats inconnus → `unsupported` ;
 * fichier annoncé plus gros que la limite → `tooBig` (avant tout téléchargement).
 */
export function planDriveDownload(file: DrivePickedFile): DriveDownloadPlan {
  const id = encodeURIComponent(file.id)
  if (file.mimeType === GOOGLE_DOC_MIME) {
    return {
      url: `${DRIVE_API_URL}/${id}/export?mimeType=${encodeURIComponent('text/plain')}`,
      fileName: withExtension(file.name, 'txt'),
      mimeType: 'text/plain'
    }
  }
  if (file.mimeType.startsWith(GOOGLE_APPS_PREFIX)) throw new DriveImportError('unsupported', file.name)
  if (!classifyRecipeFile({ name: file.name, type: file.mimeType })) {
    throw new DriveImportError(isLegacyWordFile({ name: file.name, type: file.mimeType }) ? 'legacyDoc' : 'unsupported', file.name)
  }
  const size = Number(file.sizeBytes)
  if (Number.isFinite(size) && size > RECIPE_FILE_MAX_BYTES) throw new DriveImportError('tooBig', file.name)
  return {
    url: `${DRIVE_API_URL}/${id}?alt=media&supportsAllDrives=true`,
    fileName: file.name,
    mimeType: file.mimeType
  }
}

// --- Types minimaux des globales Google (pas de dépendance @types) ---------

interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
}

interface PickerResponse {
  [key: string]: unknown
}

interface GooglePickerView {
  setMimeTypes: (mimeTypes: string) => GooglePickerView
  setMode: (mode: unknown) => GooglePickerView
  setIncludeFolders: (include: boolean) => GooglePickerView
}

interface GooglePickerBuilder {
  addView: (view: unknown) => GooglePickerBuilder
  setOAuthToken: (token: string) => GooglePickerBuilder
  setDeveloperKey: (key: string) => GooglePickerBuilder
  setAppId: (appId: string) => GooglePickerBuilder
  setLocale: (locale: string) => GooglePickerBuilder
  setOrigin: (origin: string) => GooglePickerBuilder
  setCallback: (callback: (response: PickerResponse) => void) => GooglePickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}

interface GoogleGlobal {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback: (error: { type?: string }) => void
      }) => { requestAccessToken: (overrides?: { prompt?: string }) => void }
      hasGrantedAllScopes?: (response: TokenResponse, ...scopes: string[]) => boolean
    }
  }
  picker?: {
    PickerBuilder: new () => GooglePickerBuilder
    DocsView: new (viewId: unknown) => GooglePickerView
    ViewId: { DOCS: unknown }
    DocsViewMode: { LIST: unknown }
    Action: { PICKED: string, CANCEL: string }
    Response: { ACTION: string, DOCUMENTS: string }
    Document: { ID: string, NAME: string, MIME_TYPE: string, SIZE_BYTES: string }
  }
}

interface GapiGlobal {
  load: (api: string, options: { callback: () => void, onerror: () => void, timeout?: number, ontimeout?: () => void }) => void
}

/** Ce dont l'importeur a besoin du navigateur : remplaçable dans les tests. */
export interface DriveEnvironment {
  document: Document
  window: Window & { google?: GoogleGlobal, gapi?: GapiGlobal }
  fetch: typeof fetch
  now: () => number
}

export interface DriveImporter {
  /** Ouvre le sélecteur ; `null` si l'utilisateur annule. Lève `DriveImportError`. */
  pick: (locale?: string) => Promise<File | null>
}

/**
 * Importeur Drive. Le jeton d'accès et les scripts chargés sont gardés dans la
 * fermeture (mémoire seulement).
 */
export function createDriveImporter(config: GoogleDriveConfig, env: DriveEnvironment): DriveImporter {
  const scripts = new Map<string, Promise<void>>()
  let pickerLoaded: Promise<void> | null = null
  let token: { value: string, expiresAt: number } | null = null

  function loadScript(src: string): Promise<void> {
    const known = scripts.get(src)
    if (known) return known
    const promise = new Promise<void>((resolve, reject) => {
      const element = env.document.createElement('script')
      element.src = src
      element.async = true
      element.onload = () => resolve()
      element.onerror = () => {
        element.remove()
        reject(new DriveImportError('scriptFailed'))
      }
      env.document.head.appendChild(element)
    })
    // Un échec n'est pas mémorisé : le clic suivant réessaie.
    promise.catch(() => scripts.delete(src))
    scripts.set(src, promise)
    return promise
  }

  function loadPicker(): Promise<void> {
    if (pickerLoaded) return pickerLoaded
    const promise = new Promise<void>((resolve, reject) => {
      const gapi = env.window.gapi
      if (!gapi) {
        reject(new DriveImportError('scriptFailed'))
        return
      }
      const fail = () => reject(new DriveImportError('scriptFailed'))
      gapi.load('picker', { callback: () => resolve(), onerror: fail, timeout: 10_000, ontimeout: fail })
    })
    promise.catch(() => { pickerLoaded = null })
    pickerLoaded = promise
    return promise
  }

  async function prepare(): Promise<void> {
    await Promise.all([loadScript(GIS_SCRIPT_URL), loadScript(GAPI_SCRIPT_URL)])
    await loadPicker()
  }

  function requestToken(): Promise<string> {
    if (token && token.expiresAt > env.now()) return Promise.resolve(token.value)
    token = null
    return new Promise<string>((resolve, reject) => {
      const oauth2 = env.window.google?.accounts?.oauth2
      if (!oauth2) {
        reject(new DriveImportError('scriptFailed'))
        return
      }
      const client = oauth2.initTokenClient({
        client_id: text(config.clientId),
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new DriveImportError('accessDenied'))
            return
          }
          if (oauth2.hasGrantedAllScopes && !oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
            reject(new DriveImportError('accessDenied'))
            return
          }
          const lifetime = Number(response.expires_in)
          const seconds = Number.isFinite(lifetime) && lifetime > 0 ? lifetime : 3600
          token = { value: response.access_token, expiresAt: env.now() + Math.max(0, seconds - TOKEN_MARGIN_SECONDS) * 1000 }
          resolve(response.access_token)
        },
        error_callback: (error) => {
          // Fenêtre fermée par l'utilisateur : ce n'est pas une erreur (annulation).
          if (error.type === 'popup_closed') reject(new DriveCancelled())
          else reject(new DriveImportError(error.type === 'popup_failed_to_open' ? 'popupBlocked' : 'accessDenied'))
        }
      })
      // prompt vide : le consentement n'est redemandé qu'à la première autorisation.
      client.requestAccessToken({ prompt: '' })
    })
  }

  function showPicker(accessToken: string, locale: string): Promise<DrivePickedFile | null> {
    return new Promise((resolve, reject) => {
      const picker = env.window.google?.picker
      if (!picker) {
        reject(new DriveImportError('scriptFailed'))
        return
      }
      try {
        const view = new picker.DocsView(picker.ViewId.DOCS)
          .setMimeTypes(PICKER_MIME_TYPES.join(','))
          // Liste plutôt que vignettes : avec drive.file, l'appli n'a pas accès aux miniatures.
          .setMode(picker.DocsViewMode.LIST)
          .setIncludeFolders(true)
        new picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(accessToken)
          .setDeveloperKey(text(config.apiKey))
          .setAppId(text(config.appId))
          .setLocale(locale)
          .setOrigin(env.window.location.origin)
          .setCallback((response) => {
            const action = response[picker.Response.ACTION]
            if (action === picker.Action.PICKED) {
              const docs = response[picker.Response.DOCUMENTS] as Array<Record<string, unknown>> | undefined
              const doc = docs?.[0]
              if (!doc) {
                resolve(null)
                return
              }
              const size = doc[picker.Document.SIZE_BYTES]
              resolve({
                id: String(doc[picker.Document.ID] ?? ''),
                name: String(doc[picker.Document.NAME] ?? ''),
                mimeType: String(doc[picker.Document.MIME_TYPE] ?? ''),
                sizeBytes: size === undefined || size === null ? undefined : Number(size)
              })
            } else if (action === picker.Action.CANCEL) {
              resolve(null)
            }
            // Autres actions (« loaded »…) : on attend le choix ou l'annulation.
          })
          .build()
          .setVisible(true)
      } catch {
        reject(new DriveImportError('pickerFailed'))
      }
    })
  }

  /** Code d'erreur d'après la réponse HTTP de l'API Drive (corps JSON Google). */
  async function errorFromResponse(response: Response, fileName: string): Promise<DriveImportError> {
    let reason = ''
    try {
      const body = await response.json() as { error?: { errors?: Array<{ reason?: string }> } }
      reason = body.error?.errors?.[0]?.reason ?? ''
    } catch {
      // Corps absent ou non JSON : on se fie au statut.
    }
    if (reason === 'exportSizeLimitExceeded') return new DriveImportError('tooBig', fileName)
    if (reason === 'fileNotDownloadable') return new DriveImportError('unsupported', fileName)
    if (response.status === 401) token = null
    if ([401, 403, 404].includes(response.status)) return new DriveImportError('accessDenied', fileName)
    return new DriveImportError('failed', fileName)
  }

  async function download(accessToken: string, plan: DriveDownloadPlan): Promise<File> {
    let response: Response
    let blob: Blob
    try {
      response = await env.fetch(plan.url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!response.ok) throw await errorFromResponse(response, plan.fileName)
      blob = await response.blob()
    } catch (error: unknown) {
      if (error instanceof DriveImportError) throw error
      throw new DriveImportError('network', plan.fileName)
    }
    if (blob.size === 0) throw new DriveImportError('empty', plan.fileName)
    if (blob.size > RECIPE_FILE_MAX_BYTES) throw new DriveImportError('tooBig', plan.fileName)
    return new File([blob], plan.fileName, { type: plan.mimeType })
  }

  async function pick(locale = 'fr'): Promise<File | null> {
    if (!isDriveConfigured(config)) throw new DriveImportError('notConfigured')
    try {
      await prepare()
      const accessToken = await requestToken()
      const picked = await showPicker(accessToken, locale)
      if (!picked) return null
      return await download(accessToken, planDriveDownload(picked))
    } catch (error: unknown) {
      if (error instanceof DriveCancelled) return null
      throw error
    }
  }

  return { pick }
}

// --- Composable -----------------------------------------------------------

let sharedImporter: DriveImporter | null = null
let sharedKey = ''

/** Pour les tests : oublie l'importeur partagé (et donc son jeton en mémoire). */
export function resetSharedDriveImporter(): void {
  sharedImporter = null
  sharedKey = ''
}

function importerFor(config: GoogleDriveConfig): DriveImporter {
  const key = `${config.clientId}|${config.apiKey}|${config.appId}`
  if (!sharedImporter || sharedKey !== key) {
    sharedKey = key
    sharedImporter = createDriveImporter(config, {
      document,
      window,
      fetch: (...args) => window.fetch(...args),
      now: () => Date.now()
    })
  }
  return sharedImporter
}

/**
 * État du bouton « Google Drive » : `enabled` (config complète), `loading`,
 * `error` (code + nom du fichier, à traduire par l'interface) et `pick()`.
 * `pick()` ne lève jamais : erreur → `error` renseigné et `null`.
 */
export function useGoogleDrivePicker() {
  const config = useRuntimeConfig().public.google as GoogleDriveConfig | undefined
  // `$i18n` plutôt que `useI18n()` : utilisable aussi hors `setup` (tests) ; repli sur le français.
  const i18n = useNuxtApp().$i18n as { locale?: { value?: string } } | undefined

  const enabled = computed(() => isDriveConfigured(config))
  const loading = ref(false)
  const error = ref<{ code: DriveErrorCode, fileName?: string } | null>(null)

  async function pick(): Promise<File | null> {
    if (loading.value || !enabled.value || !config) return null
    loading.value = true
    error.value = null
    try {
      return await importerFor(config).pick(i18n?.locale?.value === 'en' ? 'en' : 'fr')
    } catch (err: unknown) {
      error.value = err instanceof DriveImportError
        ? { code: err.code, fileName: err.fileName }
        : { code: 'failed' }
      return null
    } finally {
      loading.value = false
    }
  }

  return { enabled, loading, error, pick }
}
