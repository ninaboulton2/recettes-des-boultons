import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '#shared/types/database'
import {
  ACCOUNT_BLOCKED_SQLSTATE,
  RATE_LIMIT_SQLSTATE,
  isRateLimitError,
  toDeletionBlocker,
  toFriend,
  toFriendRequest,
  toGroupInvitation,
  toGroupMember,
  toInviteLink,
  toMyGroup,
  toNotification,
  toProfileSettings,
  toUserProfile
} from '#shared/utils/social'
import {
  cancelFriendRequest,
  getUserProfile,
  listFriendRequests,
  listFriends,
  removeFriend,
  respondFriendRequest,
  searchUsers,
  sendFriendRequest
} from '../../app/composables/useFriends'
import {
  cancelGroupInvitation,
  createGroup,
  createInviteLink,
  deleteGroup,
  inviteToGroup,
  leaveGroup,
  listGroupInvitations,
  listGroupMembers,
  listMyGroups,
  redeemInviteLink,
  removeGroupMember,
  renameGroup,
  respondGroupInvitation,
  transferGroupOwnership,
  updateGroupTheme
} from '../../app/composables/useGroups'
import { listNotifications, markNotificationsRead, unreadNotificationsCount } from '../../app/composables/useNotifications'
import { accountDeletionBlockers, exportMyData, updateMyProfile } from '../../app/composables/useAccount'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'ab'.repeat(32)

/** Faux client : `rpc(name, args)` renvoie la réponse programmée et mémorise l'appel. */
function fakeClient(response: { data?: unknown, error?: unknown }) {
  const rpc = vi.fn(async () => ({ data: response.data ?? null, error: response.error ?? null }))
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

describe('conversions snake_case → camelCase', () => {
  it('amis, demandes, groupes, membres', () => {
    expect(toFriend({ friendship_id: A, user_id: B, display_name: 'Eve', cookbook_title: null, since: 'x' }))
      .toEqual({ friendshipId: A, userId: B, displayName: 'Eve', cookbookTitle: null, since: 'x' })
    expect(toFriendRequest({ friendship_id: A, direction: 'incoming', user_id: B, display_name: null, status: 'pending', created_at: 'x', retry_after: null }))
      .toMatchObject({ direction: 'incoming', status: 'pending', displayName: null, retryAfter: null })
    expect(toFriendRequest({ friendship_id: A, direction: 'zzz', user_id: B, display_name: 'Eve', status: 'declined', created_at: 'x', retry_after: 'y' }))
      .toMatchObject({ direction: 'outgoing', status: 'declined', retryAfter: 'y' })
    expect(toMyGroup({ group_id: A, name: 'G', theme: { preset: 'x' }, role: 'creator', creator_name: 'Nina', member_count: 3, joined_at: 'x', created_at: 'y' }))
      .toMatchObject({ groupId: A, isCreator: true, role: 'creator', theme: { preset: 'x' }, memberCount: 3 })
    expect(toMyGroup({ group_id: A, name: 'G', theme: [1], role: 'autre', creator_name: null, member_count: 1, joined_at: 'x', created_at: 'y' }))
      .toMatchObject({ isCreator: false, role: 'member', theme: {} })
    expect(toGroupMember({ user_id: A, display_name: null, role: 'creator', joined_at: 'x' })).toEqual({ userId: A, displayName: null, role: 'creator', joinedAt: 'x' })
  })

  it('invitations et lien d\'invitation', () => {
    expect(toGroupInvitation({ invitation_id: A, direction: 'received', group_id: B, group_name: 'G', user_id: A, display_name: 'Dave', channel: 'user', created_at: 'x', expires_at: 'y' }))
      .toMatchObject({ direction: 'received', channel: 'user', userId: A })
    expect(toGroupInvitation({ invitation_id: A, direction: 'sent', group_id: B, group_name: 'G', user_id: null, display_name: null, channel: 'link', created_at: 'x', expires_at: 'y' }))
      .toMatchObject({ direction: 'sent', channel: 'link', userId: null })
    expect(toInviteLink({ invitation_id: A, token: TOKEN, expires_at: 'y' })).toEqual({ invitationId: A, token: TOKEN, expiresAt: 'y' })
  })

  it('notifications : lue ou non, genre connu ou non, payload toujours un objet', () => {
    expect(toNotification({ id: A, type: 'friend_request', payload: { from_name: 'Dave' }, read_at: null, created_at: 'x' }))
      .toEqual({ id: A, type: 'friend_request', known: true, payload: { from_name: 'Dave' }, read: false, readAt: null, createdAt: 'x' })
    expect(toNotification({ id: A, type: 'futur', payload: 'zzz', read_at: 'y', created_at: 'x' })).toMatchObject({ known: false, payload: {}, read: true })
  })

  it('profil public, blocage, réglages du profil', () => {
    const row = { user_id: A, display_name: 'Eve', cookbook_title: 'Carnet', is_self: false, friendship_status: 'friends', friendship_id: B, common_groups: [{ id: B, name: 'G' }, 'x'], readable_recipe_count: 4 }
    expect(toUserProfile(row)).toEqual({ userId: A, displayName: 'Eve', cookbookTitle: 'Carnet', isSelf: false, friendshipStatus: 'friends', friendshipId: B, commonGroups: [{ id: B, name: 'G' }], readableRecipeCount: 4 })
    expect(toUserProfile({ ...row, friendship_status: 'bizarre', common_groups: null }).friendshipStatus).toBe('none')
    expect(toDeletionBlocker({ group_id: A, group_name: 'G', other_member_count: 2 })).toEqual({ groupId: A, groupName: 'G', otherMemberCount: 2 })
    expect(toProfileSettings({ display_name: 'Dave', cookbook_title: null, discoverable: true, theme_settings: { preset: 'x' }, active_theme_group_id: null }))
      .toEqual({ displayName: 'Dave', cookbookTitle: null, discoverable: true, themeSettings: { preset: 'x' }, activeThemeGroupId: null })
    expect(toProfileSettings({ display_name: null, cookbook_title: null, discoverable: false, theme_settings: [], active_theme_group_id: null }).themeSettings).toBeNull()
  })

  it('isRateLimitError reconnaît le SQLSTATE 54000', () => {
    expect(RATE_LIMIT_SQLSTATE).toBe('54000')
    expect(ACCOUNT_BLOCKED_SQLSTATE).toBe('55000')
    expect(isRateLimitError({ code: '54000', message: 'Limite atteinte' })).toBe(true)
    expect(isRateLimitError({ code: '42501' })).toBe(false)
    expect(isRateLimitError(null)).toBe(false)
    expect(isRateLimitError(new Error('x'))).toBe(false)
  })
})

describe('amis (RPC)', () => {
  it('recherche, demande, réponse, annulation, fin d\'amitié', async () => {
    const search = fakeClient({ data: [{ id: A, display_name: 'Eve' }, { id: B, display_name: null }] })
    expect(await searchUsers(search.client, { query: ' eve ' })).toEqual([{ id: A, displayName: 'Eve' }, { id: B, displayName: null }])
    expect(search.rpc).toHaveBeenCalledWith('search_users', { p_query: 'eve' })
    await expect(searchUsers(search.client, { query: 'ev' })).rejects.toThrow(/Données invalides : query/)

    const send = fakeClient({ data: B })
    expect(await sendFriendRequest(send.client, { userId: A })).toBe(B)
    expect(send.rpc).toHaveBeenCalledWith('send_friend_request', { p_user: A })
    const respond = fakeClient({ data: 'accepted' })
    expect(await respondFriendRequest(respond.client, { friendshipId: A, accept: true })).toBe('accepted')
    expect(respond.rpc).toHaveBeenCalledWith('respond_friend_request', { p_id: A, p_accept: true })
    expect(await respondFriendRequest(fakeClient({ data: 'declined' }).client, { friendshipId: A, accept: false })).toBe('declined')
    expect(await cancelFriendRequest(fakeClient({ data: true }).client, { friendshipId: A })).toBe(true)
    expect(await cancelFriendRequest(fakeClient({ data: false }).client, { friendshipId: A })).toBe(false)
    expect(await removeFriend(fakeClient({ data: true }).client, { userId: A })).toBe(true)
  })

  it('listes et profil public (aucune ligne = null)', async () => {
    expect((await listFriends(fakeClient({ data: [{ friendship_id: A, user_id: B, display_name: 'Eve', cookbook_title: null, since: 'x' }] }).client))[0]?.displayName).toBe('Eve')
    expect(await listFriendRequests(fakeClient({ data: null }).client)).toEqual([])
    expect(await getUserProfile(fakeClient({ data: [] }).client, { userId: A })).toBeNull()
    const { client, rpc } = fakeClient({ data: [{ user_id: A, display_name: 'Eve', cookbook_title: null, is_self: false, friendship_status: 'none', friendship_id: null, common_groups: [], readable_recipe_count: 0 }] })
    expect((await getUserProfile(client, { userId: A }))?.displayName).toBe('Eve')
    expect(rpc).toHaveBeenCalledWith('get_user_profile', { p_user: A })
  })

  it('erreurs de base relancées telles quelles ; entrée invalide : aucun appel', async () => {
    const limit = { code: '54000', message: 'Limite atteinte : 20 demandes d\'ami par jour. Réessayez demain.' }
    await expect(sendFriendRequest(fakeClient({ error: limit }).client, { userId: A })).rejects.toBe(limit)
    const { client, rpc } = fakeClient({ data: B })
    await expect(sendFriendRequest(client, { userId: 'x' })).rejects.toThrow(/Données invalides : userId/)
    await expect(respondFriendRequest(client, { friendshipId: A } as never)).rejects.toThrow(/Données invalides/)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('groupes (RPC)', () => {
  it('création, nom, thème', async () => {
    const create = fakeClient({ data: A })
    expect(await createGroup(create.client, { name: '  Voisins ' })).toBe(A)
    expect(create.rpc).toHaveBeenCalledWith('create_group', { p_name: 'Voisins' })
    const { client, rpc } = fakeClient({})
    await renameGroup(client, { groupId: A, name: 'Autre' })
    expect(rpc).toHaveBeenLastCalledWith('rename_group', { p_group: A, p_name: 'Autre' })
    await updateGroupTheme(client, { groupId: A, theme: { preset: 'ocean' } })
    expect(rpc).toHaveBeenLastCalledWith('update_group_theme', { p_group: A, p_theme: { preset: 'ocean' } })
    rpc.mockClear()
    await expect(updateGroupTheme(client, { groupId: A, theme: [] as never })).rejects.toThrow(/Données invalides : theme/)
    await expect(createGroup(client, { name: '' })).rejects.toThrow(/Données invalides : name/)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('invitations : personne, lien (jeton une fois), réponse, annulation', async () => {
    const { client, rpc } = fakeClient({ data: B })
    expect(await inviteToGroup(client, { groupId: A, userId: B })).toBe(B)
    expect(rpc).toHaveBeenLastCalledWith('invite_to_group', { p_group: A, p_user: B })
    const link = fakeClient({ data: [{ invitation_id: A, token: TOKEN, expires_at: 'y' }] })
    expect(await createInviteLink(link.client, { groupId: B })).toEqual({ invitationId: A, token: TOKEN, expiresAt: 'y' })
    await expect(createInviteLink(fakeClient({ data: [] }).client, { groupId: B })).rejects.toThrow(/non créé/)
    const redeem = fakeClient({ data: A })
    expect(await redeemInviteLink(redeem.client, { token: TOKEN.toUpperCase() })).toBe(A)
    expect(redeem.rpc).toHaveBeenCalledWith('redeem_invite_link', { p_token: TOKEN })
    await expect(redeemInviteLink(redeem.client, { token: 'court' })).rejects.toThrow(/Données invalides : token/)
    expect(await respondGroupInvitation(fakeClient({ data: 'accepted' }).client, { invitationId: A, accept: true })).toBe('accepted')
    expect(await respondGroupInvitation(fakeClient({ data: 'declined' }).client, { invitationId: A, accept: false })).toBe('declined')
    expect(await cancelGroupInvitation(fakeClient({ data: true }).client, { invitationId: A })).toBe(true)
  })

  it('départ, retrait, transfert, suppression', async () => {
    const { client, rpc } = fakeClient({ data: true })
    await leaveGroup(client, { groupId: A })
    expect(rpc).toHaveBeenLastCalledWith('leave_group', { p_group: A })
    expect(await removeGroupMember(client, { groupId: A, userId: B })).toBe(true)
    expect(rpc).toHaveBeenLastCalledWith('remove_group_member', { p_group: A, p_user: B })
    await transferGroupOwnership(client, { groupId: A, newCreatorId: B })
    expect(rpc).toHaveBeenLastCalledWith('transfer_group_ownership', { p_group: A, p_new_creator: B })
    await deleteGroup(client, { groupId: A })
    expect(rpc).toHaveBeenLastCalledWith('delete_group', { p_group: A })
    const refused = { code: '42501', message: 'Réservé au créateur du groupe' }
    await expect(deleteGroup(fakeClient({ error: refused }).client, { groupId: A })).rejects.toBe(refused)
  })

  it('listes', async () => {
    const groups = await listMyGroups(fakeClient({ data: [{ group_id: A, name: 'G', theme: {}, role: 'member', creator_name: 'Dave', member_count: 2, joined_at: 'x', created_at: 'y' }] }).client)
    expect(groups[0]).toMatchObject({ groupId: A, isCreator: false, creatorName: 'Dave' })
    const members = fakeClient({ data: [{ user_id: A, display_name: 'Dave', role: 'creator', joined_at: 'x' }] })
    expect((await listGroupMembers(members.client, { groupId: B }))[0]?.role).toBe('creator')
    expect(members.rpc).toHaveBeenCalledWith('list_group_members', { p_group: B })
    expect(await listGroupInvitations(fakeClient({ data: null }).client)).toEqual([])
  })
})

describe('notifications (RPC)', () => {
  it('liste paginée : nextBefore seulement si la page est pleine', async () => {
    const row = (id: string, at: string) => ({ id, type: 'friend_request', payload: {}, read_at: null, created_at: at })
    const full = fakeClient({ data: [row(A, '2026-10-24T10:00:00Z'), row(B, '2026-10-24T09:00:00Z')] })
    const page = await listNotifications(full.client, { limit: 2, before: '2026-10-25T00:00:00Z' })
    expect(full.rpc).toHaveBeenCalledWith('list_notifications', { p_limit: 2, p_before: '2026-10-25T00:00:00Z' })
    expect(page.items.map(i => i.id)).toEqual([A, B])
    expect(page.nextBefore).toBe('2026-10-24T09:00:00Z')
    const partial = await listNotifications(fakeClient({ data: [row(A, 'x')] }).client)
    expect(partial.nextBefore).toBeNull()
    const { client, rpc } = fakeClient({ data: [] })
    await listNotifications(client)
    expect(rpc).toHaveBeenLastCalledWith('list_notifications', { p_limit: 30, p_before: undefined })
  })

  it('marquer lues, compteur', async () => {
    const { client, rpc } = fakeClient({ data: 3 })
    expect(await markNotificationsRead(client)).toBe(3)
    expect(rpc).toHaveBeenLastCalledWith('mark_notifications_read', { p_ids: undefined })
    await markNotificationsRead(client, { ids: [A, B] })
    expect(rpc).toHaveBeenLastCalledWith('mark_notifications_read', { p_ids: [A, B] })
    await expect(markNotificationsRead(client, { ids: ['x'] })).rejects.toThrow(/Données invalides : ids/)
    expect(await unreadNotificationsCount(fakeClient({ data: 5 }).client)).toBe(5)
    expect(await unreadNotificationsCount(fakeClient({ data: null }).client)).toBe(0)
  })
})

describe('profil et compte (RPC)', () => {
  const saved = [{ display_name: 'Dave', cookbook_title: null, discoverable: true, theme_settings: null, active_theme_group_id: null }]

  it('updateMyProfile : clé absente = inchangé, null / vide = effacer', async () => {
    const { client, rpc } = fakeClient({ data: saved })
    expect((await updateMyProfile(client, { displayName: ' Dave ' })).displayName).toBe('Dave')
    expect(rpc).toHaveBeenLastCalledWith('update_my_profile', {
      p_display_name: 'Dave', p_cookbook_title: undefined, p_discoverable: undefined, p_theme_settings: undefined,
      p_active_theme_group_id: undefined, p_personal_theme: undefined
    })
    await updateMyProfile(client, { cookbookTitle: null, themeSettings: null, activeThemeGroupId: null, discoverable: false })
    expect(rpc).toHaveBeenLastCalledWith('update_my_profile', {
      p_display_name: undefined, p_cookbook_title: '', p_discoverable: false, p_theme_settings: {},
      p_active_theme_group_id: undefined, p_personal_theme: true
    })
    await updateMyProfile(client, { themeSettings: { preset: 'ocean' }, activeThemeGroupId: A })
    expect(rpc).toHaveBeenLastCalledWith('update_my_profile', {
      p_display_name: undefined, p_cookbook_title: undefined, p_discoverable: undefined, p_theme_settings: { preset: 'ocean' },
      p_active_theme_group_id: A, p_personal_theme: undefined
    })
    rpc.mockClear()
    await expect(updateMyProfile(client, { displayName: 'a@b.fr' })).rejects.toThrow(/Données invalides : displayName/)
    expect(rpc).not.toHaveBeenCalled()
    await expect(updateMyProfile(fakeClient({ data: [] }).client, { discoverable: true })).rejects.toThrow(/Profil introuvable/)
  })

  it('export et blocages de suppression', async () => {
    const dump = { exported_at: 'x', profile: { id: A } }
    const exported = fakeClient({ data: dump })
    expect(await exportMyData(exported.client)).toBe(dump)
    expect(exported.rpc).toHaveBeenCalledWith('export_my_data')
    const limit = { code: '54000', message: 'Limite atteinte : 3 exports par jour. Réessayez demain.' }
    await expect(exportMyData(fakeClient({ error: limit }).client)).rejects.toBe(limit)
    expect(await accountDeletionBlockers(fakeClient({ data: [{ group_id: A, group_name: 'G', other_member_count: 2 }] }).client))
      .toEqual([{ groupId: A, groupName: 'G', otherMemberCount: 2 }])
    expect(await accountDeletionBlockers(fakeClient({ data: [] }).client)).toEqual([])
  })
})
