import { computed, watch } from 'vue'
import type { ShoppingList } from '#shared/types'
import { formatQuantity } from '#shared/utils/shopping'

/**
 * Courses hors ligne (PWA).
 *
 * À chaque chargement réussi des listes (`useShoppingStore().shoppingLists`,
 * observé sans modifier le store), une copie minimale est gardée dans
 * `localStorage` ; hors ligne, `useOfflineShopping()` l'expose en LECTURE
 * SEULE (affichée par `<ShoppingOfflineCopy />` sur la page des courses).
 *
 * - `startOfflineShopping()` : écouteurs `online` / `offline` + sauvegarde,
 *   installés une seule fois par le plugin `pwa-offline.client.ts`.
 * - Déconnexion : la copie est effacée (avec le cache des pages du service
 *   worker, voir le plugin).
 */

export const OFFLINE_SHOPPING_KEY = 'offline:shopping:v1'

export interface OfflineShoppingItem {
  id: string
  name: string
  amount: string | number | null
  amountNum: number | null
  unit: string | null
  checked: boolean
}

export interface OfflineShoppingList {
  id: string
  name: string
  items: OfflineShoppingItem[]
}

export interface OfflineShoppingSnapshot {
  version: 1
  userId: string
  /** Date ISO de la sauvegarde. */
  savedAt: string
  lists: OfflineShoppingList[]
}

/** Stockage minimal (interface de `localStorage`), injectable dans les tests. */
export type SnapshotStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Copie minimale des listes (pas de dates ni d'identifiants de recette). */
export function toOfflineSnapshot(userId: string, lists: readonly ShoppingList[], now = new Date()): OfflineShoppingSnapshot {
  return {
    version: 1,
    userId,
    savedAt: now.toISOString(),
    lists: lists.map(list => ({
      id: list.id,
      name: list.name,
      items: list.items.map(item => ({
        id: item.id,
        name: item.name,
        amount: item.amount,
        amountNum: item.amountNum,
        unit: item.unit,
        checked: item.checked
      }))
    }))
  }
}

function isSnapshot(value: unknown): value is OfflineShoppingSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<OfflineShoppingSnapshot>
  return candidate.version === 1
    && typeof candidate.userId === 'string'
    && typeof candidate.savedAt === 'string'
    && Array.isArray(candidate.lists)
    && candidate.lists.every(list => typeof list?.name === 'string' && Array.isArray(list.items))
}

/** Lit la copie ; `null` si absente, illisible ou stockage indisponible. */
export function readOfflineSnapshot(storage: SnapshotStorage | null | undefined): OfflineShoppingSnapshot | null {
  try {
    const raw = storage?.getItem(OFFLINE_SHOPPING_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Écrit la copie ; `false` si le stockage est indisponible (navigation privée, quota). */
export function writeOfflineSnapshot(storage: SnapshotStorage | null | undefined, snapshot: OfflineShoppingSnapshot): boolean {
  try {
    if (!storage) return false
    storage.setItem(OFFLINE_SHOPPING_KEY, JSON.stringify(snapshot))
    return true
  } catch {
    return false
  }
}

export function clearOfflineSnapshot(storage: SnapshotStorage | null | undefined): void {
  try {
    storage?.removeItem(OFFLINE_SHOPPING_KEY)
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}

/** « 200 g », « 1 ½ pot »… (unité saisie, le référentiel `units` n'étant pas chargé hors ligne). */
export function offlineQuantity(item: OfflineShoppingItem): string {
  return formatQuantity(item, item.unit)
}

function browserStorage(): SnapshotStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** État partagé (SSR : en ligne, aucune copie). */
function useOfflineState() {
  const isOnline = useState<boolean>('pwa:online', () => true)
  const snapshot = useState<OfflineShoppingSnapshot | null>('pwa:shopping-snapshot', () => null)
  return { isOnline, snapshot }
}

/**
 * Installe la synchronisation (client uniquement, une fois : plugin
 * `pwa-offline.client.ts`). Renvoie une fonction d'arrêt.
 */
export function startOfflineShopping(): () => void {
  const { isOnline, snapshot } = useOfflineState()
  const shoppingStore = useShoppingStore()
  const authStore = useAuthStore()
  const storage = browserStorage()

  snapshot.value = readOfflineSnapshot(storage)
  isOnline.value = navigator.onLine

  const onOnline = () => { isOnline.value = true }
  const onOffline = () => { isOnline.value = false }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)

  // Sauvegarde après chaque chargement réussi (réaffectation du tableau par
  // le store) et chaque bascule locale d'un article (watch profond).
  // Premier passage (`immediate`) : listes rendues côté serveur et hydratées
  // (page des courses) ; un tableau vide signifie alors « pas encore
  // chargé » sur les autres pages : il n'écrase pas la copie existante.
  let initial = true
  const stopLists = watch(
    () => shoppingStore.shoppingLists,
    (lists) => {
      const first = initial
      initial = false
      const userId = authStore.currentUser?.id
      if (!isOnline.value || !userId || shoppingStore.isLoading || shoppingStore.error) return
      if (first && lists.length === 0) return
      const next = toOfflineSnapshot(userId, lists)
      if (writeOfflineSnapshot(storage, next)) snapshot.value = next
    },
    { deep: true, immediate: true }
  )

  // Déconnexion (identifiant → null) : la copie ne doit pas survivre.
  const stopAuth = watch(
    () => authStore.currentUser?.id ?? null,
    (userId, previous) => {
      if (previous && !userId) {
        clearOfflineSnapshot(storage)
        snapshot.value = null
      }
    }
  )

  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    stopLists()
    stopAuth()
  }
}

/**
 * État hors ligne et dernière copie des courses (lecture seule).
 * La copie n'est exposée que si elle appartient à l'utilisateur courant
 * (ou si l'identité est inconnue hors ligne : la copie est effacée à la
 * déconnexion, elle ne peut donc venir que de cet appareil et de ce compte).
 */
export function useOfflineShopping() {
  const { isOnline, snapshot } = useOfflineState()
  const authStore = useAuthStore()

  const ownSnapshot = computed<OfflineShoppingSnapshot | null>(() => {
    const current = snapshot.value
    const userId = authStore.currentUser?.id
    if (!current || (userId && userId !== current.userId)) return null
    return current
  })

  return {
    isOnline: computed(() => isOnline.value),
    isOffline: computed(() => !isOnline.value),
    /** Listes de la dernière sauvegarde (vide si aucune). */
    lists: computed<OfflineShoppingList[]>(() => ownSnapshot.value?.lists ?? []),
    hasSnapshot: computed(() => ownSnapshot.value !== null),
    savedAt: computed<Date | null>(() => (ownSnapshot.value ? new Date(ownSnapshot.value.savedAt) : null)),
    quantityOf: offlineQuantity
  }
}
