// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { useFavoritesStore } from '../../../app/stores/favorites'

/**
 * Régression : l'état Pinia est sérialisé dans le payload SSR. Un
 * `isLoading: true` hydraté (chargement lancé mais pas attendu côté serveur)
 * ne doit pas empêcher le client de charger les favoris.
 */

const USER_ID = 'user-1'
const RECIPE_ID = 'recipe-1'

const auth = vi.hoisted(() => ({ currentUser: { id: 'user-1' } as { id: string } | null }))
vi.mock('../../../app/stores/auth', () => ({ useAuthStore: () => auth }))

const calls = vi.hoisted(() => ({ favorites: 0 }))

function query(table: string) {
  const rows = table === 'favorites'
    ? [{ id: 'fav-1', recipe_id: 'recipe-1', user_id: 'user-1', created_at: '2026-01-01', updated_at: '2026-01-01' }]
    : []
  const builder = {
    select: () => builder,
    order: () => builder,
    in: () => builder,
    then: (resolve: (value: { data: unknown[], error: null }) => unknown) => {
      if (table === 'favorites') calls.favorites++
      return Promise.resolve({ data: rows, error: null }).then(resolve)
    }
  }
  return builder
}

mockNuxtImport('useSupabaseClient', () => () => ({ from: query }))

describe('favorites store : ensureLoaded', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    auth.currentUser = { id: USER_ID }
    calls.favorites = 0
  })

  it('charge malgré un isLoading=true hydraté depuis le payload SSR', async () => {
    const store = useFavoritesStore()
    store.$patch({ isLoading: true, favorites: [], loadedForUserId: null })

    await store.ensureLoaded()

    expect(calls.favorites).toBe(1)
    expect(store.isFavorite(RECIPE_ID)).toBe(true)
    expect(store.loadedForUserId).toBe(USER_ID)
    expect(store.isLoading).toBe(false)
  })

  it('déduplique les appels concurrents et ne recharge pas pour le même utilisateur', async () => {
    const store = useFavoritesStore()
    await Promise.all([store.ensureLoaded(), store.ensureLoaded(), store.ensureLoaded()])
    await store.ensureLoaded()
    expect(calls.favorites).toBe(1)
  })

  it('recharge quand l\'utilisateur change', async () => {
    const store = useFavoritesStore()
    await store.ensureLoaded()
    auth.currentUser = { id: 'user-2' }
    await store.ensureLoaded()
    expect(calls.favorites).toBe(2)
    expect(store.loadedForUserId).toBe('user-2')
  })
})
