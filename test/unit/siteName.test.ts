import { describe, expect, it } from 'vitest'
import { BRAND_NAME } from '../../shared/brand'
import { boultonsEdition } from '../../shared/editions/boultons'
import { genericEdition } from '../../shared/editions/generic'
import { resolveTheme } from '../../shared/themes'
import { displaySiteName, isNeutralSitePath } from '../../shared/utils/siteName'

/** Nom du site (v2) : « Titre du carnet » du profil partout, « Family Cookbook » sur les pages neutres. */
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
  const base = { v2: true, editionName: 'Recettes des Boultons' }

  it('v2 : le titre du carnet sur les pages normales, Family Cookbook sur les pages neutres', () => {
    expect(displaySiteName({ ...base, path: '/', cookbookTitle: 'Chez Mamie' })).toBe('Chez Mamie')
    expect(displaySiteName({ ...base, path: '/recettes/x', cookbookTitle: '  Chez Mamie ' })).toBe('Chez Mamie')
    expect(displaySiteName({ ...base, path: '/r/x', cookbookTitle: 'Chez Mamie' })).toBe(BRAND_NAME)
    expect(displaySiteName({ ...base, path: '/en/mentions-legales', cookbookTitle: 'Chez Mamie' })).toBe(BRAND_NAME)
  })

  it('v2 : sans titre (vide, espaces, null, visiteur), Family Cookbook, même avec le thème Boultons', () => {
    for (const cookbookTitle of ['', '   ', null, undefined]) {
      expect(displaySiteName({ ...base, path: '/', cookbookTitle })).toBe(BRAND_NAME)
    }
  })

  it('v1 : rien ne change, même sur un chemin « neutre »', () => {
    expect(displaySiteName({ v2: false, path: '/r/x', cookbookTitle: 'Chez Mamie', editionName: 'Recettes des Boultons' })).toBe('Recettes des Boultons')
  })
})

describe('le thème ne porte plus le nom', () => {
  const nameOf = (theme: unknown) => resolveTheme(theme).edition.brand.name

  it('un ancien « name » dans le JSON du thème est ignoré, quel que soit le préréglage', () => {
    for (const preset of ['terracotta', 'olive', 'boultons']) {
      expect(nameOf({ preset, name: 'Chez Mamie' }), preset).toEqual(nameOf({ preset }))
    }
    expect(nameOf({ preset: 'custom', primary: '#aa4466', name: 'Chez Mamie' }).fr).toBe(BRAND_NAME)
  })

  it('noms de repli des préréglages (v1 et valeur par défaut)', () => {
    expect(nameOf({ preset: 'terracotta' })).toEqual({ fr: BRAND_NAME, en: BRAND_NAME })
    expect(nameOf({ preset: 'boultons' }).fr).toBe('Recettes des Boultons')
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
