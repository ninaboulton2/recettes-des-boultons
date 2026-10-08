import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EDITION, EDITION_IDS, EDITIONS, SHADES, getEdition, localize, resolveEditionId } from '../../shared/editions'
import { editionThemeCss, neutralShade } from '../../shared/editions/theme'
import { contrastRatio } from '../../shared/utils/color'
import { RECIPE_CATEGORIES } from '../../shared/types'

/** Fichier servi depuis public/ (chemin absolu d'URL, ex. `/images/logo.png`). */
const publicFile = (path: string) => existsSync(resolve(process.cwd(), 'public', path.replace(/^\//, '')))

const AA = 4.5
const WHITE = '#ffffff'

describe('color', () => {
  it('contraste WCAG : valeurs de référence', () => {
    expect(contrastRatio('#000000', WHITE)).toBeCloseTo(21, 5)
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5)
    expect(contrastRatio('#3d8a94', WHITE)).toBeCloseTo(3.99, 2)
    // oklch : blanc et noir
    expect(contrastRatio('oklch(100% 0 0)', '#000000')).toBeCloseTo(21, 1)
  })

  it('refuse une couleur inconnue', () => {
    expect(() => contrastRatio('rebeccapurple', WHITE)).toThrow()
  })
})

describe('éditions : sélection', () => {
  it('Boultons par défaut (variable absente, vide ou inconnue)', () => {
    expect(DEFAULT_EDITION).toBe('boultons')
    expect(resolveEditionId(undefined)).toBe('boultons')
    expect(resolveEditionId('')).toBe('boultons')
    expect(resolveEditionId('autre')).toBe('boultons')
    expect(getEdition(undefined).id).toBe('boultons')
  })

  it('générique (casse et espaces tolérés)', () => {
    expect(resolveEditionId('generic')).toBe('generic')
    expect(resolveEditionId(' GENERIC ')).toBe('generic')
    expect(getEdition('generic').id).toBe('generic')
  })

  it('le registre couvre toutes les éditions, chacune avec son propre identifiant', () => {
    expect(Object.keys(EDITIONS).sort()).toEqual([...EDITION_IDS].sort())
    for (const id of EDITION_IDS) expect(EDITIONS[id].id).toBe(id)
  })

  it('localize : langue demandée, repli français', () => {
    const text = { fr: 'Bonjour', en: 'Hello' }
    expect(localize(text, 'en')).toBe('Hello')
    expect(localize(text, 'fr')).toBe('Bonjour')
    expect(localize(text, 'de')).toBe('Bonjour')
    expect(localize(text, undefined)).toBe('Bonjour')
  })
})

describe.each(EDITION_IDS.map(id => [id, EDITIONS[id]] as const))('édition %s', (_id, edition) => {
  it('textes de marque renseignés en français et en anglais', () => {
    for (const text of [edition.brand.name, edition.brand.tagline, edition.brand.homeDescription]) {
      expect(text.fr.trim()).not.toBe('')
      expect(text.en.trim()).not.toBe('')
    }
    expect(edition.brand.shortName.trim()).not.toBe('')
    if (edition.home.heroImage) {
      expect(edition.home.heroImage.alt.fr.trim()).not.toBe('')
      expect(edition.home.heroImage.alt.en.trim()).not.toBe('')
    }
  })

  it('palette complète (11 nuances hex)', () => {
    for (const shade of SHADES) expect(edition.theme.primary[shade]).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('images existantes dans public/ et une illustration par catégorie', () => {
    expect(publicFile(edition.brand.logo)).toBe(true)
    if (edition.home.heroImage) expect(publicFile(edition.home.heroImage.src)).toBe(true)
    if (edition.categoryImages) {
      expect(Object.keys(edition.categoryImages).sort()).toEqual([...RECIPE_CATEGORIES].sort())
      for (const src of Object.values(edition.categoryImages)) expect(publicFile(src), src).toBe(true)
    }
  })

  it('contrastes AA de `--ui-primary` en clair et en sombre', () => {
    const { primary, neutral, primaryShade } = edition.theme
    const light = primary[primaryShade.light]
    const dark = primary[primaryShade.dark]
    // Clair : texte blanc sur bouton primary, texte primary sur fond blanc.
    expect(contrastRatio(WHITE, light)).toBeGreaterThanOrEqual(AA)
    // Sombre : fond neutre 900 (--ui-bg) et texte inversé (neutre 900) sur primary.
    expect(contrastRatio(dark, neutralShade(neutral, 900))).toBeGreaterThanOrEqual(AA)
  })

  it('nom du site lisible en sombre (≥ 3:1, grand corps)', () => {
    if (!edition.brand.nameColor) return
    expect(contrastRatio(edition.brand.nameColor.dark, neutralShade(edition.theme.neutral, 900))).toBeGreaterThanOrEqual(3)
  })

  it('feuille de style du thème : palette, neutre et nuances de --ui-primary', () => {
    const css = editionThemeCss(edition)
    expect(css).toContain(`:root[data-edition="${edition.id}"] {`)
    expect(css).toContain(`--color-primary-500: ${edition.theme.primary[500]};`)
    expect(css).toContain(`--ui-color-neutral-900: var(--color-${edition.theme.neutral}-900,`)
    expect(css).toContain(`--ui-primary: var(--ui-color-primary-${edition.theme.primaryShade.light});`)
    expect(css).toContain(`:root[data-edition="${edition.id}"].dark {\n  --ui-primary: var(--ui-color-primary-${edition.theme.primaryShade.dark});`)
  })
})

describe('éditions : différences attendues', () => {
  it('Boultons : bleu-vert, slate, illustrations, accueil d\'origine, cartes 4/3', () => {
    const edition = EDITIONS.boultons
    expect(edition.theme.primary[500]).toBe('#64b9c3')
    expect(edition.theme.neutral).toBe('slate')
    expect(edition.categoryImages).not.toBeNull()
    expect(edition.home.variant).toBe('boultons')
    expect(edition.recipeCards.visual).toBe('fixed')
    expect(edition.brand.nameColor?.light).toBe('#7b88bd')
  })

  it('générique : terracotta, stone, icônes, accueil allégé, zone visuelle adaptative', () => {
    const edition = EDITIONS.generic
    expect(edition.theme.primary[500]).toBe('#c2603e')
    expect(edition.theme.neutral).toBe('stone')
    expect(edition.categoryImages).toBeNull()
    expect(edition.home.variant).toBe('generic')
    expect(edition.recipeCards.visual).toBe('adaptive')
  })
})
