import { describe, expect, it } from 'vitest'
import { BRAND_NAME } from '../../shared/brand'
import { boultonsEdition } from '../../shared/editions/boultons'
import { genericEdition } from '../../shared/editions/generic'
import { resolveTheme } from '../../shared/themes'
import { displaySiteName, isNeutralSitePath } from '../../shared/utils/siteName'

/** Nom du site (v2) : « Nom affiché » du thème partout, « Family Cookbook » sur les pages neutres. */
describe('isNeutralSitePath', () => {
  it('lien public de partage, avec ou sans préfixe de langue', () => {
    expect(isNeutralSitePath('/r/0b1c2d3e-0000-4000-8000-000000000000')).toBe(true)
    expect(isNeutralSitePath('/en/r/0b1c2d3e-0000-4000-8000-000000000000')).toBe(true)
    expect(isNeutralSitePath('/r')).toBe(true)
  })

  it('pages légales et compte supprimé', () => {
    for (const path of ['/mentions-legales', '/confidentialite', '/conditions', '/cookies', '/compte-supprime', '/en/cookies', '/cookies/']) {
      expect(isNeutralSitePath(path), path).toBe(true)
    }
  })

  it('les autres pages suivent le thème (dont une recette ou « recherche » qui commencent par r)', () => {
    for (const path of ['/', '/en', '/recettes', '/recettes/abc', '/reglages', '/rejoindre/x', '/en/recettes', '/groupes/1', '/rapport']) {
      expect(isNeutralSitePath(path), path).toBe(false)
    }
  })

  it('ignore la requête et l\'ancre', () => {
    expect(isNeutralSitePath('/r/abc?x=1')).toBe(true)
    expect(isNeutralSitePath('/recettes?r=1')).toBe(false)
  })
})

describe('displaySiteName', () => {
  it('v2 : le nom du thème sur les pages normales, Family Cookbook sur les pages neutres', () => {
    expect(displaySiteName({ v2: true, path: '/', themeName: 'Chez Mamie' })).toBe('Chez Mamie')
    expect(displaySiteName({ v2: true, path: '/recettes/x', themeName: 'Chez Mamie' })).toBe('Chez Mamie')
    expect(displaySiteName({ v2: true, path: '/r/x', themeName: 'Chez Mamie' })).toBe(BRAND_NAME)
    expect(displaySiteName({ v2: true, path: '/en/mentions-legales', themeName: 'Chez Mamie' })).toBe(BRAND_NAME)
  })

  it('v1 : rien ne change, même sur un chemin « neutre »', () => {
    expect(displaySiteName({ v2: false, path: '/r/x', themeName: 'Recettes des Boultons' })).toBe('Recettes des Boultons')
  })
})

describe('nom du thème → nom de l\'édition', () => {
  const nameOf = (theme: unknown) => resolveTheme(theme).edition.brand.name

  it('sans nom : Family Cookbook (thème par défaut) et Recettes des Boultons (préréglage Boultons)', () => {
    expect(nameOf({ preset: 'terracotta' })).toEqual({ fr: BRAND_NAME, en: BRAND_NAME })
    expect(nameOf({ preset: 'boultons' }).fr).toBe('Recettes des Boultons')
  })

  it('« Nom affiché » remplace le nom, quel que soit le préréglage', () => {
    for (const preset of ['terracotta', 'olive', 'boultons']) {
      expect(nameOf({ preset, name: 'Chez Mamie' }), preset).toEqual({ fr: 'Chez Mamie', en: 'Chez Mamie' })
    }
    expect(nameOf({ preset: 'custom', primary: '#aa4466', name: 'Chez Mamie' }).fr).toBe('Chez Mamie')
  })

  it('un nom refusé par la liste blanche laisse le nom du produit', () => {
    expect(nameOf({ preset: 'olive', name: '<script>' }).fr).toBe(BRAND_NAME)
  })
})

describe('logo : la cocotte est propre au thème Les Boultons', () => {
  it('l\'édition générique n\'a pas de cocotte (toque), les Boultons gardent la leur', () => {
    expect(genericEdition.brand.logo).toBeNull()
    expect(boultonsEdition.brand.logo).toBe('/images/logo.png')
    expect(genericEdition.brand.icons.png32).not.toContain('boultons')
  })

  it('tout thème autre que Boultons (préréglage ou libre) résout sans cocotte', () => {
    for (const theme of [{ preset: 'terracotta' }, { preset: 'olive' }, { preset: 'custom', primary: '#aa4466' }, { preset: 'terracotta', name: 'Chez Mamie' }, null, 'n\'importe quoi']) {
      const brand = resolveTheme(theme).edition.brand
      expect(brand.logo, JSON.stringify(theme)).toBeNull()
      expect(JSON.stringify(brand.icons), JSON.stringify(theme)).not.toContain('boultons')
    }
    expect(resolveTheme({ preset: 'boultons' }).edition.brand.logo).toBe('/images/logo.png')
  })
})
