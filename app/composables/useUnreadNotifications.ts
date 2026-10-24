/**
 * Compteur de notifications non lues, partagé entre la cloche et la page `/notifications` (un seul état :
 * marquer comme lu met la cloche à jour tout de suite). Relu par `refresh()` ; pas de temps réel (6C).
 */
export function useUnreadNotifications() {
  const count = useState<number>('notifications-unread', () => 0)
  const { unreadNotificationsCount } = useNotifications()

  async function refresh(): Promise<void> {
    try {
      count.value = await unreadNotificationsCount()
    } catch {
      // Compteur indisponible (hors ligne, base v1) : on garde la dernière valeur.
    }
  }

  return { count, refresh }
}
