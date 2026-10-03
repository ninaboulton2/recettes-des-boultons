import { describe, expect, it } from 'vitest'
import {
  addRecipeBodySchema,
  recipeInputSchema,
  toSaveRecipePayload,
  updateRecipeBodySchema
} from '#shared/schemas/recipe'

/** Payload tel que `RecipeEditor.vue` l'envoie aujourd'hui (clés en trop incluses). */
const editorPayload = {
  id: 'local-123',
  createdAt: '2026-10-03T10:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
  favorite: false,
  title: 'Gâteau au yaourt',
  description: '',
  category: 'desserts et gâteaux',
  prepTime: 15,
  cookTime: null,
  servings: 6,
  image: '/images/desserts.png',
  tags: ['végétarien'],
  notes: '',
  sections: [
    {
      name: 'Pâte',
      type: 'ingredients',
      orderIndex: 0,
      ingredients: [
        { id: 'abc', name: 'Farine', amount: '200', unit: 'g', optional: false, orderIndex: 0 },
        { name: 'Sucre', amount: '1/2', unit: 'tasse', optional: false, orderIndex: 1 },
        { name: 'Œufs', amount: 2, unit: '', optional: true, orderIndex: 2 },
        { name: 'Sel', amount: '', unit: 'pincée', orderIndex: 3 }
      ],
      instructions: []
    },
    {
      name: 'Préparation',
      type: 'instructions',
      orderIndex: 1,
      ingredients: [],
      instructions: [
        { content: 'Mélanger.', orderIndex: 0 },
        { content: 'Cuire 40 min.', orderIndex: 1 }
      ]
    }
  ]
}

describe('recipeInputSchema', () => {
  it('accepte le payload de l\'éditeur (amount "1/2" et 2) et ignore les clés inconnues', () => {
    const result = recipeInputSchema.safeParse(editorPayload)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).not.toHaveProperty('id')
    expect(result.data).not.toHaveProperty('favorite')
    const ingredients = result.data.sections?.[0]?.ingredients ?? []
    expect(ingredients[1]?.amount).toBe('1/2')
    expect(ingredients[2]?.amount).toBe(2)
    expect(result.data.cookTime).toBeNull()
  })

  it('tolère "" pour un champ numérique vidé et des instructions en texte brut', () => {
    const result = recipeInputSchema.safeParse({
      title: 'Soupe',
      category: 'soupes',
      prepTime: '',
      sections: [{ instructions: ['Faire bouillir.', ''] }]
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.prepTime).toBeNull()
    expect(result.data.sections?.[0]?.type).toBeUndefined()
  })

  it('accepte un unitCode connu et refuse un unitCode inconnu', () => {
    const base = { title: 'X', category: 'plats' }
    const ok = recipeInputSchema.safeParse({ ...base, sections: [{ ingredients: [{ name: 'Lait', unitCode: 'ml' }] }] })
    expect(ok.success).toBe(true)
    const ko = recipeInputSchema.safeParse({ ...base, sections: [{ ingredients: [{ name: 'Lait', unitCode: 'millilitres' }] }] })
    expect(ko.success).toBe(false)
    if (ko.success) return
    expect(ko.error.issues[0]?.path).toEqual(['sections', 0, 'ingredients', 0, 'unitCode'])
  })

  it.each([
    ['titre vide', { title: '   ', category: 'plats' }, ['title']],
    ['titre trop long', { title: 'a'.repeat(201), category: 'plats' }, ['title']],
    ['catégorie absente', { title: 'Ok' }, ['category']],
    ['servings négatif', { title: 'Ok', category: 'plats', servings: -1 }, ['servings']],
    ['prepTime non entier', { title: 'Ok', category: 'plats', prepTime: 1.5 }, ['prepTime']],
    ['type de section invalide', { title: 'Ok', category: 'plats', sections: [{ type: 'steps' }] }, ['sections', 0, 'type']],
    ['ingrédient sans nom', { title: 'Ok', category: 'plats', sections: [{ ingredients: [{ amount: 1 }] }] }, ['sections', 0, 'ingredients', 0, 'name']],
    ['amount négatif', { title: 'Ok', category: 'plats', sections: [{ ingredients: [{ name: 'x', amount: -2 }] }] }, ['sections', 0, 'ingredients', 0, 'amount']],
    ['amount objet', { title: 'Ok', category: 'plats', sections: [{ ingredients: [{ name: 'x', amount: { v: 1 } }] }] }, ['sections', 0, 'ingredients', 0, 'amount']],
    ['tags non tableau', { title: 'Ok', category: 'plats', tags: 'vegan' }, ['tags']]
  ])('refuse : %s', (_label, payload, path) => {
    const result = recipeInputSchema.safeParse(payload)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues.some(issue => JSON.stringify(issue.path) === JSON.stringify(path))).toBe(true)
  })

  it('enveloppes { recipe } et { updates }', () => {
    expect(addRecipeBodySchema.safeParse({ recipe: editorPayload }).success).toBe(true)
    expect(addRecipeBodySchema.safeParse({ updates: editorPayload }).success).toBe(false)
    expect(updateRecipeBodySchema.safeParse({ updates: editorPayload }).success).toBe(true)
  })
})

describe('toSaveRecipePayload', () => {
  it('mappe camelCase → snake_case, amount en texte, unit_code null si inconnu', () => {
    const input = recipeInputSchema.parse(editorPayload)
    const payload = toSaveRecipePayload(input)

    expect(payload).not.toHaveProperty('id')
    expect(payload.prep_time).toBe(15)
    expect(payload.cook_time).toBeNull()
    expect(payload.servings).toBe(6)
    expect(payload.tags).toEqual(['végétarien'])
    expect(payload.sections).toHaveLength(2)

    const [pate, prep] = payload.sections
    expect(pate?.type).toBe('ingredients')
    expect(pate?.order_index).toBe(0)
    expect(pate?.ingredients).toEqual([
      { name: 'Farine', amount: '200', unit: 'g', unit_code: null, optional: false, order_index: 0 },
      { name: 'Sucre', amount: '1/2', unit: 'tasse', unit_code: null, optional: false, order_index: 1 },
      { name: 'Œufs', amount: '2', unit: null, unit_code: null, optional: true, order_index: 2 },
      { name: 'Sel', amount: null, unit: 'pincée', unit_code: null, optional: false, order_index: 3 }
    ])
    expect(prep?.instructions).toEqual([
      { content: 'Mélanger.', order_index: 0 },
      { content: 'Cuire 40 min.', order_index: 1 }
    ])
  })

  it('transmet l\'id pour une mise à jour, le unitCode connu, et ignore les étapes vides', () => {
    const input = recipeInputSchema.parse({
      title: 'Riz',
      category: 'plats',
      sections: [{
        ingredients: [{ name: 'Riz', amount: 150, unitCode: 'g' }],
        instructions: ['', 'Cuire.', { content: '   ' }]
      }]
    })
    const payload = toSaveRecipePayload(input, '11111111-1111-4111-8111-111111111111')
    expect(payload.id).toBe('11111111-1111-4111-8111-111111111111')
    expect(payload.sections[0]?.type).toBe('mixed')
    expect(payload.sections[0]?.ingredients[0]?.unit_code).toBe('g')
    expect(payload.sections[0]?.instructions).toEqual([{ content: 'Cuire.', order_index: 1 }])
  })
})
