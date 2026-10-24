import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import type { Database, Json } from '#shared/types/database'
import {
  cancelGroupInvitationInputSchema,
  createGroupInputSchema,
  groupIdInputSchema,
  inviteToGroupInputSchema,
  redeemInviteLinkInputSchema,
  removeGroupMemberInputSchema,
  renameGroupInputSchema,
  respondGroupInvitationInputSchema,
  transferGroupOwnershipInputSchema,
  updateGroupThemeInputSchema
} from '#shared/schemas/social'
import {
  toGroupInvitation,
  toGroupMember,
  toInviteLink,
  toMyGroup,
  type GroupInvitation,
  type GroupMember,
  type InviteLink,
  type MyGroup
} from '#shared/utils/social'
import { parseClientInput } from './useCookbook'

/**
 * Groupes v2 (migration 0023) — appels directs aux RPC avec la session de la personne. Le CRÉATEUR gère les membres, le
 * nom et le thème ; une personne invitée ACCEPTE (aucune recette n'est alors ajoutée à son carnet) ; un créateur ne
 * quitte pas son groupe : il passe le rôle ou le supprime. Erreurs : 42501 = réservé au créateur, P0002 = groupe
 * introuvable (ou dont on n'est pas membre), 22023 = entrée refusée (message français), 54000 = 20 invitations par jour.
 */

type Client = SupabaseClient<Database>

/** Crée un groupe dont je suis le créateur. Renvoie son id. */
export async function createGroup(supabase: Client, input: z.input<typeof createGroupInputSchema>): Promise<string> {
  const { name } = parseClientInput(createGroupInputSchema, input)
  const { data, error } = await supabase.rpc('create_group', { p_name: name })
  if (error) throw error
  return data
}

export async function renameGroup(supabase: Client, input: z.input<typeof renameGroupInputSchema>): Promise<void> {
  const { groupId, name } = parseClientInput(renameGroupInputSchema, input)
  const { error } = await supabase.rpc('rename_group', { p_group: groupId, p_name: name })
  if (error) throw error
}

export async function updateGroupTheme(supabase: Client, input: z.input<typeof updateGroupThemeInputSchema>): Promise<void> {
  const { groupId, theme } = parseClientInput(updateGroupThemeInputSchema, input)
  const { error } = await supabase.rpc('update_group_theme', { p_group: groupId, p_theme: theme as Json })
  if (error) throw error
}

/** Invite une personne (créateur seulement). Idempotent tant que l'invitation est en attente. Renvoie l'id de l'invitation. */
export async function inviteToGroup(supabase: Client, input: z.input<typeof inviteToGroupInputSchema>): Promise<string> {
  const { groupId, userId } = parseClientInput(inviteToGroupInputSchema, input)
  const { data, error } = await supabase.rpc('invite_to_group', { p_group: groupId, p_user: userId })
  if (error) throw error
  return data
}

/**
 * Crée un lien d'invitation à usage unique valable 7 jours (créateur seulement). Le jeton en clair n'est renvoyé
 * QU'ICI : le copier tout de suite. L'envoi par e-mail relève de la phase 7.
 */
export async function createInviteLink(supabase: Client, input: z.input<typeof groupIdInputSchema>): Promise<InviteLink> {
  const { groupId } = parseClientInput(groupIdInputSchema, input)
  const { data, error } = await supabase.rpc('create_invite_link', { p_group: groupId })
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error('Lien d\'invitation non créé')
  return toInviteLink(row)
}

/** Rejoint un groupe avec un lien (connecté). Renvoie l'id du groupe. */
export async function redeemInviteLink(supabase: Client, input: z.input<typeof redeemInviteLinkInputSchema>): Promise<string> {
  const { token } = parseClientInput(redeemInviteLinkInputSchema, input)
  const { data, error } = await supabase.rpc('redeem_invite_link', { p_token: token.toLowerCase() })
  if (error) throw error
  return data
}

/** Annule une invitation en attente (personne ou lien), créateur seulement. */
export async function cancelGroupInvitation(supabase: Client, input: z.input<typeof cancelGroupInvitationInputSchema>): Promise<boolean> {
  const { invitationId } = parseClientInput(cancelGroupInvitationInputSchema, input)
  const { data, error } = await supabase.rpc('cancel_group_invitation', { p_id: invitationId })
  if (error) throw error
  return data === true
}

/** Accepter = rejoindre le groupe (aucune recette ajoutée au carnet) ; refuser ne prévient personne. Renvoie le statut. */
export async function respondGroupInvitation(supabase: Client, input: z.input<typeof respondGroupInvitationInputSchema>): Promise<'accepted' | 'declined'> {
  const { invitationId, accept } = parseClientInput(respondGroupInvitationInputSchema, input)
  const { data, error } = await supabase.rpc('respond_group_invitation', { p_id: invitationId, p_accept: accept })
  if (error) throw error
  return data === 'accepted' ? 'accepted' : 'declined'
}

/** Quitter un groupe (membre seulement ; le créateur transfère ou supprime). */
export async function leaveGroup(supabase: Client, input: z.input<typeof groupIdInputSchema>): Promise<void> {
  const { groupId } = parseClientInput(groupIdInputSchema, input)
  const { error } = await supabase.rpc('leave_group', { p_group: groupId })
  if (error) throw error
}

/** Retire un membre (créateur seulement). `false` : cette personne n'était pas membre. */
export async function removeGroupMember(supabase: Client, input: z.input<typeof removeGroupMemberInputSchema>): Promise<boolean> {
  const { groupId, userId } = parseClientInput(removeGroupMemberInputSchema, input)
  const { data, error } = await supabase.rpc('remove_group_member', { p_group: groupId, p_user: userId })
  if (error) throw error
  return data === true
}

/** Passe le rôle de créateur à un membre (atomique). Annule les invitations en attente. */
export async function transferGroupOwnership(supabase: Client, input: z.input<typeof transferGroupOwnershipInputSchema>): Promise<void> {
  const { groupId, newCreatorId } = parseClientInput(transferGroupOwnershipInputSchema, input)
  const { error } = await supabase.rpc('transfer_group_ownership', { p_group: groupId, p_new_creator: newCreatorId })
  if (error) throw error
}

/** Supprime le groupe (créateur seulement) : membres, invitations et droits donnés au groupe disparaissent ; les membres sont prévenus. */
export async function deleteGroup(supabase: Client, input: z.input<typeof groupIdInputSchema>): Promise<void> {
  const { groupId } = parseClientInput(groupIdInputSchema, input)
  const { error } = await supabase.rpc('delete_group', { p_group: groupId })
  if (error) throw error
}

export async function listMyGroups(supabase: Client): Promise<MyGroup[]> {
  const { data, error } = await supabase.rpc('list_my_groups')
  if (error) throw error
  return (data ?? []).map(toMyGroup)
}

/** Membres d'un groupe dont je fais partie (pseudonymes seulement). */
export async function listGroupMembers(supabase: Client, input: z.input<typeof groupIdInputSchema>): Promise<GroupMember[]> {
  const { groupId } = parseClientInput(groupIdInputSchema, input)
  const { data, error } = await supabase.rpc('list_group_members', { p_group: groupId })
  if (error) throw error
  return (data ?? []).map(toGroupMember)
}

/** Invitations reçues par moi + (pour mes groupes) invitations envoyées en attente. */
export async function listGroupInvitations(supabase: Client): Promise<GroupInvitation[]> {
  const { data, error } = await supabase.rpc('list_group_invitations')
  if (error) throw error
  return (data ?? []).map(toGroupInvitation)
}

/** Les fonctions ci-dessus liées au client Supabase de la session courante. */
export function useGroups() {
  const supabase = useSupabaseClient<Database>()
  return {
    createGroup: (input: z.input<typeof createGroupInputSchema>) => createGroup(supabase, input),
    renameGroup: (input: z.input<typeof renameGroupInputSchema>) => renameGroup(supabase, input),
    updateGroupTheme: (input: z.input<typeof updateGroupThemeInputSchema>) => updateGroupTheme(supabase, input),
    inviteToGroup: (input: z.input<typeof inviteToGroupInputSchema>) => inviteToGroup(supabase, input),
    createInviteLink: (input: z.input<typeof groupIdInputSchema>) => createInviteLink(supabase, input),
    redeemInviteLink: (input: z.input<typeof redeemInviteLinkInputSchema>) => redeemInviteLink(supabase, input),
    cancelGroupInvitation: (input: z.input<typeof cancelGroupInvitationInputSchema>) => cancelGroupInvitation(supabase, input),
    respondGroupInvitation: (input: z.input<typeof respondGroupInvitationInputSchema>) => respondGroupInvitation(supabase, input),
    leaveGroup: (input: z.input<typeof groupIdInputSchema>) => leaveGroup(supabase, input),
    removeGroupMember: (input: z.input<typeof removeGroupMemberInputSchema>) => removeGroupMember(supabase, input),
    transferGroupOwnership: (input: z.input<typeof transferGroupOwnershipInputSchema>) => transferGroupOwnership(supabase, input),
    deleteGroup: (input: z.input<typeof groupIdInputSchema>) => deleteGroup(supabase, input),
    listMyGroups: () => listMyGroups(supabase),
    listGroupMembers: (input: z.input<typeof groupIdInputSchema>) => listGroupMembers(supabase, input),
    listGroupInvitations: () => listGroupInvitations(supabase)
  }
}
