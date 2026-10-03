import { describe, expect, it } from 'vitest'
import type { ShoppingList } from '#shared/types'
import {
  OFFLINE_SHOPPING_KEY,
  clearOfflineSnapshot,
  offlineQuantity,
  readOfflineSnapshot,
  toOfflineSnapshot,
  writeOfflineSnapshot,
  type SnapshotStorage
} from '~/composables/useOfflineShopping'

function memoryStorage(initial: Record<string, string> = {}): SnapshotStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) }
  }
}

const throwingStorage: SnapshotStorage = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('QuotaExceededError') },
  removeItem: () => { throw new Error('SecurityError') }
}

const lists: ShoppingList[] = [{
  id: 'l1',
  name: 'Carrefour',
  userId: 'u1',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: null,
  items: [
    { id: 'i1', listId: 'l1', name: 'Farine', amount: '200', amountNum: 200, unit: 'g', unitCode: 'g', checked: false, recipeId: 'r1', createdAt: null, updatedAt: null },
    { id: 'i2', listId: 'l1', name: 'Sel', amount: null, amountNum: null, unit: null, unitCode: null, checked: true, recipeId: null, createdAt: null, updatedAt: null }
  ]
}]

describe('useOfflineShopping : copie hors ligne', () => {
  it('ne garde que le nécessaire à l\'affichage', () => {
    const snapshot = toOfflineSnapshot('u1', lists, new Date('2026-10-03T12:00:00Z'))
    expect(snapshot).toEqual({
      version: 1,
      userId: 'u1',
      savedAt: '2026-10-03T12:00:00.000Z',
      lists: [{
        id: 'l1',
        name: 'Carrefour',
        items: [
          { id: 'i1', name: 'Farine', amount: '200', amountNum: 200, unit: 'g', checked: false },
          { id: 'i2', name: 'Sel', amount: null, amountNum: null, unit: null, checked: true }
        ]
      }]
    })
  })

  it('écrit, relit puis efface la copie', () => {
    const storage = memoryStorage()
    const snapshot = toOfflineSnapshot('u1', lists)
    expect(writeOfflineSnapshot(storage, snapshot)).toBe(true)
    expect(readOfflineSnapshot(storage)).toEqual(snapshot)
    clearOfflineSnapshot(storage)
    expect(storage.data.has(OFFLINE_SHOPPING_KEY)).toBe(false)
    expect(readOfflineSnapshot(storage)).toBeNull()
  })

  it('ignore une copie illisible ou d\'un autre format', () => {
    expect(readOfflineSnapshot(memoryStorage({ [OFFLINE_SHOPPING_KEY]: '{oops' }))).toBeNull()
    expect(readOfflineSnapshot(memoryStorage({ [OFFLINE_SHOPPING_KEY]: JSON.stringify({ version: 2, lists: [] }) }))).toBeNull()
    expect(readOfflineSnapshot(memoryStorage({ [OFFLINE_SHOPPING_KEY]: JSON.stringify({ version: 1, userId: 'u1', savedAt: 'x', lists: [{ name: 1 }] }) }))).toBeNull()
  })

  it('survit à un stockage indisponible (navigation privée, quota)', () => {
    expect(readOfflineSnapshot(throwingStorage)).toBeNull()
    expect(writeOfflineSnapshot(throwingStorage, toOfflineSnapshot('u1', lists))).toBe(false)
    expect(() => clearOfflineSnapshot(throwingStorage)).not.toThrow()
    expect(readOfflineSnapshot(null)).toBeNull()
    expect(writeOfflineSnapshot(undefined, toOfflineSnapshot('u1', lists))).toBe(false)
  })

  it('formate la quantité avec l\'unité saisie', () => {
    const [farine, sel] = toOfflineSnapshot('u1', lists).lists[0]!.items
    expect(offlineQuantity(farine!)).toBe('200 g')
    expect(offlineQuantity(sel!)).toBe('')
  })
})
