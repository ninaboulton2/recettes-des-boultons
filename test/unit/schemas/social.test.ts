import { describe, expect, it } from 'vitest'
import {
  createGroupInputSchema,
  deleteAccountInputSchema,
  displayNameSchema,
  inviteToGroupInputSchema,
  listNotificationsInputSchema,
  markNotificationsReadInputSchema,
  redeemInviteLinkInputSchema,
  respondFriendRequestInputSchema,
  searchUsersInputSchema,
  sendFriendRequestInputSchema,
  themeObjectSchema,
  transferGroupOwnershipInputSchema,
  updateGroupThemeInputSchema,
  updateMyProfileInputSchema
} from '#shared/schemas/social'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('schémas sociaux : amis', () => {
  it('searchUsers : au moins 3 lettres (comme la base)', () => {
    expect(searchUsersInputSchema.parse({ query: '  Eve ' })).toEqual({ query: 'Eve' })
    expect(searchUsersInputSchema.safeParse({ query: 'Ev' }).success).toBe(false)
    expect(searchUsersInputSchema.safeParse({ query: '   ' }).success).toBe(false)
    expect(searchUsersInputSchema.safeParse({}).success).toBe(false)
  })

  it('sendFriendRequest / respondFriendRequest : identifiants valides, choix booléen obligatoire', () => {
    expect(sendFriendRequestInputSchema.safeParse({ userId: A }).success).toBe(true)
    expect(sendFriendRequestInputSchema.safeParse({ userId: 'x' }).success).toBe(false)
    expect(respondFriendRequestInputSchema.parse({ friendshipId: A, accept: false })).toEqual({ friendshipId: A, accept: false })
    expect(respondFriendRequestInputSchema.safeParse({ friendshipId: A }).success).toBe(false)
    expect(respondFriendRequestInputSchema.safeParse({ friendshipId: A, accept: 'oui' }).success).toBe(false)
  })
})

describe('schémas sociaux : groupes', () => {
  it('createGroup : nom nettoyé, 1 à 60 caractères', () => {
    expect(createGroupInputSchema.parse({ name: '  Les Voisins ' })).toEqual({ name: 'Les Voisins' })
    expect(createGroupInputSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(createGroupInputSchema.safeParse({ name: 'x'.repeat(61) }).success).toBe(false)
    expect(createGroupInputSchema.safeParse({ name: 'x'.repeat(60) }).success).toBe(true)
  })

  it('thème : un objet de 4000 caractères au plus', () => {
    expect(themeObjectSchema.safeParse({ preset: 'ocean', primary: '#336699' }).success).toBe(true)
    expect(themeObjectSchema.safeParse([1, 2]).success).toBe(false)
    expect(themeObjectSchema.safeParse('ocean').success).toBe(false)
    expect(themeObjectSchema.safeParse(null).success).toBe(false)
    expect(themeObjectSchema.safeParse({ x: 'y'.repeat(4100) }).success).toBe(false)
    expect(updateGroupThemeInputSchema.safeParse({ groupId: A, theme: {} }).success).toBe(true)
    expect(updateGroupThemeInputSchema.safeParse({ groupId: A, theme: [] }).success).toBe(false)
  })

  it('invitations, transfert, lien : identifiants et jeton de 64 caractères hexadécimaux', () => {
    expect(inviteToGroupInputSchema.safeParse({ groupId: A, userId: B }).success).toBe(true)
    expect(inviteToGroupInputSchema.safeParse({ groupId: A }).success).toBe(false)
    expect(transferGroupOwnershipInputSchema.safeParse({ groupId: A, newCreatorId: B }).success).toBe(true)
    expect(transferGroupOwnershipInputSchema.safeParse({ groupId: A, newCreatorId: 'nope' }).success).toBe(false)
    const token = 'ab'.repeat(32)
    expect(redeemInviteLinkInputSchema.parse({ token: ` ${token} ` })).toEqual({ token })
    expect(redeemInviteLinkInputSchema.safeParse({ token: 'ab'.repeat(31) }).success).toBe(false)
    expect(redeemInviteLinkInputSchema.safeParse({ token: 'zz'.repeat(32) }).success).toBe(false)
  })
})

describe('schémas sociaux : notifications', () => {
  it('listNotifications : 30 par défaut, 100 au plus, date ISO', () => {
    expect(listNotificationsInputSchema.parse({})).toEqual({ limit: 30 })
    expect(listNotificationsInputSchema.parse({ limit: '10', before: '2026-10-24T10:00:00Z' })).toEqual({ limit: 10, before: '2026-10-24T10:00:00Z' })
    expect(listNotificationsInputSchema.safeParse({ limit: 101 }).success).toBe(false)
    expect(listNotificationsInputSchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(listNotificationsInputSchema.safeParse({ before: 'hier' }).success).toBe(false)
  })

  it('markNotificationsRead : liste d\'identifiants ou rien (= toutes)', () => {
    expect(markNotificationsReadInputSchema.parse({})).toEqual({})
    expect(markNotificationsReadInputSchema.parse({ ids: null })).toEqual({ ids: null })
    expect(markNotificationsReadInputSchema.safeParse({ ids: [A, B] }).success).toBe(true)
    expect(markNotificationsReadInputSchema.safeParse({ ids: ['x'] }).success).toBe(false)
    expect(markNotificationsReadInputSchema.safeParse({ ids: Array.from({ length: 201 }, () => A) }).success).toBe(false)
  })
})

describe('schémas sociaux : profil et compte', () => {
  it('pseudonyme : 1 à 60 caractères, jamais d\'« @ »', () => {
    expect(displayNameSchema.parse('  Nina ')).toBe('Nina')
    expect(displayNameSchema.safeParse('nina@exemple.fr').success).toBe(false)
    expect(displayNameSchema.safeParse('  ').success).toBe(false)
    expect(displayNameSchema.safeParse('x'.repeat(61)).success).toBe(false)
  })

  it('updateMyProfile : tout est facultatif, null efface, validations', () => {
    expect(updateMyProfileInputSchema.parse({})).toEqual({})
    expect(updateMyProfileInputSchema.parse({ cookbookTitle: null, themeSettings: null, activeThemeGroupId: null }))
      .toEqual({ cookbookTitle: null, themeSettings: null, activeThemeGroupId: null })
    expect(updateMyProfileInputSchema.safeParse({ cookbookTitle: 'x'.repeat(81) }).success).toBe(false)
    expect(updateMyProfileInputSchema.safeParse({ themeSettings: [] }).success).toBe(false)
    expect(updateMyProfileInputSchema.safeParse({ activeThemeGroupId: 'x' }).success).toBe(false)
    expect(updateMyProfileInputSchema.safeParse({ discoverable: 'oui' }).success).toBe(false)
  })

  it('deleteAccount : l\'adresse e-mail de confirmation est obligatoire', () => {
    expect(deleteAccountInputSchema.parse({ confirmEmail: ' nina@exemple.fr ' })).toEqual({ confirmEmail: 'nina@exemple.fr' })
    expect(deleteAccountInputSchema.safeParse({ confirmEmail: 'pas un mail' }).success).toBe(false)
    expect(deleteAccountInputSchema.safeParse({}).success).toBe(false)
  })
})
