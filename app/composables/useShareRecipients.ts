import { mergeRecipients, type RecipientPerson } from '#shared/utils/recipients'
import type { MyGroup } from '#shared/utils/social'

/**
 * Destinataires d'un partage (v2) : mes amis (`list_friends`), mes groupes (`list_my_groups`) et leurs membres
 * (`list_group_members`). Chargés à l'ouverture de la fenêtre de partage ; la recherche par nom (`search_users`) complète.
 * Un échec de chargement d'un groupe ne vide pas le reste.
 */
export function useShareRecipients() {
  const friendsApi = useFriends()
  const groupsApi = useGroups()
  const authStore = useAuthStore()

  const people = ref<RecipientPerson[]>([])
  const groups = ref<MyGroup[]>([])
  const loading = ref(false)

  async function load(excludeUserIds: readonly string[] = []): Promise<void> {
    loading.value = true
    try {
      const [friends, myGroups] = await Promise.all([
        friendsApi.listFriends().catch(() => []),
        groupsApi.listMyGroups().catch(() => [] as MyGroup[])
      ])
      groups.value = myGroups
      const withMembers = await Promise.all(myGroups.map(async group => ({
        group,
        members: await groupsApi.listGroupMembers({ groupId: group.groupId }).catch(() => [])
      })))
      people.value = mergeRecipients(friends, withMembers, { selfId: authStore.currentUser?.id, excludeUserIds })
    } finally {
      loading.value = false
    }
  }

  return { people, groups, loading, load, searchUsers: friendsApi.searchUsers }
}
