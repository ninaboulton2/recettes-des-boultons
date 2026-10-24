import { describe, expect, it, vi } from 'vitest'
import { createSignedUrlResolver, type KeyValueStore, type SignedUrlRow } from '../../app/utils/signedPhotoUrls'

const A = '11111111-1111-4111-8111-111111111111/1.webp'
const B = '22222222-2222-4222-8222-222222222222/2.webp'

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}

/** Planificateur manuel : les demandes sont regroupées jusqu'à `tick()`. */
function setup(options: { rows?: (paths: string[]) => SignedUrlRow[], store?: KeyValueStore, maxBatch?: number } = {}) {
  let time = 1_000_000
  const timers: Array<() => void> = []
  const sign = vi.fn(async (paths: string[], ttl: number) => ({
    data: options.rows ? options.rows(paths) : paths.map(path => ({ path, signedUrl: `https://s.test/${path}?token=t${time}&ttl=${ttl}`, error: null })),
    error: null
  }))
  const resolver = createSignedUrlResolver({
    sign,
    now: () => time,
    schedule: (callback) => { timers.push(callback) },
    store: options.store,
    maxBatch: options.maxBatch
  })
  const tick = async () => { while (timers.length > 0) timers.shift()!(); await new Promise(resolve => setTimeout(resolve, 0)) }
  return { resolver, sign, tick, advance: (ms: number) => { time += ms } }
}

describe('URL signées des photos privées (regroupement et cache)', () => {
  it('les demandes de la même fenêtre partent en UN appel createSignedUrls (1 h)', async () => {
    const { resolver, sign, tick } = setup()
    const results = [resolver.resolve(A), resolver.resolve(B), resolver.resolve(A)]
    await tick()
    const urls = await Promise.all(results)
    expect(sign).toHaveBeenCalledTimes(1)
    expect(sign).toHaveBeenCalledWith([A, B], 3600)
    expect(urls[0]).toContain(A)
    expect(urls[1]).toContain(B)
    expect(urls[2]).toBe(urls[0])
  })

  it('une URL encore valable est réutilisée telle quelle (même adresse = cache HTTP du navigateur), sans nouvel appel', async () => {
    const { resolver, sign, tick, advance } = setup()
    const first = resolver.resolve(A)
    await tick()
    const url = await first
    advance(30 * 60 * 1000)
    expect(await resolver.resolve(A)).toBe(url)
    expect(resolver.peek(A)).toBe(url)
    expect(sign).toHaveBeenCalledTimes(1)
  })

  it('à moins de 5 minutes de l\'expiration, l\'URL est renouvelée', async () => {
    const { resolver, sign, tick, advance } = setup()
    const first = resolver.resolve(A)
    await tick()
    const url = await first
    advance(56 * 60 * 1000)
    expect(resolver.peek(A)).toBeNull()
    const second = resolver.resolve(A)
    await tick()
    expect(await second).not.toBe(url)
    expect(sign).toHaveBeenCalledTimes(2)
  })

  it('un chemin refusé (erreur par ligne) donne null et n\'est pas mémorisé ; les autres passent', async () => {
    const { resolver, tick } = setup({
      rows: paths => paths.map(path => path === B
        ? { path, signedUrl: null, error: 'Object not found' }
        : { path, signedUrl: `https://s.test/${path}?token=x`, error: null })
    })
    const a = resolver.resolve(A)
    const b = resolver.resolve(B)
    await tick()
    expect(await a).toContain(A)
    expect(await b).toBeNull()
    expect(resolver.peek(B)).toBeNull()
  })

  it('une panne de l\'appel donne null pour tous, sans lever d\'erreur', async () => {
    const sign = vi.fn(async () => { throw new Error('réseau') })
    const timers: Array<() => void> = []
    const resolver = createSignedUrlResolver({ sign, schedule: (callback) => { timers.push(callback) } })
    const result = resolver.resolve(A)
    timers.shift()!()
    expect(await result).toBeNull()
  })

  it('plus de 100 chemins : plusieurs lots', async () => {
    const { resolver, sign, tick } = setup({ maxBatch: 2 })
    const all = [resolver.resolve(A), resolver.resolve(B), resolver.resolve('33333333-3333-4333-8333-333333333333/3.webp')]
    await tick()
    await Promise.all(all)
    expect(sign.mock.calls.map(call => (call[0] as string[]).length)).toEqual([2, 1])
  })

  it('sessionStorage : les URL valables survivent au rechargement, les périmées non ; clear() vide tout', async () => {
    const store = memoryStore()
    const first = setup({ store })
    const p = first.resolver.resolve(A)
    await first.tick()
    const url = await p
    expect(store.data.size).toBe(1)

    // « rechargement » : nouveau résolveur, même stockage, même horloge
    const reloaded = createSignedUrlResolver({ sign: vi.fn(), now: () => 1_000_000 + 60_000, store })
    expect(reloaded.peek(A)).toBe(url)
    const expired = createSignedUrlResolver({ sign: vi.fn(), now: () => 1_000_000 + 3_600_000, store })
    expect(expired.peek(A)).toBeNull()

    reloaded.clear()
    expect(store.data.size).toBe(0)
    expect(reloaded.peek(A)).toBeNull()
  })

  it('un stockage cassé ou illisible ne fait rien planter', async () => {
    const broken: KeyValueStore = {
      getItem: () => { throw new Error('refusé') },
      setItem: () => { throw new Error('plein') },
      removeItem: () => { throw new Error('refusé') }
    }
    const { resolver, tick } = setup({ store: broken })
    const result = resolver.resolve(A)
    await tick()
    expect(await result).toContain(A)
    expect(() => resolver.clear()).not.toThrow()
    const garbage = memoryStore()
    garbage.setItem('rdb:photo-urls:v1', '{pas du json')
    expect(createSignedUrlResolver({ sign: vi.fn(), store: garbage }).peek(A)).toBeNull()
  })
})
