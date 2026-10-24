import type { Friend, GroupMember, MyGroup } from '#shared/utils/social'

/**
 * Destinataires possibles d'un partage (v2) : mes amis et les membres de mes groupes (dédoublonnés), jamais moi ni l'auteur.
 * Les règles (ami ou groupe commun, plafond) sont vérifiées par la base ; ceci ne fait que préparer le choix.
 */

export interface RecipientPerson {
  userId: string
  displayName: string
  /** D'où je connais cette personne : ami et / ou noms de groupes. */
  isFriend: boolean
  groupNames: string[]
}

export interface GroupWithMembers {
  group: Pick<MyGroup, 'groupId' | 'name'>
  members: Array<Pick<GroupMember, 'userId' | 'displayName'>>
}

export function mergeRecipients(
  friends: Array<Pick<Friend, 'userId' | 'displayName'>>,
  groups: GroupWithMembers[],
  options: { selfId?: string | null, excludeUserIds?: readonly string[] } = {}
): RecipientPerson[] {
  const excluded = new Set([options.selfId ?? '', ...(options.excludeUserIds ?? [])].filter(Boolean))
  const byId = new Map<string, RecipientPerson>()
  const entry = (userId: string, displayName: string | null): RecipientPerson | null => {
    if (excluded.has(userId)) return null
    let person = byId.get(userId)
    if (!person) {
      person = { userId, displayName: displayName?.trim() || '', isFriend: false, groupNames: [] }
      byId.set(userId, person)
    } else if (!person.displayName && displayName?.trim()) {
      person.displayName = displayName.trim()
    }
    return person
  }
  for (const friend of friends) {
    const person = entry(friend.userId, friend.displayName)
    if (person) person.isFriend = true
  }
  for (const { group, members } of groups) {
    for (const member of members) {
      const person = entry(member.userId, member.displayName)
      if (person && !person.groupNames.includes(group.name)) person.groupNames.push(group.name)
    }
  }
  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' }))
}

/** Filtre local d'une liste de destinataires par nom (sans accents ni casse). */
export function filterRecipients<T extends { displayName: string }>(items: readonly T[], term: string): T[] {
  const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const needle = fold(term.trim())
  return needle ? items.filter(item => fold(item.displayName).includes(needle)) : [...items]
}
