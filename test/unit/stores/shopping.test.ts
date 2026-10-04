// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { useShoppingStore } from '../../../app/stores/shopping'

/**
 * Régression : les modales « Ajouter à une liste de courses » attendent
 * `ensureLoaded()` ; s'il rendait la main alors qu'un chargement était en
 * cours, elles affichaient « aucune liste / Créer la liste » à tort.
 */

const auth = vi.hoisted(() => ({ currentUser: { id: 'user-1' } as { id: string } | null }))
vi.mock('../../../app/stores/auth', () => ({ useAuthStore: () => auth }))

const db = vi.hoisted(() => ({ calls: 0, release: [] as Array<() => void> }))

const LIST = { id: 'list-1', name: 'Courses', user_id: 'user-1', created_at: '2026-01-01', updated_at: '2026-01-01', items: [] }

function query() {
  const builder = {
    select: () => builder,
    order: () => builder,
    then: (resolve: (value: { data: unknown[], error: null }) => unknown) => {
      db.calls++
      // Réponse retenue jusqu'à `release` : simule une requête lente.
      return new Promise<void>(done => db.release.push(done))
        .then(() => resolve({ data: [LIST], error: null }))
    }
  }
  return builder
}

mockNuxtImport('useSupabaseClient', () => () => ({ from: query }))

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('shopping store : ensureLoaded', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    auth.currentUser = { id: 'user-1' }
    db.calls = 0
    db.release = []
  })

  it('attend un chargement déjà en cours au lieu de rendre la main', async () => {
    const store = useShoppingStore()
    const first = store.refreshShoppingLists()
    await flush()
    expect(store.isLoading).toBe(true)

    let settled = false
    const second = store.ensureLoaded().then(() => { settled = true })
    await flush()
    expect(settled).toBe(false)

    db.release.forEach(release => release())
    await Promise.all([first, second])
    expect(settled).toBe(true)
    expect(store.shoppingLists.map(list => list.id)).toEqual(['list-1'])
    expect(db.calls).toBe(1)
  })

  it('ne se bloque pas sur un isLoading=true hydraté depuis le payload SSR', async () => {
    const store = useShoppingStore()
    store.$patch({ isLoading: true, shoppingLists: [] })
    const pending = store.ensureLoaded()
    await flush()
    db.release.forEach(release => release())
    await pending
    expect(db.calls).toBe(1)
    expect(store.shoppingLists).toHaveLength(1)
  })
})
