import type { FriendshipStatus, GroupRole, NotificationType } from '#shared/schemas/social'
import { friendshipStatusSchema, notificationTypeSchema } from '#shared/schemas/social'

/**
 * Lignes des RPC de la migration 0023 (snake_case) → objets d'application (camelCase).
 * Jamais d'e-mail : les seules informations sur les autres personnes sont leur identifiant et leur pseudonyme.
 */

/** SQLSTATE d'une limite de débit (20 demandes d'ami / 20 invitations / 10 signalements / 3 exports par jour). */
export const RATE_LIMIT_SQLSTATE = '54000'
/** SQLSTATE d'une suppression de compte bloquée par un groupe à transférer. */
export const ACCOUNT_BLOCKED_SQLSTATE = '55000'

/** Code (`data.code` d'une 401) d'une action irréversible qui exige une connexion de moins de 10 minutes : l'interface redemande le mot de passe. */
export const REAUTH_REQUIRED_CODE = 'REAUTH_REQUIRED'
/** SQLSTATE d'un plafond de volume (2000 recettes, 20 groupes, 5000 bannières fermées). */
export const QUOTA_SQLSTATE = '53400'

export function isQuotaError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === QUOTA_SQLSTATE
}

export function isRateLimitError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === RATE_LIMIT_SQLSTATE
}

export interface FriendRow {
  friendship_id: string
  user_id: string
  display_name: string | null
  cookbook_title: string | null
  since: string | null
}
export interface Friend {
  friendshipId: string
  userId: string
  displayName: string | null
  cookbookTitle: string | null
  since: string | null
}
export const toFriend = (row: FriendRow): Friend => ({
  friendshipId: row.friendship_id,
  userId: row.user_id,
  displayName: row.display_name ?? null,
  cookbookTitle: row.cookbook_title ?? null,
  since: row.since ?? null
})

export interface FriendRequestRow {
  friendship_id: string
  direction: string
  user_id: string
  display_name: string | null
  status: string
  created_at: string
  retry_after: string | null
}
/** `incoming` : reçue (en attente) ; `outgoing` : envoyée (en attente ou refusée, `retryAfter` = date de relance possible). */
export interface FriendRequest {
  friendshipId: string
  direction: 'incoming' | 'outgoing'
  userId: string
  displayName: string | null
  status: 'pending' | 'declined'
  createdAt: string
  retryAfter: string | null
}
export const toFriendRequest = (row: FriendRequestRow): FriendRequest => ({
  friendshipId: row.friendship_id,
  direction: row.direction === 'incoming' ? 'incoming' : 'outgoing',
  userId: row.user_id,
  displayName: row.display_name ?? null,
  status: row.status === 'declined' ? 'declined' : 'pending',
  createdAt: row.created_at,
  retryAfter: row.retry_after ?? null
})

export interface MyGroupRow {
  group_id: string
  name: string
  theme: unknown
  role: string
  creator_name: string | null
  member_count: number
  joined_at: string
  created_at: string
}
export interface MyGroup {
  groupId: string
  name: string
  theme: Record<string, unknown>
  role: GroupRole
  isCreator: boolean
  creatorName: string | null
  memberCount: number
  joinedAt: string
  createdAt: string
}
export const toMyGroup = (row: MyGroupRow): MyGroup => ({
  groupId: row.group_id,
  name: row.name,
  theme: row.theme && typeof row.theme === 'object' && !Array.isArray(row.theme) ? row.theme as Record<string, unknown> : {},
  role: row.role === 'creator' ? 'creator' : 'member',
  isCreator: row.role === 'creator',
  creatorName: row.creator_name ?? null,
  memberCount: row.member_count,
  joinedAt: row.joined_at,
  createdAt: row.created_at
})

export interface GroupMemberRow {
  user_id: string
  display_name: string | null
  role: string
  joined_at: string
}
export interface GroupMember {
  userId: string
  displayName: string | null
  role: GroupRole
  joinedAt: string
}
export const toGroupMember = (row: GroupMemberRow): GroupMember => ({
  userId: row.user_id,
  displayName: row.display_name ?? null,
  role: row.role === 'creator' ? 'creator' : 'member',
  joinedAt: row.joined_at
})

export interface GroupInvitationRow {
  invitation_id: string
  direction: string
  group_id: string
  group_name: string
  user_id: string | null
  display_name: string | null
  channel: string
  created_at: string
  expires_at: string
}
/** `received` : adressée à moi (`userId` = qui m'invite) ; `sent` : émise par moi, créateur (`userId` = la personne, `null` pour un lien). */
export interface GroupInvitation {
  invitationId: string
  direction: 'received' | 'sent'
  groupId: string
  groupName: string
  userId: string | null
  displayName: string | null
  channel: 'user' | 'email' | 'link'
  createdAt: string
  expiresAt: string
}
export const toGroupInvitation = (row: GroupInvitationRow): GroupInvitation => ({
  invitationId: row.invitation_id,
  direction: row.direction === 'received' ? 'received' : 'sent',
  groupId: row.group_id,
  groupName: row.group_name,
  userId: row.user_id ?? null,
  displayName: row.display_name ?? null,
  channel: row.channel === 'email' ? 'email' : row.channel === 'link' ? 'link' : 'user',
  createdAt: row.created_at,
  expiresAt: row.expires_at
})

export interface InviteLinkRow {
  invitation_id: string
  token: string
  expires_at: string
}
/** Le jeton en clair n'est renvoyé qu'UNE fois, à la création : à copier tout de suite. */
export interface InviteLink {
  invitationId: string
  token: string
  expiresAt: string
}
export const toInviteLink = (row: InviteLinkRow): InviteLink => ({ invitationId: row.invitation_id, token: row.token, expiresAt: row.expires_at })

export interface NotificationRow {
  id: string
  type: string
  payload: unknown
  read_at: string | null
  created_at: string
}
/** Payload : identifiants, pseudonymes, titres. Lire les clés selon `type` (voir DEVELOPER.md § 20.8). */
export interface AppNotification {
  id: string
  type: NotificationType | string
  known: boolean
  payload: Record<string, unknown>
  read: boolean
  readAt: string | null
  createdAt: string
}
export const toNotification = (row: NotificationRow): AppNotification => ({
  id: row.id,
  type: row.type,
  known: notificationTypeSchema.safeParse(row.type).success,
  payload: row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload as Record<string, unknown> : {},
  read: row.read_at !== null && row.read_at !== undefined,
  readAt: row.read_at ?? null,
  createdAt: row.created_at
})

export interface UserProfileRow {
  user_id: string
  display_name: string | null
  cookbook_title: string | null
  is_self: boolean
  friendship_status: string
  friendship_id: string | null
  common_groups: unknown
  readable_recipe_count: number
}
export interface UserProfile {
  userId: string
  displayName: string | null
  cookbookTitle: string | null
  isSelf: boolean
  friendshipStatus: FriendshipStatus
  friendshipId: string | null
  commonGroups: Array<{ id: string, name: string }>
  readableRecipeCount: number
}
export function toUserProfile(row: UserProfileRow): UserProfile {
  const groups = Array.isArray(row.common_groups) ? row.common_groups : []
  const status = friendshipStatusSchema.safeParse(row.friendship_status)
  return {
    userId: row.user_id,
    displayName: row.display_name ?? null,
    cookbookTitle: row.cookbook_title ?? null,
    isSelf: row.is_self === true,
    friendshipStatus: status.success ? status.data : 'none',
    friendshipId: row.friendship_id ?? null,
    commonGroups: groups
      .filter((g): g is { id: string, name: string } => typeof g === 'object' && g !== null && typeof (g as { id?: unknown }).id === 'string')
      .map(g => ({ id: g.id, name: String(g.name ?? '') })),
    readableRecipeCount: row.readable_recipe_count ?? 0
  }
}

export interface DeletionBlockerRow {
  group_id: string
  group_name: string
  other_member_count: number
}
/** Groupe que je crée et qui a d'autres membres : à transférer (ou supprimer) avant de supprimer le compte. */
export interface DeletionBlocker {
  groupId: string
  groupName: string
  otherMemberCount: number
}
export const toDeletionBlocker = (row: DeletionBlockerRow): DeletionBlocker => ({
  groupId: row.group_id,
  groupName: row.group_name,
  otherMemberCount: row.other_member_count
})

export interface ProfileSettingsRow {
  display_name: string | null
  cookbook_title: string | null
  discoverable: boolean
  theme_settings: unknown
  active_theme_group_id: string | null
}
export interface ProfileSettings {
  displayName: string | null
  cookbookTitle: string | null
  discoverable: boolean
  themeSettings: Record<string, unknown> | null
  activeThemeGroupId: string | null
}
export const toProfileSettings = (row: ProfileSettingsRow): ProfileSettings => ({
  displayName: row.display_name ?? null,
  cookbookTitle: row.cookbook_title ?? null,
  discoverable: row.discoverable !== false,
  themeSettings: row.theme_settings && typeof row.theme_settings === 'object' && !Array.isArray(row.theme_settings)
    ? row.theme_settings as Record<string, unknown>
    : null,
  activeThemeGroupId: row.active_theme_group_id ?? null
})
