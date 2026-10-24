/**
 * Résolveur d'URL signées des photos privées (phase 8, v2) — logique pure, testable sans Nuxt ni Supabase.
 *
 *  - REGROUPEMENT : les demandes faites dans la même courte fenêtre (les cartes d'une liste se montent ensemble) partent en UN seul
 *    appel `createSignedUrls` (par lots de 100 chemins) ;
 *  - CACHE : une URL signée vaut `ttlSeconds` (1 h) ; on la réutilise tant qu'il lui reste plus de `marginSeconds` (5 min). Garder
 *    la MÊME adresse permet au cache HTTP du navigateur de resservir l'image (en-tête `Cache-Control` posé au téléversement),
 *    au lieu de retélécharger une photo à chaque affichage de carte ;
 *  - mémorisation dans `sessionStorage` (le temps de l'onglet, pas plus : une photo privée ne survit pas à la session), vidée à la
 *    déconnexion (`clear`) ;
 *  - une demande en cours pour un chemin n'est pas dupliquée ; un chemin refusé (droit absent, objet disparu) donne `null`
 *    (la carte garde son illustration de repli), sans être mémorisé.
 */

export interface SignedUrlRow {
  path: string | null
  signedUrl: string | null
  error?: string | null
}

export interface KeyValueStore {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export interface SignedUrlResolverOptions {
  /** `storage.from('recipe-photos').createSignedUrls(paths, ttl)` : lignes dans n'importe quel ordre. */
  sign: (paths: string[], ttlSeconds: number) => PromiseLike<{ data: SignedUrlRow[] | null, error: { message?: string } | null }>
  ttlSeconds?: number
  marginSeconds?: number
  /** Délai de regroupement (ms). */
  batchDelayMs?: number
  maxBatch?: number
  now?: () => number
  schedule?: (callback: () => void, delayMs: number) => void
  store?: KeyValueStore | null
  storageKey?: string
}

interface Entry { url: string, expiresAt: number }

export const SIGNED_URL_TTL_SECONDS = 3600
const DEFAULT_MARGIN_SECONDS = 300
const DEFAULT_BATCH_DELAY_MS = 10
const DEFAULT_MAX_BATCH = 100
const DEFAULT_STORAGE_KEY = 'rdb:photo-urls:v1'

export function createSignedUrlResolver(options: SignedUrlResolverOptions) {
  const ttl = options.ttlSeconds ?? SIGNED_URL_TTL_SECONDS
  const margin = options.marginSeconds ?? DEFAULT_MARGIN_SECONDS
  const delay = options.batchDelayMs ?? DEFAULT_BATCH_DELAY_MS
  const maxBatch = options.maxBatch ?? DEFAULT_MAX_BATCH
  const now = options.now ?? (() => Date.now())
  const schedule = options.schedule ?? ((callback, ms) => { setTimeout(callback, ms) })
  const store = options.store ?? null
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY

  const cache = new Map<string, Entry>()
  const waiting = new Map<string, Array<(url: string | null) => void>>()
  let scheduled = false
  let loaded = false

  const fresh = (entry: Entry | undefined): entry is Entry => !!entry && entry.expiresAt - now() > margin * 1000

  function load(): void {
    if (loaded) return
    loaded = true
    if (!store) return
    try {
      const raw = store.getItem(storageKey)
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) return
      for (const [path, value] of Object.entries(parsed as Record<string, unknown>)) {
        const entry = value as Partial<Entry> | null
        if (entry && typeof entry.url === 'string' && typeof entry.expiresAt === 'number' && fresh(entry as Entry)) cache.set(path, entry as Entry)
      }
    } catch {
      // stockage indisponible ou contenu illisible : on repart d'un cache vide
    }
  }

  function save(): void {
    if (!store) return
    try {
      const out: Record<string, Entry> = {}
      for (const [path, entry] of cache) if (fresh(entry)) out[path] = entry
      store.setItem(storageKey, JSON.stringify(out))
    } catch {
      // quota ou mode privé : sans conséquence
    }
  }

  async function flush(): Promise<void> {
    scheduled = false
    const paths = [...waiting.keys()]
    const callbacks = new Map(waiting)
    waiting.clear()
    for (let i = 0; i < paths.length; i += maxBatch) {
      const chunk = paths.slice(i, i + maxBatch)
      let rows: SignedUrlRow[] = []
      try {
        const result = await options.sign(chunk, ttl)
        if (!result.error) rows = result.data ?? []
      } catch {
        rows = []
      }
      const byPath = new Map<string, string>()
      for (const row of rows) if (row.path && row.signedUrl && !row.error) byPath.set(row.path, row.signedUrl)
      const expiresAt = now() + ttl * 1000
      for (const path of chunk) {
        const url = byPath.get(path) ?? null
        if (url) cache.set(path, { url, expiresAt })
        for (const callback of callbacks.get(path) ?? []) callback(url)
      }
    }
    save()
  }

  /** URL déjà connue et encore valable, sans appel réseau. */
  function peek(path: string): string | null {
    load()
    const entry = cache.get(path)
    return fresh(entry) ? entry.url : null
  }

  /** URL signée d'un chemin du bucket (`null` si refusée ou introuvable). */
  function resolve(path: string): Promise<string | null> {
    const known = peek(path)
    if (known) return Promise.resolve(known)
    return new Promise((resolve) => {
      const list = waiting.get(path)
      if (list) list.push(resolve)
      else waiting.set(path, [resolve])
      if (!scheduled) {
        scheduled = true
        schedule(() => { void flush() }, delay)
      }
    })
  }

  function clear(): void {
    cache.clear()
    loaded = true
    try {
      store?.removeItem(storageKey)
    } catch {
      // ignoré
    }
  }

  return { resolve, peek, clear }
}
