import { z } from 'zod'
import { optionalText, uuidSchema } from './common'

/**
 * Social v2 (migration 0023) : amis, groupes, invitations, notifications, profil, compte. Valident ce que le client
 * envoie aux RPC (`send_friend_request`, `create_group`, `update_my_profile`…) ; les droits, les limites de débit
 * (SQLSTATE 54000) et les règles de fond (créateur seulement, délai de relance…) sont appliqués en base.
 */

// ---------------------------------------------------------------- amis
/** `search_users(p_query)` (0019) : au moins 3 lettres, comme la base. */
export const searchUsersInputSchema = z.object({
  query: z.string({ required_error: 'requis' }).trim().min(3, 'au moins 3 lettres').max(60, 'trop long (max 60 caractères)')
})

/** `send_friend_request(p_user)` */
export const sendFriendRequestInputSchema = z.object({ userId: uuidSchema })

/** `respond_friend_request(p_id, p_accept)` */
export const respondFriendRequestInputSchema = z.object({
  friendshipId: uuidSchema,
  accept: z.boolean({ required_error: 'requis', invalid_type_error: 'doit être vrai ou faux' })
})

/** `cancel_friend_request(p_id)` */
export const cancelFriendRequestInputSchema = z.object({ friendshipId: uuidSchema })

/** `remove_friend(p_user)` */
export const removeFriendInputSchema = z.object({ userId: uuidSchema })

/** `get_user_profile(p_user)` */
export const getUserProfileInputSchema = z.object({ userId: uuidSchema })

export const FRIENDSHIP_STATUSES = ['none', 'friends', 'request_sent', 'request_received', 'request_declined'] as const
export const friendshipStatusSchema = z.enum(FRIENDSHIP_STATUSES)
export type FriendshipStatus = z.infer<typeof friendshipStatusSchema>

// ---------------------------------------------------------------- groupes
const groupName = z.string({ required_error: 'requis', invalid_type_error: 'doit être du texte' })
  .trim().min(1, 'requis').max(60, 'trop long (max 60 caractères)')

/** Thème d'un groupe ou d'une personne : un OBJET JSON d'au plus 4000 caractères (la forme précise est validée côté interface). */
export const MAX_THEME_LENGTH = 4000
export const themeObjectSchema = z.record(z.string(), z.unknown(), { invalid_type_error: 'doit être un objet' })
  .refine(value => JSON.stringify(value).length <= MAX_THEME_LENGTH, `trop volumineux (max ${MAX_THEME_LENGTH} caractères)`)

/** `create_group(p_name)` */
export const createGroupInputSchema = z.object({ name: groupName })

/** `rename_group(p_group, p_name)` */
export const renameGroupInputSchema = z.object({ groupId: uuidSchema, name: groupName })

/** `update_group_theme(p_group, p_theme)` */
export const updateGroupThemeInputSchema = z.object({ groupId: uuidSchema, theme: themeObjectSchema })

/** `leave_group`, `delete_group`, `list_group_members`, `create_invite_link` : un groupe. */
export const groupIdInputSchema = z.object({ groupId: uuidSchema })

/** `invite_to_group(p_group, p_user)` — créateur seulement. */
export const inviteToGroupInputSchema = z.object({ groupId: uuidSchema, userId: uuidSchema })

/** `respond_group_invitation(p_id, p_accept)` */
export const respondGroupInvitationInputSchema = z.object({
  invitationId: uuidSchema,
  accept: z.boolean({ required_error: 'requis', invalid_type_error: 'doit être vrai ou faux' })
})

/** `cancel_group_invitation(p_id)` — créateur seulement. */
export const cancelGroupInvitationInputSchema = z.object({ invitationId: uuidSchema })

/** `remove_group_member(p_group, p_user)` — créateur seulement. */
export const removeGroupMemberInputSchema = z.object({ groupId: uuidSchema, userId: uuidSchema })

/** `transfer_group_ownership(p_group, p_new_creator)` — le nouveau créateur doit déjà être membre. */
export const transferGroupOwnershipInputSchema = z.object({ groupId: uuidSchema, newCreatorId: uuidSchema })

/** `redeem_invite_link(p_token)` : jeton de 64 caractères hexadécimaux renvoyé par `create_invite_link`. */
export const redeemInviteLinkInputSchema = z.object({
  token: z.string({ required_error: 'requis' }).trim().regex(/^[0-9a-f]{64}$/i, 'lien d\'invitation invalide')
})

export const GROUP_ROLES = ['creator', 'member'] as const
export const groupRoleSchema = z.enum(GROUP_ROLES)
export type GroupRole = z.infer<typeof groupRoleSchema>

// ---------------------------------------------------------------- notifications
/** Genres de notification créés par la base (0023). Un genre inconnu reste affichable : l'interface l'ignore ou le masque. */
export const NOTIFICATION_TYPES = [
  'friend_request', 'friend_accepted', 'group_invitation', 'group_invitation_accepted', 'recipe_shared',
  'recipe_deleted', 'group_member_removed', 'group_deleted', 'group_ownership_transferred'
] as const
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES)
export type NotificationType = z.infer<typeof notificationTypeSchema>

export const NOTIFICATIONS_PAGE_SIZE = 30
export const NOTIFICATIONS_MAX_PAGE_SIZE = 100

/** `list_notifications(p_limit, p_before)` : `before` = `createdAt` de la dernière notification reçue. */
export const listNotificationsInputSchema = z.object({
  limit: z.coerce.number().int('doit être un entier').min(1, 'doit être au moins 1')
    .max(NOTIFICATIONS_MAX_PAGE_SIZE, `trop grand (max ${NOTIFICATIONS_MAX_PAGE_SIZE})`).default(NOTIFICATIONS_PAGE_SIZE),
  before: z.string().datetime({ offset: true, message: 'doit être une date ISO 8601' }).nullish()
})

/** `mark_notifications_read(p_ids)` : sans `ids` (ou `null`), toutes. */
export const markNotificationsReadInputSchema = z.object({
  ids: z.array(uuidSchema).max(200, 'trop d\'éléments (max 200)').nullish()
})

// ---------------------------------------------------------------- profil et compte
/** Pseudonyme : 1 à 60 caractères, jamais d'« @ » (pas d'adresse e-mail affichée), unique (vérifié en base). */
export const displayNameSchema = z.string({ invalid_type_error: 'doit être du texte' })
  .trim().min(1, 'requis').max(60, 'trop long (max 60 caractères)')
  .refine(value => !value.includes('@'), 'ne peut pas contenir « @ »')

/**
 * `update_my_profile(…)` : une clé absente = inchangé. `cookbookTitle: ''` ou `null` efface le titre ;
 * `themeSettings: null` efface le thème personnel ; `activeThemeGroupId: null` = revenir au thème personnel.
 */
export const updateMyProfileInputSchema = z.object({
  displayName: displayNameSchema.optional(),
  cookbookTitle: optionalText(80),
  discoverable: z.boolean().optional(),
  themeSettings: themeObjectSchema.nullish(),
  activeThemeGroupId: uuidSchema.nullish()
})

/** `POST /api/account/delete` : saisie de confirmation = l'adresse e-mail du compte. */
export const deleteAccountInputSchema = z.object({
  confirmEmail: z.string({ required_error: 'requis' }).trim().email('adresse e-mail invalide')
})

export type SendFriendRequestInput = z.infer<typeof sendFriendRequestInputSchema>
export type CreateGroupInput = z.infer<typeof createGroupInputSchema>
export type UpdateMyProfileInput = z.infer<typeof updateMyProfileInputSchema>
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>
