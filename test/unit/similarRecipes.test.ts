import { describe, expect, it } from 'vitest'
import {
  findSimilarRecipes,
  ingredientKey,
  ingredientSimilarity,
  normalizeTitle,
  SIMILARITY,
  titleSimilarity,
  type RecipeFingerprint
} from '#shared/utils/similarRecipes'

const recipe = (id: string, title: string, ingredientNames: string[] = []): RecipeFingerprint => ({ id, title, ingredientNames })

const CARROT_CAKE = ['carottes râpées', 'noix', 'farine', 'sucre roux', 'œufs', 'huile de tournesol', 'cannelle', 'levure chimique']

/** Petit livre de recettes : une dizaine de recettes variées pour que les ingrédients courants soient « courants ». */
const CORPUS: RecipeFingerprint[] = [
  recipe('carrot', 'Gâteau aux carottes', CARROT_CAKE),
  recipe('yaourt', 'Gâteau au yaourt', ['yaourt nature', 'sucre', 'farine', 'huile', 'œufs', 'levure']),
  recipe('tiramisu', 'Tiramisu', ['mascarpone', 'œufs', 'sucre', 'café', 'biscuits à la cuillère', 'cacao']),
  recipe('ratatouille', 'Ratatouille', ['aubergines', 'courgettes', 'tomates', 'poivrons', 'oignon', 'huile d\'olive']),
  recipe('crepes', 'Crêpes', ['farine', 'lait', 'œufs', 'sucre', 'beurre', 'sel']),
  recipe('soupe', 'Soupe de potiron', ['potiron', 'oignon', 'crème fraîche', 'bouillon', 'sel', 'poivre']),
  recipe('pesto', 'Pâtes au pesto', ['pâtes', 'basilic', 'pignons de pin', 'parmesan', 'ail', 'huile d\'olive'])
]

describe('normalisation des titres', () => {
  it('ignore la casse, les accents, la ponctuation et les mots vides', () => {
    expect(normalizeTitle('Gâteau à la carotte !')).toBe('carotte gateau')
    expect(normalizeTitle('GATEAU AUX CAROTTES')).toBe('carotte gateau')
    expect(normalizeTitle('Tarte au citron de Mamie')).toBe('citron mamie tarte')
    expect(normalizeTitle('Œufs à l\'ail')).toBe('ail oeuf')
  })

  it('ramène les pluriels au singulier et ne garde que des mots significatifs', () => {
    expect(normalizeTitle('Gâteaux aux noix')).toBe(normalizeTitle('Gâteau aux noix'))
    expect(normalizeTitle('Cookies')).toBe(normalizeTitle('cookie'))
    expect(normalizeTitle('Couscous')).toBe('couscous')
    expect(normalizeTitle('de la le aux')).toBe('')
  })
})

describe('titleSimilarity', () => {
  it('vaut 1 pour le même titre aux accents, casse, ponctuation et ordre près', () => {
    expect(titleSimilarity('Gâteau au yaourt', 'gateau AU Yaourt!!')).toBe(1)
    expect(titleSimilarity('Tarte aux pommes', 'Tarte  aux  pommes (de Mamie)')).toBeLessThan(1)
    expect(titleSimilarity('Poulet rôti', 'Rôti de poulet')).toBe(1)
  })

  it('reste élevé pour un titre proche (faute de frappe, un mot en plus)', () => {
    expect(titleSimilarity('Tiramissu', 'Tiramisu')).toBeGreaterThanOrEqual(SIMILARITY.titleMatch)
    expect(titleSimilarity('Gâteau aux pommes', 'Gâteau aux pommes de Mamie')).toBeGreaterThanOrEqual(SIMILARITY.titleMatch)
  })

  it('reste bas pour des titres différents ou vides', () => {
    expect(titleSimilarity('Gâteau au chocolat', 'Gâteau au citron')).toBeLessThan(SIMILARITY.titleMatch)
    expect(titleSimilarity('Soupe de potiron', 'Pâtes au pesto')).toBeLessThan(0.5)
    expect(titleSimilarity('de la', 'de la')).toBe(0)
  })
})

describe('ingredientKey / ingredientSimilarity', () => {
  it('réduit un nom d\'ingrédient à ses mots significatifs', () => {
    expect(ingredientKey('Beurre doux, ramolli')).toBe('beurre')
    expect(ingredientKey('Œufs (gros)')).toBe('oeuf')
    expect(ingredientKey('carottes râpées')).toBe('carotte')
    expect(ingredientKey('Huile d\'olive')).toBe('huile olive')
    expect(ingredientKey('  ')).toBe('')
  })

  it('compare des listes sans tenir compte de la forme des noms', () => {
    const a = ['Farine', 'œufs', 'sucre', 'beurre doux', 'sel']
    const b = ['farine', 'Oeufs', 'sucre', 'beurre', 'lait']
    expect(ingredientSimilarity(a, a)).toBe(1)
    expect(ingredientSimilarity(a, b)).toBeCloseTo(4 / 6, 5)
  })

  it('ignore le signal sous 4 ingrédients ou 3 ingrédients communs', () => {
    expect(ingredientSimilarity(['farine', 'sucre', 'œufs'], ['farine', 'sucre', 'œufs'])).toBe(0)
    expect(ingredientSimilarity(['a1', 'b2', 'c3', 'd4'], ['a1', 'b2', 'x', 'y'])).toBe(0)
  })
})

describe('findSimilarRecipes', () => {
  it('(1) même titre aux accents, casse et ponctuation près → trouvé par le titre', () => {
    const found = findSimilarRecipes({ title: 'GATEAU aux CAROTTES !!', ingredientNames: [] }, CORPUS)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ id: 'carrot', reason: 'title', titleScore: 1, score: 1 })
  })

  it('(2) titre proche (faute de frappe) → trouvé par le titre', () => {
    const found = findSimilarRecipes({ title: 'Tiramissu', ingredientNames: [] }, CORPUS)
    expect(found.map(item => item.id)).toEqual(['tiramisu'])
    expect(found[0]?.reason).toBe('title')
  })

  it('(3) autre titre (autre langue) mais mêmes ingrédients → trouvé par les ingrédients', () => {
    const found = findSimilarRecipes({
      title: 'Carrot cake',
      ingredientNames: ['Carrots', 'carottes', 'Noix', 'farine', 'sucre roux', 'oeufs', 'huile de tournesol', 'cannelle moulue', 'levure chimique']
    }, CORPUS)
    expect(found[0]).toMatchObject({ id: 'carrot', reason: 'ingredients' })
    expect(found[0]?.ingredientScore).toBeGreaterThanOrEqual(SIMILARITY.ingredientsMatch)
    expect(found[0]?.titleScore).toBeLessThan(SIMILARITY.combinedTitle)
  })

  it('(4) recette sans rapport → rien, même avec quelques ingrédients de base en commun', () => {
    const found = findSimilarRecipes({
      title: 'Soupe miso au tofu',
      ingredientNames: ['pâte de miso', 'tofu soyeux', 'algue wakame', 'oignon', 'sel', 'œufs']
    }, CORPUS)
    expect(found).toEqual([])
  })

  it('des ingrédients très courants seuls ne suffisent pas à déclarer un doublon', () => {
    const found = findSimilarRecipes({
      title: 'Pâte à gaufres',
      ingredientNames: ['farine', 'lait', 'œufs', 'sucre', 'beurre', 'sel']
    }, CORPUS)
    // « Crêpes » a exactement les mêmes ingrédients : c'est bien signalé (voisin le plus proche) ...
    expect(found.map(item => item.id)).toEqual(['crepes'])
    // ... mais le gâteau au yaourt (farine, sucre, œufs seulement) ne l'est pas.
    expect(found.map(item => item.id)).not.toContain('yaourt')
  })

  it('retient titre ET ingrédients moyennement proches (signal combiné)', () => {
    const found = findSimilarRecipes({
      title: 'Gâteau aux carottes et au gingembre',
      ingredientNames: ['carottes', 'gingembre', 'farine', 'sucre roux', 'œufs', 'huile de tournesol']
    }, CORPUS)
    expect(found[0]).toMatchObject({ id: 'carrot' })
  })

  it('exclut la recette demandée et plafonne à 3 résultats, le plus proche d\'abord', () => {
    const corpus = [
      recipe('a', 'Gâteau au yaourt'),
      recipe('b', 'Gâteau au yaourt citron'),
      recipe('c', 'Gâteau yaourt et pommes'),
      recipe('d', 'Gâteau au yaourt aux pommes'),
      recipe('e', 'Gâteau au yaourt')
    ]
    const found = findSimilarRecipes({ title: 'gâteau au yaourt', ingredientNames: [] }, corpus)
    expect(found).toHaveLength(3)
    expect(found[0]?.titleScore).toBe(1)
    expect(found.map(item => item.id).slice(0, 2).sort()).toEqual(['a', 'e'])
    expect(findSimilarRecipes({ title: 'gâteau au yaourt', ingredientNames: [] }, corpus, { excludeId: 'a' }).map(item => item.id)).not.toContain('a')
  })

  it('accepte un corpus vide', () => {
    expect(findSimilarRecipes({ title: 'Tiramisu', ingredientNames: ['café'] }, [])).toEqual([])
  })
})
