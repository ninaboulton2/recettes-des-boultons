import { onServerPrefetch, watch } from 'vue'

/**
 * Garantit que les favoris de l'utilisateur connecté sont chargés pour le
 * composant appelant (bouton favori de la fiche, cœurs des cartes).
 *
 * - Côté serveur : `onServerPrefetch` ATTEND le chargement avant le rendu ; le
 *   payload contient donc des favoris complets (`loadedForUserId` renseigné),
 *   jamais un chargement à moitié fait.
 * - Côté client : rechargement si l'utilisateur change (ou si le serveur n'a
 *   pas pu charger), dédupliqué par le store.
 */
export function useFavoritesLoader(): void {
  const authStore = useAuthStore()
  const favoritesStore = useFavoritesStore()

  onServerPrefetch(() => favoritesStore.ensureLoaded())

  if (import.meta.client) {
    watch(() => authStore.currentUser?.id ?? null, () => {
      void favoritesStore.ensureLoaded()
    }, { immediate: true })
  }
}
