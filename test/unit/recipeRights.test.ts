import { describe, expect, it } from 'vitest'
import {
  hasUsage,
  provenanceOf,
  recipeRights,
  reshareLevels,
  sharingErrorKey,
  toRecipeAccess,
  type RecipeAccess,
  type RecipeAccessRow
} from '#shared/utils/recipeRights'
import { filterRecipients, mergeRecipients } from '#shared/utils/recipients'
import { sharedToRecipe } from '#shared/utils/sharedRecipe'
import { sharedRecipeSchema } from '#shared/schemas/sharing'

const row = (over: Partial<RecipeAccessRow> = {}): RecipeAccessRow => ({
  permission: 'copy', explicit_permission: null, in_cookbook: false, owner_id: 'o', owner_name: 'Nina', visibility: 'groups',
  category_id: null, copied_from: null, copied_from_title: null, has_share_link: false, ...over
})
const rights = (over: Partial<RecipeAccessRow> = {}) => recipeRights(toRecipeAccess(row(over)))

describe('toRecipeAccess : lecture défensive de recipe_access', () => {
  it('valeurs inconnues = le plus restrictif', () => {
    const access = toRecipeAccess(row({ permission: 'root', explicit_permission: 'admin', visibility: 'public' }))
    expect(access.permission).toBe('read')
    expect(access.explicitPermission).toBeNull()
    expect(access.visibility).toBe('groups')
  })
  it('garde l’original d’une copie seulement s’il est fourni', () => {
    const access = toRecipeAccess(row({ copied_from: 'x', copied_from_title: 'Tarte' }))
    expect(access.copiedFrom).toBe('x')
    expect(access.copiedFromTitle).toBe('Tarte')
    expect(toRecipeAccess(row()).copiedFrom).toBeNull()
  })
})

describe('boutons affichés selon le niveau de droit', () => {
  it('auteur : modifier, supprimer, partager (gérer), pas de copie ni d’ajout au carnet', () => {
    const r = rights({ permission: 'author', explicit_permission: null, in_cookbook: false })
    expect(r).toMatchObject({
      isOwner: true, canEdit: true, canDelete: true, canManageSharing: true, canShare: true,
      canCopy: false, canAddToCookbook: false, canRemoveFromCookbook: false, canReshare: false, maxReshare: null
    })
  })
  it('edit_original : modifier oui, supprimer et gérer le partage non, repartage jusqu’à copy', () => {
    const r = rights({ permission: 'edit_original', explicit_permission: 'edit_original' })
    expect(r).toMatchObject({ canEdit: true, canDelete: false, canManageSharing: false, canCopy: true, canReshare: true, maxReshare: 'copy', canShare: true })
  })
  it('copy explicite : copie et repartage copy, pas de modification', () => {
    const r = rights({ permission: 'copy', explicit_permission: 'copy' })
    expect(r).toMatchObject({ canEdit: false, canDelete: false, canCopy: true, canReshare: true, maxReshare: 'copy' })
  })
  it('read explicite : ni copie ni modification ; repartage read seulement', () => {
    const r = rights({ permission: 'read', explicit_permission: 'read' })
    expect(r).toMatchObject({ canEdit: false, canCopy: false, canReshare: true, maxReshare: 'read', canShare: true })
  })
  it('partage implicite « mes groupes » : copie oui, repartage non (seul un droit explicite se repartage)', () => {
    const r = rights({ permission: 'copy', explicit_permission: null })
    expect(r).toMatchObject({ canCopy: true, canReshare: false, maxReshare: null, canShare: false, canManageSharing: false })
  })
  it('ajouter / retirer : l’un ou l’autre selon le carnet, jamais pour l’auteur', () => {
    expect(rights({ permission: 'copy', in_cookbook: false })).toMatchObject({ canAddToCookbook: true, canRemoveFromCookbook: false })
    expect(rights({ permission: 'copy', in_cookbook: true })).toMatchObject({ canAddToCookbook: false, canRemoveFromCookbook: true })
    expect(rights({ permission: 'author', in_cookbook: true })).toMatchObject({ canAddToCookbook: false, canRemoveFromCookbook: false })
  })
  it('un niveau de repartage ne dépasse jamais le sien et n’offre jamais edit_original', () => {
    expect(reshareLevels(null)).toEqual([])
    expect(reshareLevels('read')).toEqual(['read'])
    expect(reshareLevels('copy')).toEqual(['read', 'copy'])
    for (const permission of ['read', 'copy', 'edit_original'] as const) {
      const max = recipeRights({ ...toRecipeAccess(row()), permission, explicitPermission: permission } as RecipeAccess).maxReshare
      expect(reshareLevels(max)).not.toContain('edit_original')
    }
  })
})

describe('provenance des cartes du carnet', () => {
  it('« à moi », « ajoutée de X », « copie de … »', () => {
    expect(provenanceOf({ relation: 'owned', authorName: 'Moi' })).toEqual({ kind: 'mine' })
    expect(provenanceOf({ relation: 'added', authorName: 'Léa' })).toEqual({ kind: 'added', authorName: 'Léa' })
    expect(provenanceOf({ relation: 'owned', authorName: 'Moi' }, { title: 'Tarte' })).toEqual({ kind: 'copy', originalTitle: 'Tarte' })
  })
  it('une copie dont l’original n’est plus lisible : « copie » sans titre', () => {
    expect(provenanceOf({ relation: 'owned', authorName: null }, { title: null })).toEqual({ kind: 'copy', originalTitle: null })
  })
  it('une recette ajoutée reste « ajoutée » même si elle est elle-même une copie', () => {
    expect(provenanceOf({ relation: 'added', authorName: null }, { title: 'X' }).kind).toBe('added')
  })
})

describe('avertissement avant suppression', () => {
  it('seulement quand quelqu’un d’autre l’utilise', () => {
    expect(hasUsage({ cookbookCount: 0, copyCount: 0 })).toBe(false)
    expect(hasUsage({ cookbookCount: 2, copyCount: 0 })).toBe(true)
    expect(hasUsage({ cookbookCount: 0, copyCount: 1 })).toBe(true)
  })
})

describe('messages d’erreur connus (§ 20.9)', () => {
  it('un SQLSTATE → une clé i18n', () => {
    const key = (code: string) => sharingErrorKey({ code, message: 'x' })
    expect(key('53400')).toBe('errors.sharing.quota')
    expect(key('54000')).toBe('errors.sharing.rate')
    expect(key('42501')).toBe('errors.sharing.forbidden')
    expect(key('P0002')).toBe('errors.sharing.notFound')
    expect(key('22023')).toBe('errors.sharing.invalid')
    expect(key('23505')).toBe('errors.sharing.duplicate')
  })
  it('repli générique : jamais le détail technique', () => {
    for (const error of [null, undefined, 'x', new Error('boum'), { code: 'XX000', message: 'relation "recipes" does not exist' }]) {
      expect(sharingErrorKey(error)).toBe('errors.generic')
    }
  })
})

describe('destinataires d’un partage', () => {
  const friends = [{ userId: 'a', displayName: 'Zoé' }, { userId: 'b', displayName: 'Alice' }]
  const groups = [
    { group: { groupId: 'g1', name: 'Famille' }, members: [{ userId: 'b', displayName: 'Alice' }, { userId: 'c', displayName: 'Émile' }, { userId: 'me', displayName: 'Moi' }] },
    { group: { groupId: 'g2', name: 'Amis du club' }, members: [{ userId: 'c', displayName: 'Émile' }] }
  ]
  it('fusionne amis et membres, sans doublon, sans moi ni l’auteur, triés par nom', () => {
    const people = mergeRecipients(friends, groups, { selfId: 'me', excludeUserIds: ['a'] })
    expect(people.map(person => person.userId)).toEqual(['b', 'c'])
    expect(people[0]).toMatchObject({ isFriend: true, groupNames: ['Famille'] })
    expect(people[1]).toMatchObject({ isFriend: false, groupNames: ['Famille', 'Amis du club'] })
  })
  it('filtre sans accents ni casse', () => {
    const people = mergeRecipients(friends, groups, { selfId: 'me' })
    expect(filterRecipients(people, 'emile').map(person => person.userId)).toEqual(['c'])
    expect(filterRecipients(people, '  ').length).toBe(people.length)
  })
})

describe('page publique : réponse de get_shared_recipe → fiche', () => {
  const shared = {
    title: 'Tarte', description: null, category: 'desserts', prep_time: 10, cook_time: 30, servings: 4, tags: ['fruit'], notes: null,
    lang: 'fr', has_photo: false, author_name: 'Nina',
    sections: [
      { name: 'Pâte', type: 'ingredients', order_index: 0, ingredients: [{ name: 'farine', amount: '200', amount_num: 200, unit: 'g', unit_code: 'g', optional: false }], instructions: [] },
      { name: '', type: 'instructions', order_index: 1, ingredients: [], instructions: ['Cuire.'] }
    ],
    translation: null
  }
  it('le schéma strict refuse une clé en trop (identifiant, e-mail…)', () => {
    expect(sharedRecipeSchema.safeParse(shared).success).toBe(true)
    expect(sharedRecipeSchema.safeParse({ ...shared, owner_id: 'x' }).success).toBe(false)
    expect(sharedRecipeSchema.safeParse({ ...shared, email: 'a@b.c' }).success).toBe(false)
  })
  it('construit une recette sans identifiant réel de la base', () => {
    const recipe = sharedToRecipe(sharedRecipeSchema.parse(shared), 'shared:t')
    expect(recipe.id).toBe('shared:t')
    expect(recipe.photoPath).toBeNull()
    expect(recipe.sections).toHaveLength(2)
    expect(recipe.sections[0]!.ingredients[0]).toMatchObject({ name: 'farine', unitCode: 'g', amountNum: 200 })
    expect(recipe.sections[1]!.instructions[0]!.content).toBe('Cuire.')
    expect(recipe.description).toBe('')
  })
})
