import { describe, expect, it } from 'vitest'
import { localizedCookbookTitle, otherTitleLocale, parseTitleI18n, toTitleLocale } from '../../shared/utils/cookbookTitle'
import { displaySiteName } from '../../shared/utils/siteName'
import { toFriend, toUserProfile } from '../../shared/utils/social'

/** Titre du carnet bilingue (migration 0034) : la langue de l'interface choisit la traduction, sinon le titre d'origine. */
describe('parseTitleI18n', () => {
  it('lit fr / en, ignore le reste', () => {
    expect(parseTitleI18n({ fr: 'Recettes des Boultons', en: 'The Boultons\' Recipes' })).toEqual({ fr: 'Recettes des Boultons', en: 'The Boultons\' Recipes' })
    expect(parseTitleI18n({ fr: '  Chez Mamie  ', de: 'Bei Oma' })).toEqual({ fr: 'Chez Mamie' })
  })
  it('tolère l\'absence de la colonne, null, texte, tableau, valeurs vides ou non textuelles', () => {
    for (const value of [undefined, null, 'x', 3, [], { fr: '', en: '   ' }, { fr: 1, en: null }]) expect(parseTitleI18n(value)).toEqual({})
  })
})

describe('localizedCookbookTitle', () => {
  const i18n = { fr: 'Recettes des Boultons', en: 'The Boultons\' Recipes' }
  it('la traduction de la langue courante', () => {
    expect(localizedCookbookTitle('Recettes des Boultons', i18n, 'fr')).toBe('Recettes des Boultons')
    expect(localizedCookbookTitle('Recettes des Boultons', i18n, 'en')).toBe('The Boultons\' Recipes')
  })
  it('repli sur le titre d\'origine quand la langue manque ou que la colonne est absente', () => {
    expect(localizedCookbookTitle('Recettes des Boultons', { fr: 'Recettes des Boultons' }, 'en')).toBe('Recettes des Boultons')
    expect(localizedCookbookTitle('Recettes des Boultons', undefined, 'en')).toBe('Recettes des Boultons')
    expect(localizedCookbookTitle('  Chez Mamie ', null, 'fr')).toBe('Chez Mamie')
  })
  it('null sans titre ; une langue inconnue vaut le français', () => {
    expect(localizedCookbookTitle(null, null, 'en')).toBeNull()
    expect(localizedCookbookTitle('', {}, 'fr')).toBeNull()
    expect(localizedCookbookTitle('x', { fr: 'FR', en: 'EN' }, 'de')).toBe('FR')
  })
})

describe('langues', () => {
  it('toTitleLocale / otherTitleLocale', () => {
    expect(toTitleLocale('en')).toBe('en')
    expect(toTitleLocale('fr')).toBe('fr')
    expect(toTitleLocale(undefined)).toBe('fr')
    expect(otherTitleLocale('fr')).toBe('en')
    expect(otherTitleLocale('en')).toBe('fr')
  })
})

describe('nom du site et lignes des RPC', () => {
  it('le nom du site suit le titre localisé ; Family Cookbook sur une page neutre ou sans titre', () => {
    const title = localizedCookbookTitle('Recettes des Boultons', { en: 'The Boultons\' Recipes' }, 'en')
    expect(displaySiteName({ v2: true, path: '/en/recettes', cookbookTitle: title, editionName: 'x' })).toBe('The Boultons\' Recipes')
    expect(displaySiteName({ v2: true, path: '/en/r/abc', cookbookTitle: title, editionName: 'x' })).toBe('Family Cookbook')
    expect(displaySiteName({ v2: true, path: '/', cookbookTitle: null, editionName: 'x' })).toBe('Family Cookbook')
  })
  it('amis et profil : la traduction est lue, et reste vide si 0034 n\'est pas appliquée', () => {
    const friend = { friendship_id: 'f', user_id: 'u', display_name: 'A', cookbook_title: 'Chez A', since: null }
    expect(toFriend(friend).cookbookTitleI18n).toEqual({})
    expect(toFriend({ ...friend, cookbook_title_i18n: { en: 'At A\'s' } }).cookbookTitleI18n).toEqual({ en: 'At A\'s' })
    const profile = { user_id: 'u', display_name: 'A', cookbook_title: 'Chez A', cookbook_title_i18n: { en: 'At A\'s' }, is_self: false, friendship_status: 'none', friendship_id: null, common_groups: [], readable_recipe_count: 0 }
    expect(toUserProfile(profile).cookbookTitleI18n).toEqual({ en: 'At A\'s' })
    expect(toUserProfile({ ...profile, cookbook_title_i18n: undefined }).cookbookTitleI18n).toEqual({})
  })
})
