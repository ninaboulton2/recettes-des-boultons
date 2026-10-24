import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import type { Database } from '#shared/types/database'
import {
  cancelFriendRequestInputSchema,
  getUserProfileInputSchema,
  removeFriendInputSchema,
  respondFriendRequestInputSchema,
  searchUsersInputSchema,
  sendFriendRequestInputSchema
} from '#shared/schemas/social'
import {
  toFriend,
  toFriendRequest,
  toUserProfile,
  type Friend,
  type FriendRequest,
  type UserProfile
} from '#shared/utils/social'
import { parseClientInput } from './useCookbook'

/**
 * Amis v2 (migration 0023) — appels directs aux RPC avec la session de la personne (voir `useCookbook`). Les règles
 * (une demande par paire, relance après refus : 7 jours, 20 demandes par jour) sont appliquées en base : une erreur
 * 54000 = limite atteinte (`isRateLimitError`), 22023 = demande refusée avec un message clair, 42501 = pas permis.
 * Jamais d'e-mail : seulement identifiant et pseudonyme.
 */

type Client = SupabaseClient<Database>

/** Recherche par pseudonyme (≥ 3 lettres, personnes « découvrables » seulement, 0019). */
export async function searchUsers(supabase: Client, input: z.input<typeof searchUsersInputSchema>): Promise<Array<{ id: string, displayName: string | null }>> {
  const { query } = parseClientInput(searchUsersInputSchema, input)
  const { data, error } = await supabase.rpc('search_users', { p_query: query })
  if (error) throw error
  return (data ?? []).map(row => ({ id: row.id, displayName: row.display_name ?? null }))
}

/** Demande d'ami. Renvoie l'id de la demande (le même si elle existe déjà ou si vous êtes déjà amis). */
export async function sendFriendRequest(supabase: Client, input: z.input<typeof sendFriendRequestInputSchema>): Promise<string> {
  const { userId } = parseClientInput(sendFriendRequestInputSchema, input)
  const { data, error } = await supabase.rpc('send_friend_request', { p_user: userId })
  if (error) throw error
  return data
}

/** Le destinataire accepte ou refuse. Renvoie le nouveau statut (`accepted` | `declined`). */
export async function respondFriendRequest(supabase: Client, input: z.input<typeof respondFriendRequestInputSchema>): Promise<'accepted' | 'declined'> {
  const { friendshipId, accept } = parseClientInput(respondFriendRequestInputSchema, input)
  const { data, error } = await supabase.rpc('respond_friend_request', { p_id: friendshipId, p_accept: accept })
  if (error) throw error
  return data === 'accepted' ? 'accepted' : 'declined'
}

/** Le demandeur retire sa demande en attente. `false` : rien retiré. */
export async function cancelFriendRequest(supabase: Client, input: z.input<typeof cancelFriendRequestInputSchema>): Promise<boolean> {
  const { friendshipId } = parseClientInput(cancelFriendRequestInputSchema, input)
  const { data, error } = await supabase.rpc('cancel_friend_request', { p_id: friendshipId })
  if (error) throw error
  return data === true
}

/** Met fin à une amitié (retire aussi les droits directs entre les deux s'ils ne partagent aucun groupe). */
export async function removeFriend(supabase: Client, input: z.input<typeof removeFriendInputSchema>): Promise<boolean> {
  const { userId } = parseClientInput(removeFriendInputSchema, input)
  const { data, error } = await supabase.rpc('remove_friend', { p_user: userId })
  if (error) throw error
  return data === true
}

export async function listFriends(supabase: Client): Promise<Friend[]> {
  const { data, error } = await supabase.rpc('list_friends')
  if (error) throw error
  return (data ?? []).map(toFriend)
}

/** Demandes reçues en attente et demandes envoyées (en attente ou refusées). */
export async function listFriendRequests(supabase: Client): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc('list_friend_requests')
  if (error) throw error
  return (data ?? []).map(toFriendRequest)
}

/** Profil public (page « profil de X → ses recettes »). `null` si la personne n'est pas (encore) visible pour moi. */
export async function getUserProfile(supabase: Client, input: z.input<typeof getUserProfileInputSchema>): Promise<UserProfile | null> {
  const { userId } = parseClientInput(getUserProfileInputSchema, input)
  const { data, error } = await supabase.rpc('get_user_profile', { p_user: userId })
  if (error) throw error
  const row = data?.[0]
  return row ? toUserProfile(row) : null
}

/** Les fonctions ci-dessus liées au client Supabase de la session courante. */
export function useFriends() {
  const supabase = useSupabaseClient<Database>()
  return {
    searchUsers: (input: z.input<typeof searchUsersInputSchema>) => searchUsers(supabase, input),
    sendFriendRequest: (input: z.input<typeof sendFriendRequestInputSchema>) => sendFriendRequest(supabase, input),
    respondFriendRequest: (input: z.input<typeof respondFriendRequestInputSchema>) => respondFriendRequest(supabase, input),
    cancelFriendRequest: (input: z.input<typeof cancelFriendRequestInputSchema>) => cancelFriendRequest(supabase, input),
    removeFriend: (input: z.input<typeof removeFriendInputSchema>) => removeFriend(supabase, input),
    listFriends: () => listFriends(supabase),
    listFriendRequests: () => listFriendRequests(supabase),
    getUserProfile: (input: z.input<typeof getUserProfileInputSchema>) => getUserProfile(supabase, input)
  }
}
