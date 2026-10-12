import { describe, expect, it, vi } from 'vitest'
import {
  createDriveImporter,
  DRIVE_SCOPE,
  DriveImportError,
  GAPI_SCRIPT_URL,
  GIS_SCRIPT_URL,
  isDriveConfigured,
  PICKER_MIME_TYPES,
  planDriveDownload,
  type DriveEnvironment,
  type DriveErrorCode,
  type DrivePickedFile
} from '../../app/composables/useGoogleDrivePicker'

/**
 * Import Google Drive : les globales Google (`google.accounts.oauth2`,
 * `google.picker`, `gapi`), le DOM (chargement des scripts) et `fetch` sont
 * simulés. Aucun appel réseau.
 */

const CONFIG = { clientId: 'client-id.apps.googleusercontent.com', apiKey: 'api-key', appId: '123456789' }
const MIB = 1024 * 1024

interface Scenario {
  /** Réponse du Picker (action + document choisi). */
  picked?: DrivePickedFile | 'cancel' | 'empty'
  /** Réponse de l'autorisation OAuth. */
  token?: { error?: string, expires_in?: number } | { errorCallback: string }
  /** Scripts dont le chargement échoue. */
  failScripts?: string[]
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
}

function bytes(text: string): Blob {
  return new Blob([text])
}

function makeEnvironment(scenario: Scenario = {}) {
  const loadedScripts: string[] = []
  const failing = new Set(scenario.failScripts ?? [])
  const tokenRequests: Array<{ scope: string, prompt?: string }> = []
  const pickerCalls: Record<string, unknown> = {}
  let clock = 1_000_000

  const document = {
    createElement: () => ({ src: '', async: false, onload: null as null | (() => void), onerror: null as null | (() => void), remove: () => undefined }),
    head: {
      appendChild(element: { src: string, onload: null | (() => void), onerror: null | (() => void) }) {
        loadedScripts.push(element.src)
        queueMicrotask(() => (failing.has(element.src) ? element.onerror?.() : element.onload?.()))
      }
    }
  }

  const tokenScenario = scenario.token ?? {}
  const google = {
    accounts: {
      oauth2: {
        initTokenClient: (config: { client_id: string, scope: string, callback: (r: unknown) => void, error_callback: (e: { type: string }) => void }) => ({
          requestAccessToken: (overrides?: { prompt?: string }) => {
            tokenRequests.push({ scope: config.scope, prompt: overrides?.prompt })
            queueMicrotask(() => {
              if ('errorCallback' in tokenScenario) config.error_callback({ type: tokenScenario.errorCallback })
              else if (tokenScenario.error) config.callback({ error: tokenScenario.error })
              else config.callback({ access_token: `token-${tokenRequests.length}`, expires_in: tokenScenario.expires_in ?? 3600, scope: config.scope })
            })
          }
        }),
        hasGrantedAllScopes: () => true
      }
    },
    picker: {
      ViewId: { DOCS: 'all' },
      DocsViewMode: { LIST: 'list' },
      Action: { PICKED: 'picked', CANCEL: 'cancel' },
      Response: { ACTION: 'action', DOCUMENTS: 'docs' },
      Document: { ID: 'id', NAME: 'name', MIME_TYPE: 'mimeType', SIZE_BYTES: 'sizeBytes' },
      DocsView: class {
        constructor(viewId: unknown) { pickerCalls.viewId = viewId }
        setMimeTypes(types: string) { pickerCalls.mimeTypes = types; return this }
        setMode(mode: unknown) { pickerCalls.mode = mode; return this }
        setIncludeFolders(include: boolean) { pickerCalls.includeFolders = include; return this }
      },
      PickerBuilder: class {
        callback: (response: Record<string, unknown>) => void = () => undefined
        addView() { return this }
        setOAuthToken(value: string) { pickerCalls.oauthToken = value; return this }
        setDeveloperKey(value: string) { pickerCalls.developerKey = value; return this }
        setAppId(value: string) { pickerCalls.appId = value; return this }
        setLocale(value: string) { pickerCalls.locale = value; return this }
        setOrigin(value: string) { pickerCalls.origin = value; return this }
        setCallback(callback: (response: Record<string, unknown>) => void) { this.callback = callback; return this }
        build() {
          return {
            setVisible: () => {
              pickerCalls.shown = true
              queueMicrotask(() => {
                const picked = scenario.picked
                if (picked === 'cancel') this.callback({ action: 'cancel' })
                else if (picked === 'empty') this.callback({ action: 'picked', docs: [] })
                else this.callback({ action: 'picked', docs: [picked] })
              })
            }
          }
        }
      }
    }
  }

  const fetchMock = vi.fn(scenario.fetchImpl ?? (async () => new Response(bytes('Gâteau\n200 g de farine'), { status: 200 })))

  const env = {
    document,
    window: { gapi: { load: (_api: string, options: { callback: () => void }) => options.callback() }, google, location: { origin: 'https://recettes.test' } },
    fetch: fetchMock,
    now: () => clock
  } as unknown as DriveEnvironment

  return { env, loadedScripts, tokenRequests, pickerCalls, fetchMock, advance: (ms: number) => { clock += ms } }
}

async function errorCodeOf(promise: Promise<unknown>): Promise<DriveErrorCode | 'no-error'> {
  try {
    await promise
    return 'no-error'
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(DriveImportError)
    return (error as DriveImportError).code
  }
}

const textFile: DrivePickedFile = { id: 'abc', name: 'gateau.txt', mimeType: 'text/plain', sizeBytes: 22 }

describe('isDriveConfigured', () => {
  it('exige les trois variables', () => {
    expect(isDriveConfigured(CONFIG)).toBe(true)
    expect(isDriveConfigured({ ...CONFIG, clientId: '' })).toBe(false)
    expect(isDriveConfigured({ ...CONFIG, apiKey: '  ' })).toBe(false)
    expect(isDriveConfigured({ ...CONFIG, appId: undefined })).toBe(false)
    // Nuxt convertit un NUXT_PUBLIC_GOOGLE_APP_ID numérique en nombre.
    expect(isDriveConfigured({ ...CONFIG, appId: 123456789 })).toBe(true)
    expect(isDriveConfigured({})).toBe(false)
    expect(isDriveConfigured(undefined)).toBe(false)
  })
})

describe('planDriveDownload', () => {
  it('PDF, photos et texte : téléchargement direct (alt=media)', () => {
    for (const [name, mimeType] of [['livre.pdf', 'application/pdf'], ['page.jpg', 'image/jpeg'], ['page.png', 'image/png'], ['page.webp', 'image/webp'], ['note.txt', 'text/plain'], ['note.md', 'text/markdown']] as const) {
      const plan = planDriveDownload({ id: 'f1', name, mimeType, sizeBytes: 1000 })
      expect(plan.url).toBe('https://www.googleapis.com/drive/v3/files/f1?alt=media&supportsAllDrives=true')
      expect(plan.fileName).toBe(name)
      expect(plan.mimeType).toBe(mimeType)
    }
  })

  it('un .md typé octet-stream par le Drive est reconnu grâce à l\'extension', () => {
    expect(planDriveDownload({ id: 'f1', name: 'tarte.md', mimeType: 'application/octet-stream' }).fileName).toBe('tarte.md')
  })

  it('Google Docs : export en texte brut, nom en .txt', () => {
    const plan = planDriveDownload({ id: 'doc 1', name: 'Gâteau au yaourt', mimeType: 'application/vnd.google-apps.document' })
    expect(plan.url).toBe('https://www.googleapis.com/drive/v3/files/doc%201/export?mimeType=text%2Fplain')
    expect(plan.fileName).toBe('Gâteau au yaourt.txt')
    expect(plan.mimeType).toBe('text/plain')
  })

  it('Sheets, Slides, autres types Google et formats inconnus : non pris en charge', () => {
    for (const mimeType of ['application/vnd.google-apps.spreadsheet', 'application/vnd.google-apps.presentation', 'application/vnd.google-apps.folder']) {
      expect(() => planDriveDownload({ id: 'x', name: 'x', mimeType })).toThrowError(DriveImportError)
    }
    expect(() => planDriveDownload({ id: 'x', name: 'recette.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toThrowError(DriveImportError)
  })

  it('Word .docx : téléchargé tel quel (alt=media), l\'extraction du texte se fait ensuite dans le navigateur', () => {
    const mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    const plan = planDriveDownload({ id: 'w1', name: 'recette.docx', mimeType, sizeBytes: 50_000 })
    expect(plan.url).toBe('https://www.googleapis.com/drive/v3/files/w1?alt=media&supportsAllDrives=true')
    expect(plan.fileName).toBe('recette.docx')
    expect(plan.mimeType).toBe(mimeType)
    expect(PICKER_MIME_TYPES).toContain(mimeType)
  })

  it('ancien Word .doc : refusé avec un code dédié (conseil .docx ou PDF)', () => {
    try {
      planDriveDownload({ id: 'w2', name: 'recette.doc', mimeType: 'application/msword' })
      expect.unreachable()
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DriveImportError)
      expect((error as DriveImportError).code).toBe('legacyDoc')
    }
  })

  it('fichier annoncé au-delà de 10 Mo : refusé avant tout téléchargement', () => {
    expect(() => planDriveDownload({ id: 'x', name: 'gros.pdf', mimeType: 'application/pdf', sizeBytes: 10 * MIB + 1 })).toThrowError(expect.objectContaining({ code: 'tooBig', fileName: 'gros.pdf' }))
    expect(planDriveDownload({ id: 'x', name: 'limite.pdf', mimeType: 'application/pdf', sizeBytes: 10 * MIB }).fileName).toBe('limite.pdf')
  })
})

describe('createDriveImporter.pick', () => {
  it('ne charge aucun script avant le clic, puis charge GIS et gapi', async () => {
    const { env, loadedScripts } = makeEnvironment({ picked: textFile })
    const importer = createDriveImporter(CONFIG, env)
    expect(loadedScripts).toEqual([])
    await importer.pick('fr')
    expect(loadedScripts.sort()).toEqual([GAPI_SCRIPT_URL, GIS_SCRIPT_URL].sort())
  })

  it('parcours complet : jeton drive.file, Picker configuré, fichier téléchargé avec le jeton', async () => {
    const { env, tokenRequests, pickerCalls, fetchMock } = makeEnvironment({ picked: textFile })
    const file = await createDriveImporter(CONFIG, env).pick('en')

    expect(tokenRequests).toEqual([{ scope: DRIVE_SCOPE, prompt: '' }])
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file')
    expect(pickerCalls).toMatchObject({ oauthToken: 'token-1', developerKey: 'api-key', appId: '123456789', locale: 'en', origin: 'https://recettes.test', mode: 'list', shown: true })
    expect(String(pickerCalls.mimeTypes)).toContain('application/vnd.google-apps.document')
    expect(String(pickerCalls.mimeTypes)).toContain('application/pdf')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/files/abc?alt=media')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-1' })

    expect(file).toBeInstanceOf(File)
    expect(file?.name).toBe('gateau.txt')
    expect(file?.type).toBe('text/plain')
    expect(await file?.text()).toBe('Gâteau\n200 g de farine')
  })

  it('Google Docs : appelle files.export en text/plain', async () => {
    const { env, fetchMock } = makeEnvironment({ picked: { id: 'doc9', name: 'Tarte', mimeType: 'application/vnd.google-apps.document' } })
    const file = await createDriveImporter(CONFIG, env).pick()
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://www.googleapis.com/drive/v3/files/doc9/export?mimeType=text%2Fplain')
    expect(file?.name).toBe('Tarte.txt')
    expect(file?.type).toBe('text/plain')
  })

  it('PDF et photo : remis en File avec leur type', async () => {
    const pdf = await createDriveImporter(CONFIG, makeEnvironment({ picked: { id: 'p', name: 'livre.pdf', mimeType: 'application/pdf', sizeBytes: 5 } }).env).pick()
    expect(pdf?.type).toBe('application/pdf')
    const image = await createDriveImporter(CONFIG, makeEnvironment({ picked: { id: 'i', name: 'page.jpg', mimeType: 'image/jpeg', sizeBytes: 5 } }).env).pick()
    expect(image?.type).toBe('image/jpeg')
  })

  it('annulation dans le Picker ou sans document : null, sans téléchargement', async () => {
    for (const picked of ['cancel', 'empty'] as const) {
      const { env, fetchMock } = makeEnvironment({ picked })
      expect(await createDriveImporter(CONFIG, env).pick()).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    }
  })

  it('fenêtre d\'autorisation fermée : annulation silencieuse (null)', async () => {
    const { env } = makeEnvironment({ token: { errorCallback: 'popup_closed' } })
    expect(await createDriveImporter(CONFIG, env).pick()).toBeNull()
  })

  it('numéro de projet numérique (config Nuxt) : transmis au Picker en chaîne', async () => {
    const { env, pickerCalls } = makeEnvironment({ picked: textFile })
    await createDriveImporter({ ...CONFIG, appId: 123456789 }, env).pick()
    expect(pickerCalls.appId).toBe('123456789')
  })

  it('pas de config : notConfigured, aucun script chargé', async () => {
    const { env, loadedScripts } = makeEnvironment({ picked: textFile })
    expect(await errorCodeOf(createDriveImporter({ clientId: 'x' }, env).pick())).toBe('notConfigured')
    expect(loadedScripts).toEqual([])
  })

  it('pop-up bloquée, accès refusé, scripts Google injoignables', async () => {
    expect(await errorCodeOf(createDriveImporter(CONFIG, makeEnvironment({ token: { errorCallback: 'popup_failed_to_open' } }).env).pick())).toBe('popupBlocked')
    expect(await errorCodeOf(createDriveImporter(CONFIG, makeEnvironment({ token: { error: 'access_denied' } }).env).pick())).toBe('accessDenied')
    expect(await errorCodeOf(createDriveImporter(CONFIG, makeEnvironment({ failScripts: [GIS_SCRIPT_URL] }).env).pick())).toBe('scriptFailed')
  })

  it('un chargement de script raté n\'est pas mémorisé : le clic suivant réessaie', async () => {
    const scenario = makeEnvironment({ failScripts: [GAPI_SCRIPT_URL], picked: textFile })
    const importer = createDriveImporter(CONFIG, scenario.env)
    expect(await errorCodeOf(importer.pick())).toBe('scriptFailed')
    // Le réseau est revenu : le même script est redemandé.
    ;(scenario.env.document.head as unknown as { appendChild: (el: { src: string, onload: () => void }) => void }).appendChild = (element) => {
      scenario.loadedScripts.push(element.src)
      queueMicrotask(() => element.onload())
    }
    expect((await importer.pick())?.name).toBe('gateau.txt')
  })

  it('format non pris en charge (Sheets) ou trop gros : erreur avant téléchargement', async () => {
    const sheet = makeEnvironment({ picked: { id: 's', name: 'Courses', mimeType: 'application/vnd.google-apps.spreadsheet' } })
    expect(await errorCodeOf(createDriveImporter(CONFIG, sheet.env).pick())).toBe('unsupported')
    expect(sheet.fetchMock).not.toHaveBeenCalled()

    const big = makeEnvironment({ picked: { id: 'b', name: 'scan.pdf', mimeType: 'application/pdf', sizeBytes: 11 * MIB } })
    expect(await errorCodeOf(createDriveImporter(CONFIG, big.env).pick())).toBe('tooBig')
    expect(big.fetchMock).not.toHaveBeenCalled()
  })

  it('taille réelle au-delà de 10 Mo (taille annoncée absente) ou fichier vide', async () => {
    const huge = makeEnvironment({
      picked: { id: 'd', name: 'Doc', mimeType: 'application/vnd.google-apps.document' },
      fetchImpl: async () => new Response(new Blob([new Uint8Array(10 * MIB + 1)]), { status: 200 })
    })
    expect(await errorCodeOf(createDriveImporter(CONFIG, huge.env).pick())).toBe('tooBig')

    const empty = makeEnvironment({ picked: textFile, fetchImpl: async () => new Response(new Blob([]), { status: 200 }) })
    expect(await errorCodeOf(createDriveImporter(CONFIG, empty.env).pick())).toBe('empty')
  })

  it('erreurs HTTP de l\'API Drive', async () => {
    const reply = (status: number, reason?: string) => async () =>
      new Response(JSON.stringify({ error: { errors: reason ? [{ reason }] : [] } }), { status })
    const codeFor = async (status: number, reason?: string) =>
      errorCodeOf(createDriveImporter(CONFIG, makeEnvironment({ picked: textFile, fetchImpl: reply(status, reason) }).env).pick())

    expect(await codeFor(403, 'exportSizeLimitExceeded')).toBe('tooBig')
    expect(await codeFor(403, 'fileNotDownloadable')).toBe('unsupported')
    expect(await codeFor(403)).toBe('accessDenied')
    expect(await codeFor(404)).toBe('accessDenied')
    expect(await codeFor(500)).toBe('failed')
  })

  it('réseau coupé pendant le téléchargement : network', async () => {
    const { env } = makeEnvironment({ picked: textFile, fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')) })
    expect(await errorCodeOf(createDriveImporter(CONFIG, env).pick())).toBe('network')
  })

  it('le jeton est réutilisé tant qu\'il est valide, redemandé après expiration ou après un 401', async () => {
    const scenario = makeEnvironment({ picked: textFile, token: { expires_in: 3600 } })
    const importer = createDriveImporter(CONFIG, scenario.env)
    await importer.pick()
    await importer.pick()
    expect(scenario.tokenRequests).toHaveLength(1)

    scenario.advance(3600 * 1000)
    await importer.pick()
    expect(scenario.tokenRequests).toHaveLength(2)

    // 401 : le jeton est jeté, le suivant en redemande un.
    const revoked = makeEnvironment({ picked: textFile, fetchImpl: async () => new Response('{}', { status: 401 }) })
    const second = createDriveImporter(CONFIG, revoked.env)
    expect(await errorCodeOf(second.pick())).toBe('accessDenied')
    expect(await errorCodeOf(second.pick())).toBe('accessDenied')
    expect(revoked.tokenRequests).toHaveLength(2)
  })
})
