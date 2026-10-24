import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectPhotoPaths, deleteAccountFlow, type AccountDeletionPorts } from '../../server/utils/accountDeletion'

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }))
vi.mock('@sentry/nuxt', () => sentry)

/** Faux ports : enregistrent l'ordre des appels. */
function ports(overrides: Partial<AccountDeletionPorts> = {}) {
  const calls: string[] = []
  const base: AccountDeletionPorts = {
    blockers: async () => { calls.push('blockers'); return { data: [], error: null } },
    recipeIds: async (from) => { calls.push(`recipeIds:${from}`); return { data: from === 0 ? [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] : [], error: null } },
    listPhotos: async (recipeId) => {
      calls.push(`listPhotos:${recipeId}`)
      const files: Record<string, Array<{ name: string, id: string | null }>> = {
        r1: [{ name: 'a.webp', id: 'x1' }],
        r2: [{ name: 'b.webp', id: 'x2' }, { name: '.emptyFolderPlaceholder', id: 'x3' }, { name: 'sous-dossier', id: null }],
        r3: []
      }
      return { data: files[recipeId] ?? [], error: null }
    },
    prepare: async () => { calls.push('prepare'); return { data: 1, error: null } },
    deleteAuthUser: async () => { calls.push('deleteAuthUser'); return { error: null } },
    removePhotos: async (paths) => { calls.push(`removePhotos:${paths.join(',')}`); return { error: null } }
  }
  return { ports: { ...base, ...overrides }, calls }
}

async function thrown(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise
  } catch (error) {
    return error as Record<string, unknown>
  }
  throw new Error('aucune erreur levée')
}

describe('suppression de compte (logique serveur)', () => {
  beforeEach(() => {
    sentry.captureException.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('aucun blocage : préparation, suppression du compte, puis photos (dans cet ordre)', async () => {
    const { ports: p, calls } = ports()
    const result = await deleteAccountFlow(p)
    expect(result).toEqual({ deletedGroups: 1, removedPhotos: 2 })
    expect(calls).toEqual(['blockers', 'recipeIds:0', 'listPhotos:r1', 'listPhotos:r2', 'listPhotos:r3', 'prepare', 'deleteAuthUser', 'removePhotos:r1/a.webp,r2/b.webp'])
  })

  it('un groupe à transférer bloque (409 + liste), RIEN n\'est supprimé', async () => {
    const { ports: p, calls } = ports({
      blockers: async () => ({ data: [{ group_id: 'g1', group_name: 'Les Voisins', other_member_count: 3 }], error: null })
    })
    const error = await thrown(deleteAccountFlow(p))
    expect(error.statusCode).toBe(409)
    expect(error.statusMessage).toMatch(/Transférez ou supprimez vos groupes/)
    expect(error.data).toEqual({ blockers: [{ groupId: 'g1', groupName: 'Les Voisins', otherMemberCount: 3 }] })
    expect(calls).toEqual([])
  })

  it('un membre arrivé entre le contrôle et le verrou (55000) : 409, le compte n\'est pas supprimé', async () => {
    const { ports: p, calls } = ports({
      prepare: async () => ({ data: null, error: { code: '55000', message: 'Transférez ou supprimez vos groupes avant de supprimer le compte' } })
    })
    const error = await thrown(deleteAccountFlow(p))
    expect(error.statusCode).toBe(409)
    expect(calls).not.toContain('deleteAuthUser')
  })

  it('échec de la suppression du compte : 500 générique, photos conservées', async () => {
    const { ports: p, calls } = ports({
      deleteAuthUser: async () => ({ error: { code: 'unexpected_failure', message: 'secret technique' } })
    })
    const error = await thrown(deleteAccountFlow(p))
    expect(error.statusCode).toBe(500)
    expect(String(error.statusMessage)).not.toMatch(/secret technique/)
    expect(calls.some(c => c.startsWith('removePhotos'))).toBe(false)
  })

  it('erreur de contrôle des blocages : refus propre, rien de supprimé', async () => {
    const { ports: p, calls } = ports({ blockers: async () => ({ data: null, error: { code: '42501', message: 'x' } }) })
    expect((await thrown(deleteAccountFlow(p))).statusCode).toBe(403)
    expect(calls).toEqual([])
  })

  it('échec du nettoyage des photos : journalisé, la suppression réussit quand même', async () => {
    const { ports: p } = ports({ removePhotos: async () => ({ error: { message: 'bucket indisponible' } }) })
    const result = await deleteAccountFlow(p)
    expect(result).toEqual({ deletedGroups: 1, removedPhotos: 0 })
    expect(sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('sans photo : le bucket n\'est pas appelé ; préparation sans groupe : 0', async () => {
    const removePhotos = vi.fn(async () => ({ error: null }))
    const { ports: p } = ports({
      recipeIds: async () => ({ data: [], error: null }),
      prepare: async () => ({ data: 0, error: null }),
      removePhotos
    })
    expect(await deleteAccountFlow(p)).toEqual({ deletedGroups: 0, removedPhotos: 0 })
    expect(removePhotos).not.toHaveBeenCalled()
  })
})

describe('chemins des photos : listage du bucket par préfixe, avec pagination', () => {
  it('lit les recettes par pages de 1000 et les dossiers par pages de 100', async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => `r${String(i).padStart(4, '0')}`)
    const recipeIds = vi.fn(async (from: number, to: number) => ({ data: ids.slice(from, to + 1).map(id => ({ id })), error: null }))
    // r0000 a 250 fichiers (3 pages : 100 + 100 + 50) ; r1200 (2e page de recettes) en a 1
    const listPhotos = vi.fn(async (recipeId: string, offset: number, limit: number) => {
      const total = recipeId === 'r0000' ? 250 : recipeId === 'r1200' ? 1 : 0
      const names = Array.from({ length: total }, (_, i) => ({ name: `f${i}.webp`, id: `id${i}` }))
      return { data: names.slice(offset, offset + limit), error: null }
    })
    const paths = await collectPhotoPaths({ recipeIds, listPhotos })
    expect(recipeIds.mock.calls.map(c => [c[0], c[1]])).toEqual([[0, 999], [1000, 1999]])
    expect(listPhotos.mock.calls.filter(c => c[0] === 'r0000').map(c => c[1])).toEqual([0, 100, 200])
    expect(paths).toHaveLength(251)
    expect(paths).toContain('r0000/f249.webp')
    expect(paths).toContain('r1200/f0.webp')
    expect(new Set(paths).size).toBe(251)
  })

  it('exactement 1000 recettes : une page vide supplémentaire est demandée', async () => {
    const recipeIds = vi.fn(async (from: number) => ({ data: from === 0 ? Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` })) : [], error: null }))
    const listPhotos = vi.fn(async () => ({ data: [], error: null }))
    expect(await collectPhotoPaths({ recipeIds, listPhotos })).toEqual([])
    expect(recipeIds).toHaveBeenCalledTimes(2)
  })

  it('un échec du listage interrompt tout AVANT la suppression du compte', async () => {
    const { ports: p, calls } = ports({ listPhotos: async () => ({ data: null, error: { code: 'XX000', message: 'stockage en panne' } }) })
    const error = await thrown(deleteAccountFlow(p))
    expect(error.statusCode).toBe(500)
    expect(calls).not.toContain('prepare')
    expect(calls).not.toContain('deleteAuthUser')
  })

  it('les retraits se font par paquets de 100', async () => {
    const removePhotos = vi.fn(async () => ({ error: null }))
    const { ports: p } = ports({
      recipeIds: async () => ({ data: [{ id: 'r1' }], error: null }),
      listPhotos: async (_id, offset, limit) => ({ data: Array.from({ length: 230 }, (_, i) => ({ name: `f${i}.webp`, id: `i${i}` })).slice(offset, offset + limit), error: null }),
      removePhotos
    })
    const result = await deleteAccountFlow(p)
    expect(result.removedPhotos).toBe(230)
    expect(removePhotos.mock.calls.map(c => (c[0] as string[]).length)).toEqual([100, 100, 30])
  })
})

