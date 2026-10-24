import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAccountFlow, type AccountDeletionPorts } from '../../server/utils/accountDeletion'

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }))
vi.mock('@sentry/nuxt', () => sentry)

/** Faux ports : enregistrent l'ordre des appels. */
function ports(overrides: Partial<AccountDeletionPorts> = {}) {
  const calls: string[] = []
  const base: AccountDeletionPorts = {
    blockers: async () => { calls.push('blockers'); return { data: [], error: null } },
    photoPaths: async () => { calls.push('photoPaths'); return { data: [{ photo_path: 'r1/a.webp' }, { photo_path: null }, { photo_path: 'r2/b.webp' }], error: null } },
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
    expect(calls).toEqual(['blockers', 'photoPaths', 'prepare', 'deleteAuthUser', 'removePhotos:r1/a.webp,r2/b.webp'])
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
      photoPaths: async () => ({ data: [], error: null }),
      prepare: async () => ({ data: 0, error: null }),
      removePhotos
    })
    expect(await deleteAccountFlow(p)).toEqual({ deletedGroups: 0, removedPhotos: 0 })
    expect(removePhotos).not.toHaveBeenCalled()
  })
})
