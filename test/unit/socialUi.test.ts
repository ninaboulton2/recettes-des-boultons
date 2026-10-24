import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '#shared/types/database'
import { toNotification, toMyGroup, type MyGroupRow } from '#shared/utils/social'
import {
  canRetryRequest,
  canSearchUsers,
  groupRights,
  inviteLinkErrorMessage,
  inviteLinkPath,
  memberRights,
  notificationView,
  profileFriendAction,
  socialErrorMessage,
  unreadIds
} from '#shared/utils/socialUi'
import { NOTIFICATION_TYPES } from '#shared/schemas/social'
import { setEntryCategory, getEntryCategory } from '../../app/composables/useCookbook'

const ID = '11111111-1111-4111-8111-111111111111'
const GROUP = '22222222-2222-4222-8222-222222222222'

const note = (type: string, payload: Record<string, unknown>) => toNotification({ id: ID, type, payload, read_at: null, created_at: '2026-10-24T10:00:00Z' })

describe('socialErrorMessage', () => {
  it('limite de débit (54000)', () => {
    expect(socialErrorMessage({ code: '54000', message: 'Limite atteinte : 20 demandes' })).toEqual({ key: 'errors.social.rate' })
  })
  it('relance trop tôt après un refus : nombre de jours extrait du message de la base', () => {
    expect(socialErrorMessage({ code: '22023', message: 'Demande déjà refusée : vous pourrez la renouveler dans 3 jour(s)' }))
      .toEqual({ key: 'errors.social.retryLater', params: { n: 3 } })
  })
  it('demande déjà reçue en sens inverse', () => {
    expect(socialErrorMessage({ code: '22023', message: 'Cette personne vous a déjà envoyé une demande : répondez-y' }).key).toBe('errors.social.reverseRequest')
  })
  it('introuvable (P0002) et refus (42501)', () => {
    expect(socialErrorMessage({ code: 'P0002', message: 'Personne introuvable' }).key).toBe('errors.social.notFound')
    expect(socialErrorMessage({ code: '42501', message: 'Réservé au créateur du groupe' }).key).toBe('errors.social.forbidden')
  })
  it('situations de groupe', () => {
    expect(socialErrorMessage({ code: '22023', message: 'Cette personne est déjà dans le groupe' }).key).toBe('errors.social.alreadyMember')
    expect(socialErrorMessage({ code: '22023', message: 'Cette personne a refusé l\'invitation récemment : réessayez dans quelques jours' }).key).toBe('errors.social.inviteDeclined')
    expect(socialErrorMessage({ code: '22023', message: 'Le créateur ne peut pas quitter le groupe : passez le rôle' }).key).toBe('errors.social.creatorCannotLeave')
    expect(socialErrorMessage({ code: '55000', message: 'Transfert impossible' }).key).toBe('errors.social.conflict')
  })
  it('jamais le texte technique : erreur inconnue = message générique', () => {
    expect(socialErrorMessage(new Error('boom'))).toEqual({ key: 'errors.generic' })
    expect(socialErrorMessage(null)).toEqual({ key: 'errors.generic' })
    expect(socialErrorMessage({ code: '22023', message: 'autre chose' }).key).toBe('errors.social.invalid')
  })
})

describe('inviteLinkErrorMessage : message neutre', () => {
  it('jeton inconnu, expiré ou consommé : le même message', () => {
    expect(inviteLinkErrorMessage({ code: 'P0002', message: 'Lien d\'invitation invalide ou expiré' })).toEqual({ key: 'errors.social.invalidLink' })
    expect(inviteLinkErrorMessage({ code: '22023', message: 'Invitation expirée' })).toEqual({ key: 'errors.social.invalidLink' })
  })
  it('propre lien et limite de débit restent distincts', () => {
    expect(inviteLinkErrorMessage({ code: '22023', message: 'Vous ne pouvez pas utiliser votre propre lien' }).key).toBe('errors.social.ownLink')
    expect(inviteLinkErrorMessage({ code: '54000', message: '' }).key).toBe('errors.social.rate')
  })
})

describe('notificationView', () => {
  it('chaque genre connu a un texte, une icône et (sauf suppression) un lien', () => {
    for (const type of NOTIFICATION_TYPES) {
      const view = notificationView({ type, payload: {} })
      expect(view, type).not.toBeNull()
      expect(view?.key).toBe(`notifications.types.${type}`)
      expect(view?.icon).toMatch(/^i-lucide-/)
    }
  })
  it('demande d\'ami → /amis ; acceptée → profil de la personne', () => {
    expect(notificationView(note('friend_request', { from_name: 'Eve' }))).toMatchObject({ params: { name: 'Eve' }, to: '/amis' })
    expect(notificationView(note('friend_accepted', { name: 'Eve', user_id: ID }))?.to).toBe(`/personnes/${ID}`)
  })
  it('invitation de groupe → liste des groupes ; invitation acceptée → le groupe', () => {
    expect(notificationView(note('group_invitation', { from_name: 'Eve', group_name: 'Voisins' }))).toMatchObject({ params: { name: 'Eve', group: 'Voisins' }, to: '/groupes' })
    expect(notificationView(note('group_invitation_accepted', { name: 'Eve', group_name: 'Voisins', group_id: GROUP }))?.to).toBe(`/groupes/${GROUP}`)
    expect(notificationView(note('group_ownership_transferred', { from_name: 'Eve', group_name: 'Voisins', group_id: GROUP }))?.to).toBe(`/groupes/${GROUP}`)
  })
  it('recette partagée → la fiche ; recette supprimée → rien à ouvrir', () => {
    expect(notificationView(note('recipe_shared', { from_name: 'Eve', title: 'Tarte', recipe_id: ID }))).toMatchObject({ params: { name: 'Eve', title: 'Tarte' }, to: `/recettes/${ID}` })
    expect(notificationView(note('recipe_deleted', { author_name: 'Eve', title: 'Tarte', recipe_id: ID }))?.to).toBeNull()
  })
  it('un identifiant mal formé supprime le lien (jamais de chemin construit avec une valeur douteuse)', () => {
    expect(notificationView(note('recipe_shared', { recipe_id: '../../admin', title: 'x' }))?.to).toBeNull()
    expect(notificationView(note('friend_accepted', { user_id: 'nope' }))?.to).toBe('/amis')
    expect(notificationView(note('group_deleted', { group_name: 'V' }))?.to).toBe('/groupes')
  })
  it('un genre inconnu est masqué', () => {
    expect(notificationView(note('brand_new_type', { x: 1 }))).toBeNull()
  })
  it('unreadIds ne garde que les non lues', () => {
    expect(unreadIds([{ id: 'a', read: true }, { id: 'b', read: false }])).toEqual(['b'])
  })
})

describe('actions selon le statut d\'amitié', () => {
  it('une action par statut, aucune sur soi-même', () => {
    expect(profileFriendAction('none', false)).toBe('send')
    expect(profileFriendAction('friends', false)).toBe('remove')
    expect(profileFriendAction('request_sent', false)).toBe('cancel')
    expect(profileFriendAction('request_received', false)).toBe('respond')
    expect(profileFriendAction('request_declined', false)).toBe('resend')
    expect(profileFriendAction('none', true)).toBe('none')
  })
  it('relance possible seulement une fois le délai écoulé', () => {
    const now = new Date('2026-10-24T12:00:00Z')
    expect(canRetryRequest({ status: 'pending', retryAfter: null }, now)).toBe(false)
    expect(canRetryRequest({ status: 'declined', retryAfter: '2026-10-26T00:00:00Z' }, now)).toBe(false)
    expect(canRetryRequest({ status: 'declined', retryAfter: '2026-10-24T11:59:59Z' }, now)).toBe(true)
    expect(canRetryRequest({ status: 'declined', retryAfter: null }, now)).toBe(true)
  })
  it('recherche à partir de 3 lettres', () => {
    expect(canSearchUsers('ev')).toBe(false)
    expect(canSearchUsers('  ev ')).toBe(false)
    expect(canSearchUsers('eve')).toBe(true)
  })
})

describe('actions de groupe selon le rôle', () => {
  const row = (role: string): MyGroupRow => ({ group_id: GROUP, name: 'V', theme: {}, role, creator_name: 'Eve', member_count: 3, joined_at: 'x', created_at: 'x' })
  it('le créateur gère tout et ne part pas', () => {
    expect(groupRights(toMyGroup(row('creator')))).toEqual({
      canRename: true, canEditTheme: true, canInvite: true, canCreateLink: true, canCancelInvitations: true, canDelete: true, canLeave: false
    })
  })
  it('un membre peut seulement partir', () => {
    expect(groupRights(toMyGroup(row('member')))).toEqual({
      canRename: false, canEditTheme: false, canInvite: false, canCreateLink: false, canCancelInvitations: false, canDelete: false, canLeave: true
    })
  })
  it('groupe inconnu : rien', () => {
    expect(Object.values(groupRights(null)).every(value => value === false)).toBe(true)
  })
  it('retirer ou transférer : créateur seulement, jamais sur soi ni sur le créateur', () => {
    expect(memberRights(true, 'me', { userId: 'x', role: 'member' })).toEqual({ canRemove: true, canTransfer: true })
    expect(memberRights(true, 'me', { userId: 'me', role: 'creator' })).toEqual({ canRemove: false, canTransfer: false })
    expect(memberRights(false, 'me', { userId: 'x', role: 'member' })).toEqual({ canRemove: false, canTransfer: false })
  })
  it('chemin d\'un lien d\'invitation', () => {
    expect(inviteLinkPath('a'.repeat(64))).toBe(`/rejoindre/${'a'.repeat(64)}`)
  })
})

describe('rangement d\'une recette ajoutée (cookbook_entries.category_id)', () => {
  const CATEGORY = '33333333-3333-4333-8333-333333333333'
  const mockUpdate = (data: unknown, error: unknown = null) => {
    const select = vi.fn().mockResolvedValue({ data, error })
    const eq = vi.fn(() => ({ select }))
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    return { client: { from } as unknown as SupabaseClient<Database>, from, update, eq }
  }
  it('met à jour la catégorie de MON entrée', async () => {
    const { client, from, update, eq } = mockUpdate([{ recipe_id: ID }])
    await setEntryCategory(client, { recipeId: ID, categoryId: CATEGORY })
    expect(from).toHaveBeenCalledWith('cookbook_entries')
    expect(update).toHaveBeenCalledWith({ category_id: CATEGORY })
    expect(eq).toHaveBeenCalledWith('recipe_id', ID)
  })
  it('null = sans catégorie', async () => {
    const { client, update } = mockUpdate([{ recipe_id: ID }])
    await setEntryCategory(client, { recipeId: ID, categoryId: null })
    expect(update).toHaveBeenCalledWith({ category_id: null })
  })
  it('recette absente de mon carnet : P0002 ; refus de la base : relancé tel quel', async () => {
    await expect(setEntryCategory(mockUpdate([]).client, { recipeId: ID, categoryId: null })).rejects.toMatchObject({ code: 'P0002' })
    await expect(setEntryCategory(mockUpdate(null, { code: '42501', message: 'refus' }).client, { recipeId: ID, categoryId: CATEGORY })).rejects.toMatchObject({ code: '42501' })
  })
  it('entrée invalide refusée avant tout appel', async () => {
    const { client, from } = mockUpdate([])
    await expect(setEntryCategory(client, { recipeId: 'nope', categoryId: null })).rejects.toThrow(/invalides/)
    expect(from).not.toHaveBeenCalled()
  })
  it('lecture de ma catégorie : valeur, null ou absente', async () => {
    const make = (data: unknown) => {
      const maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
      return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) } as unknown as SupabaseClient<Database>
    }
    expect(await getEntryCategory(make({ category_id: CATEGORY }), ID)).toBe(CATEGORY)
    expect(await getEntryCategory(make({ category_id: null }), ID)).toBeNull()
    expect(await getEntryCategory(make(null), ID)).toBeUndefined()
  })
})
