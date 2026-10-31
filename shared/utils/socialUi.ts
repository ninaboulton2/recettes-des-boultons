import type { AppNotification, FriendRequest, MyGroup } from '#shared/utils/social'
import type { FriendshipStatus } from '#shared/schemas/social'

/**
 * Logique d'interface de la phase 6C (amis, groupes, notifications), pure et testable sans Nuxt :
 * messages d'erreur selon le SQLSTATE, texte et lien de chaque notification, actions permises selon le rôle.
 * Ce sont des règles d'AFFICHAGE : les droits sont décidés en base (42501 / P0002), qui reste le dernier mot.
 */

// ---------------------------------------------------------------- erreurs

export interface SocialErrorMessage {
  /** Clé i18n (`errors.social.*`). */
  key: string
  params?: Record<string, number>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value)

/**
 * Message d'erreur d'une action sociale. Le texte technique de la base n'est JAMAIS affiché tel quel (il est en français
 * seulement) : on reconnaît le SQLSTATE puis, pour les refus de fond (22023), la situation par quelques mots-clés de 0023.
 */
export function socialErrorMessage(error: unknown): SocialErrorMessage {
  const e = typeof error === 'object' && error !== null ? error as { code?: unknown, message?: unknown } : {}
  const code = typeof e.code === 'string' ? e.code : undefined
  const message = typeof e.message === 'string' ? e.message : ''
  switch (code) {
    case '54000': return { key: 'errors.social.rate' }
    case '53400': return { key: 'errors.social.quota' }
    case '42501': return /boultons/i.test(message) ? { key: 'profile.errors.boultonsReserved' } : { key: 'errors.social.forbidden' }
    case 'P0002':
      return /lien d'invitation/i.test(message) ? { key: 'errors.social.invalidLink' } : { key: 'errors.social.notFound' }
    case '55000': return { key: 'errors.social.conflict' }
    case '22023': {
      const days = /dans (\d+) jour/i.exec(message)
      if (days) return { key: 'errors.social.retryLater', params: { n: Number(days[1]) } }
      if (/répondez-y/i.test(message)) return { key: 'errors.social.reverseRequest' }
      if (/refusé l'invitation récemment/i.test(message)) return { key: 'errors.social.inviteDeclined' }
      if (/déjà dans le groupe/i.test(message)) return { key: 'errors.social.alreadyMember' }
      if (/ne peut pas quitter|transférez le rôle/i.test(message)) return { key: 'errors.social.creatorCannotLeave' }
      if (/propre lien/i.test(message)) return { key: 'errors.social.ownLink' }
      if (/déjà traitée|expirée/i.test(message)) return { key: 'errors.social.invitationGone' }
      if (/vous-même/i.test(message)) return { key: 'errors.social.self' }
      return { key: 'errors.social.invalid' }
    }
    default:
      return { key: 'errors.generic' }
  }
}

/** Même chose pour un lien d'invitation : toute erreur de fond donne un message NEUTRE (rien sur l'existence du groupe). */
export function inviteLinkErrorMessage(error: unknown): SocialErrorMessage {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  if (code === '54000') return { key: 'errors.social.rate' }
  if (code === '42501' || code === undefined) return { key: 'errors.generic' }
  if (code === '22023' && /propre lien/i.test(String((error as { message?: unknown }).message ?? ''))) return { key: 'errors.social.ownLink' }
  return { key: 'errors.social.invalidLink' }
}

// ---------------------------------------------------------------- notifications

export interface NotificationView {
  /** Clé i18n du texte (`notifications.types.<type>`). */
  key: string
  params: Record<string, string>
  icon: string
  /** Chemin sans langue (à passer à `localePath`), ou `null` s'il n'y a rien à ouvrir. */
  to: string | null
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

/**
 * Texte, icône et lien d'une notification. Un genre inconnu (base plus récente que l'interface) renvoie `null` :
 * la liste le masque plutôt que d'afficher du texte technique. Un identifiant mal formé supprime le lien (jamais de chemin
 * construit avec une valeur non vérifiée). Le texte vient de l'interface, jamais du payload, sauf les noms et titres.
 * `titles` : titres traduits des recettes (par identifiant) pour la langue de l'interface, repli sur le titre du payload.
 */
export function notificationView(notification: Pick<AppNotification, 'type' | 'payload'>, titles: Readonly<Record<string, string>> = {}): NotificationView | null {
  const p = notification.payload
  const name = (key: string, fallback = '') => text(p[key]) ?? fallback
  const id = (key: string): string | null => (isUuid(p[key]) ? p[key] as string : null)
  const key = `notifications.types.${notification.type}`
  switch (notification.type) {
    case 'friend_request':
      return { key, params: { name: name('from_name') }, icon: 'i-lucide-user-plus', to: '/amis' }
    case 'friend_accepted':
      return { key, params: { name: name('name') }, icon: 'i-lucide-user-check', to: id('user_id') ? `/personnes/${id('user_id')}` : '/amis' }
    case 'group_invitation':
      return { key, params: { name: name('from_name'), group: name('group_name') }, icon: 'i-lucide-mail-plus', to: '/groupes' }
    case 'group_invitation_accepted':
      return { key, params: { name: name('name'), group: name('group_name') }, icon: 'i-lucide-user-round-check', to: id('group_id') ? `/groupes/${id('group_id')}` : '/groupes' }
    case 'recipe_shared':
      // Titre dans la langue de l'interface si on l'a (le payload garde le titre d'origine, figé à l'envoi).
      return { key, params: { name: name('from_name'), title: titles[id('recipe_id') ?? ''] ?? name('title') }, icon: 'i-lucide-share-2', to: id('recipe_id') ? `/recettes/${id('recipe_id')}` : null }
    case 'recipe_deleted':
      return { key, params: { name: name('author_name'), title: name('title') }, icon: 'i-lucide-trash-2', to: null }
    case 'group_member_removed':
      return { key, params: { group: name('group_name') }, icon: 'i-lucide-user-round-x', to: '/groupes' }
    case 'group_deleted':
      return { key, params: { group: name('group_name') }, icon: 'i-lucide-users-round', to: '/groupes' }
    case 'group_ownership_transferred':
      return { key, params: { name: name('from_name'), group: name('group_name') }, icon: 'i-lucide-crown', to: id('group_id') ? `/groupes/${id('group_id')}` : '/groupes' }
    default:
      return null
  }
}

/** Identifiants des notifications non lues d'une liste (marquage à l'ouverture de la page). */
export const unreadIds = (items: ReadonlyArray<Pick<AppNotification, 'id' | 'read'>>): string[] =>
  items.filter(item => !item.read).map(item => item.id)

// ---------------------------------------------------------------- amis

export type ProfileFriendAction = 'none' | 'send' | 'resend' | 'cancel' | 'respond' | 'remove'

/** Quelle action proposer sur le profil d'une personne selon le statut d'amitié (soi-même : aucune). */
export function profileFriendAction(status: FriendshipStatus, isSelf: boolean): ProfileFriendAction {
  if (isSelf) return 'none'
  switch (status) {
    case 'friends': return 'remove'
    case 'request_sent': return 'cancel'
    case 'request_received': return 'respond'
    case 'request_declined': return 'resend'
    default: return 'send'
  }
}

/** Une demande refusée peut être relancée à partir de `retryAfter` (7 jours après la dernière demande). */
export function canRetryRequest(request: Pick<FriendRequest, 'status' | 'retryAfter'>, now: Date = new Date()): boolean {
  if (request.status !== 'declined') return false
  if (!request.retryAfter) return true
  return new Date(request.retryAfter).getTime() <= now.getTime()
}

// ---------------------------------------------------------------- groupes

export interface GroupMemberLike { userId: string, role: 'creator' | 'member' }

export interface GroupRights {
  canRename: boolean
  canEditTheme: boolean
  canInvite: boolean
  canCreateLink: boolean
  canCancelInvitations: boolean
  canDelete: boolean
  canLeave: boolean
}

/** Actions de groupe selon MON rôle : le créateur gère tout (et ne part pas), un membre peut seulement partir. */
export function groupRights(group: Pick<MyGroup, 'isCreator'> | null): GroupRights {
  const creator = group?.isCreator === true
  return {
    canRename: creator,
    canEditTheme: creator,
    canInvite: creator,
    canCreateLink: creator,
    canCancelInvitations: creator,
    canDelete: creator,
    canLeave: group !== null && !creator
  }
}

/** Actions sur une AUTRE personne du groupe : réservées au créateur, jamais sur soi-même ni sur le créateur. */
export function memberRights(meIsCreator: boolean, meId: string | null, member: GroupMemberLike): { canRemove: boolean, canTransfer: boolean } {
  const other = member.userId !== meId && member.role !== 'creator'
  return { canRemove: meIsCreator && other, canTransfer: meIsCreator && other }
}

/** Ma prochaine page après avoir quitté / supprimé / refusé : toujours la liste. */
export const GROUPS_HOME = '/groupes'

/** Chemin d'un lien d'invitation (le jeton fait 64 caractères hexadécimaux). */
export function inviteLinkPath(token: string): string {
  return `/rejoindre/${token}`
}

/** Nombre de jours de validité d'un lien (0023 n° 9) : affiché dans l'interface, pas calculé. */
export const INVITE_LINK_VALID_DAYS = 7

/** Recherche de personnes : au moins 3 lettres (comme la base), espaces de bord ignorés. */
export const USER_SEARCH_MIN = 3
export const canSearchUsers = (query: string): boolean => query.trim().length >= USER_SEARCH_MIN
