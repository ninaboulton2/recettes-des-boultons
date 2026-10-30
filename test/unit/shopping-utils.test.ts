import { describe, expect, it } from 'vitest'
import { AISLES, aisleKeyOf, aisleOf, foldName, formatQuantity, groupByAisle, itemAisle, splitChecked } from '#shared/utils/shopping'

describe('formatQuantity', () => {
  it('assemble quantité numérique et libellé d\'unité', () => {
    expect(formatQuantity({ amount: '200', amountNum: 200 }, 'g')).toBe('200 g')
    expect(formatQuantity({ amount: '1.5', amountNum: 1.5 }, 'c. à s.')).toBe('1 ½ c. à s.')
    expect(formatQuantity({ amount: '0.25', amountNum: 0.25 }, 'l')).toBe('¼ l')
  })

  it('se replie sur le texte saisi quand la quantité n\'est pas interprétable', () => {
    expect(formatQuantity({ amount: 'une pincée', amountNum: null }, null)).toBe('une pincée')
    expect(formatQuantity({ amount: 'quelques', amountNum: null }, 'feuilles')).toBe('quelques feuilles')
  })

  it('accepte un nombre côté interface et ignore les unités vides', () => {
    expect(formatQuantity({ amount: 3, amountNum: 3 }, '')).toBe('3')
    expect(formatQuantity({ amount: 3, amountNum: null }, undefined)).toBe('3')
    expect(formatQuantity({ amount: null, amountNum: null }, '  ')).toBe('')
    expect(formatQuantity({ amount: null, amountNum: null }, 'g')).toBe('g')
  })

  it('formate les nombres selon la locale', () => {
    expect(formatQuantity({ amount: '2.2', amountNum: 2.2 }, 'kg')).toBe('2,2 kg')
    expect(formatQuantity({ amount: '2.2', amountNum: 2.2 }, 'kg', 'en-US')).toBe('2.2 kg')
  })
})

describe('splitChecked', () => {
  it('répartit en conservant l\'ordre', () => {
    const items = [
      { id: 'a', checked: false },
      { id: 'b', checked: true },
      { id: 'c', checked: false }
    ]
    const { toBuy, checked } = splitChecked(items)
    expect(toBuy.map(item => item.id)).toEqual(['a', 'c'])
    expect(checked.map(item => item.id)).toEqual(['b'])
  })

  it('renvoie des tableaux vides pour une liste vide', () => {
    expect(splitChecked([])).toEqual({ toBuy: [], checked: [] })
  })
})

describe('foldName / aisleOf', () => {
  it('replie accents, casse et ponctuation', () => {
    expect(foldName('  Crème FRAÎCHE, épaisse ')).toBe(' creme fraiche epaisse ')
  })

  it('reconnaît les rayons usuels, au singulier comme au pluriel', () => {
    expect(aisleOf('Tomates')).toBe('produce')
    expect(aisleOf('Pommes de terre')).toBe('produce')
    expect(aisleOf('Farine')).toBe('grocery')
    expect(aisleOf('Lait demi-écrémé')).toBe('dairy')
    expect(aisleOf('Crème fraîche')).toBe('dairy')
    expect(aisleOf('Escalopes de poulet')).toBe('meatFish')
    expect(aisleOf('Filet de saumon')).toBe('meatFish')
    expect(aisleOf('Baguette')).toBe('bakery')
    expect(aisleOf('Petits pois surgelés')).toBe('frozen')
    expect(aisleOf('Jus d\'orange')).toBe('beverages')
    expect(aisleOf('Liquide vaisselle')).toBe('household')
  })

  it('cherche des mots entiers et renvoie « other » par défaut', () => {
    expect(aisleOf('Thym')).toBe('produce') // « the » (boisson) ne doit pas matcher « thym »
    expect(aisleOf('Papier cuisson')).toBe('household')
    expect(aisleOf('Truc introuvable')).toBe('other')
    expect(aisleOf('')).toBe('other')
  })

  it('privilégie le mot-clé le plus long en cas de conflit', () => {
    expect(aisleOf('Lait de coco')).toBe('beverages')
    expect(aisleOf('Haricots verts')).toBe('produce')
    expect(aisleOf('Haricots rouges en boîte')).toBe('grocery')
  })
})

describe('groupByAisle', () => {
  it('regroupe dans l\'ordre des rayons, sans rayon vide', () => {
    const groups = groupByAisle([
      { name: 'Farine' },
      { name: 'Tomates' },
      { name: 'Mystère' },
      { name: 'Sucre' }
    ])
    expect(groups.map(group => group.aisle)).toEqual(['produce', 'grocery', 'other'])
    expect(groups.find(group => group.aisle === 'grocery')?.items.map(item => item.name)).toEqual(['Farine', 'Sucre'])
    const order = groups.map(group => AISLES.indexOf(group.aisle))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('renvoie un tableau vide sans article', () => {
    expect(groupByAisle([])).toEqual([])
  })
})

describe('rayon choisi par la personne (v2)', () => {
  it('le rayon de l\'article l\'emporte sur la préférence et sur les mots-clés', () => {
    const prefs = new Map([['tomate', 'bakery' as const]])
    expect(aisleOf('Tomates')).toBe('produce')
    expect(aisleOf('Tomates', prefs)).toBe('bakery')            // préférence (nom replié) > mots-clés
    expect(itemAisle({ name: 'Tomates', aisle: 'frozen' }, prefs)).toBe('frozen')   // article > préférence
    expect(itemAisle({ name: 'Tomates', aisle: null }, prefs)).toBe('bakery')
    expect(itemAisle({ name: 'Tomates', aisle: 'inconnu' }, undefined)).toBe('produce')   // valeur inconnue ignorée
  })

  it('aisleKeyOf replie le nom (pluriel, accents, casse)', () => {
    expect(aisleKeyOf('  Pommes de TERRE ')).toBe(aisleKeyOf('pomme de terre'))
  })

  it('groupByAisle suit le rayon choisi puis la préférence', () => {
    const items = [{ name: 'Lait', aisle: null }, { name: 'Savon', aisle: 'grocery' }, { name: 'Tomates', aisle: null }]
    const groups = groupByAisle(items, new Map([['tomate', 'beverages' as const]]))
    expect(groups.map(group => [group.aisle, group.items.map(item => item.name)])).toEqual([
      ['dairy', ['Lait']],
      ['grocery', ['Savon']],
      ['beverages', ['Tomates']]
    ])
  })
})
