import { describe, expect, it } from 'vitest'
import {
  categoryI18nKey,
  flattenSteps,
  formatScaledAmount,
  roundReadable,
  scaleAmount,
  servingsFactor
} from '#shared/utils/recipes'
import type { RecipeSection } from '#shared/types'

describe('servingsFactor', () => {
  it('rapport cible / base', () => {
    expect(servingsFactor(4, 6)).toBe(1.5)
    expect(servingsFactor(4, 2)).toBe(0.5)
    expect(servingsFactor(4, 4)).toBe(1)
  })

  it('1 quand une des valeurs est absente ou nulle', () => {
    expect(servingsFactor(null, 6)).toBe(1)
    expect(servingsFactor(4, null)).toBe(1)
    expect(servingsFactor(0, 6)).toBe(1)
    expect(servingsFactor(4, 0)).toBe(1)
  })
})

describe('roundReadable', () => {
  it('petits nombres : au quart ou au tiers le plus proche', () => {
    expect(roundReadable(1.5)).toBe(1.5)
    expect(roundReadable(0.3)).toBeCloseTo(1 / 3, 5)
    expect(roundReadable(0.7)).toBeCloseTo(2 / 3, 5)
    expect(roundReadable(2.2)).toBe(2.25)
    expect(roundReadable(2.9)).toBe(3)
    expect(roundReadable(0.74)).toBe(0.75)
  })

  it('ne fait pas disparaître une petite quantité', () => {
    expect(roundReadable(0.05)).toBe(0.1)
    expect(roundReadable(0.1)).toBe(0.1)
    expect(roundReadable(0)).toBe(0)
  })

  it('10 à 100 : une décimale ; ≥ 100 : entier', () => {
    expect(roundReadable(12.34)).toBe(12.3)
    expect(roundReadable(37.5)).toBe(37.5)
    expect(roundReadable(99.96)).toBe(100)
    expect(roundReadable(333.33)).toBe(333)
    expect(roundReadable(1125)).toBe(1125)
  })

  it('valeurs non finies et négatives', () => {
    expect(roundReadable(Number.NaN)).toBeNaN()
    expect(roundReadable(-1.5)).toBe(-1.5)
  })
})

describe('scaleAmount', () => {
  it('null sans quantité numérique', () => {
    expect(scaleAmount(null, 2)).toBeNull()
    expect(scaleAmount(undefined, 2)).toBeNull()
    expect(scaleAmount(Number.NaN, 2)).toBeNull()
  })

  it('facteur 1 : valeur inchangée (pas d’arrondi)', () => {
    expect(scaleAmount(2.37, 1)).toBe(2.37)
  })

  it('met à l’échelle puis arrondit', () => {
    expect(scaleAmount(200, 1.5)).toBe(300)
    expect(scaleAmount(1, 1.5)).toBe(1.5)
    expect(scaleAmount(3, 1.5)).toBe(4.5)
    expect(scaleAmount(1, 2 / 3)).toBeCloseTo(2 / 3, 5)
    expect(scaleAmount(250, 0.5)).toBe(125)
  })
})

describe('formatScaledAmount', () => {
  it('fractions lisibles pour les petites quantités', () => {
    expect(formatScaledAmount(1, '1', 1.5)).toBe('1 ½')
    expect(formatScaledAmount(0.5, '1/2', 0.5)).toBe('¼')
    expect(formatScaledAmount(1, '1', 0.75)).toBe('¾')
    expect(formatScaledAmount(2, '2', 1 / 3)).toBe('⅔')
    expect(formatScaledAmount(3, '3', 1.5)).toBe('4 ½')
    expect(formatScaledAmount(4, '4', 1.5)).toBe('6')
  })

  it('une décimale au-delà de 10, entier au-delà de 100', () => {
    expect(formatScaledAmount(25, '25', 0.5)).toBe('12,5')
    expect(formatScaledAmount(15, '15', 1.5)).toBe('22,5')
    expect(formatScaledAmount(200, '200', 1.5)).toBe('300')
    expect(formatScaledAmount(333, '333', 0.5)).toBe('167')
    expect(formatScaledAmount(33, '33', 0.5)).toBe('16,5')
    expect(formatScaledAmount(500, '500', 1 / 3)).toBe('167')
  })

  it('format des nombres selon la locale', () => {
    expect(formatScaledAmount(25, '25', 0.5, 'en-US')).toBe('12.5')
    expect(formatScaledAmount(25, '25', 0.5, 'fr-FR')).toBe('12,5')
    expect(formatScaledAmount(3, '3', 1.5, 'en-US')).toBe('4 ½')
    expect(formatScaledAmount(500, '500', 1 / 3, 'en-US')).toBe('167')
  })

  it('facteur 1 : même rendu que la fiche d’origine', () => {
    expect(formatScaledAmount(1.5, '1,5', 1)).toBe('1 ½')
    expect(formatScaledAmount(200, '200', 1)).toBe('200')
  })

  it('texte libre non interprétable : rendu tel quel', () => {
    expect(formatScaledAmount(null, 'une pincée', 2)).toBe('une pincée')
    expect(formatScaledAmount(null, '  2 à 3 ', 2)).toBe('2 à 3')
    expect(formatScaledAmount(null, null, 2)).toBe('')
  })

  it('portions 4 → 6 sur une recette type', () => {
    const factor = servingsFactor(4, 6)
    expect(formatScaledAmount(400, '400', factor)).toBe('600')
    expect(formatScaledAmount(2, '2', factor)).toBe('3')
    expect(formatScaledAmount(1, '1', factor)).toBe('1 ½')
    expect(formatScaledAmount(0.5, '1/2', factor)).toBe('¾')
    expect(formatScaledAmount(3, '3', factor)).toBe('4 ½')
  })
})

describe('flattenSteps', () => {
  const section = (id: string, name: string, steps: string[], withIngredients = false): RecipeSection => ({
    id,
    recipeId: 'r',
    name,
    type: 'mixed',
    orderIndex: 0,
    createdAt: null,
    updatedAt: null,
    ingredients: withIngredients
      ? [{ id: `${id}-i`, sectionId: id, name: 'Sel', amount: null, amountNum: null, unit: null, unitCode: null, optional: false, orderIndex: 0 }]
      : [],
    instructions: steps.map((content, index) => ({ id: `${id}-${index}`, sectionId: id, content, orderIndex: index }))
  })

  it('aplatit les étapes dans l’ordre des sections, en ignorant les sections sans étape', () => {
    const steps = flattenSteps([
      section('a', 'Pâte', ['Mélanger', 'Pétrir']),
      section('b', 'Ingrédients', [], true),
      section('c', 'Garniture', ['Étaler'])
    ])
    expect(steps.map(step => step.content)).toEqual(['Mélanger', 'Pétrir', 'Étaler'])
    expect(steps[0]).toMatchObject({ sectionId: 'a', sectionName: 'Pâte', stepNumber: 1, stepCount: 2 })
    expect(steps[1]).toMatchObject({ stepNumber: 2, stepCount: 2 })
    expect(steps[2]).toMatchObject({ sectionId: 'c', stepNumber: 1, stepCount: 1 })
  })

  it('tableau vide sans étape', () => {
    expect(flattenSteps([])).toEqual([])
  })
})

describe('categoryI18nKey', () => {
  it('retire les accents et remplace les espaces', () => {
    expect(categoryI18nKey('desserts et gâteaux')).toBe('categories.desserts_et_gateaux.name')
    expect(categoryI18nKey('yaourts et fromages')).toBe('categories.yaourts_et_fromages.name')
    expect(categoryI18nKey('plats')).toBe('categories.plats.name')
    expect(categoryI18nKey(null)).toBe('categories..name')
  })
})
