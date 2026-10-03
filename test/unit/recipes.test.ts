import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  formatIngredient,
  toRecipe,
  toRecipeSummary,
  type RecipeWithSectionsRow
} from '#shared/utils/recipes'

const baseRow = {
  id: 'r1',
  title: 'Tarte à la tomate',
  description: null,
  category: 'plats',
  prep_time: 15,
  cook_time: 30,
  servings: 4,
  photo_path: null,
  tags: null,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null
}

describe('toRecipeSummary', () => {
  it('convertit snake_case → camelCase avec les valeurs par défaut', () => {
    const summary = toRecipeSummary(baseRow)
    expect(summary).toEqual({
      id: 'r1',
      title: 'Tarte à la tomate',
      description: '',
      category: 'plats',
      prepTime: 15,
      cookTime: 30,
      servings: 4,
      photoPath: null,
      tags: [],
      notes: '',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: null
    })
    expect(summary).not.toHaveProperty('ingredients')
    expect(summary).not.toHaveProperty('instructions')
    expect(summary).not.toHaveProperty('image')
  })

  it('conserve photo_path quand il est renseigné', () => {
    const summary = toRecipeSummary({ ...baseRow, photo_path: 'r1/cover.webp', tags: ['vegan'] })
    expect(summary.photoPath).toBe('r1/cover.webp')
    expect(summary.tags).toEqual(['vegan'])
  })
})

describe('toRecipe', () => {
  it('mappe les sections, ingrédients et instructions triés par order_index', () => {
    const row: RecipeWithSectionsRow = {
      ...baseRow,
      recipe_sections: [
        {
          id: 's2',
          recipe_id: 'r1',
          name: 'Garniture',
          type: 'instructions',
          order_index: 1,
          created_at: null,
          updated_at: null,
          recipe_ingredients: [],
          instructions: [
            { id: 'i2', recipe_id: 'r1', section_id: 's2', content: 'Étape B', order_index: 1, created_at: null, updated_at: null },
            { id: 'i1', recipe_id: 'r1', section_id: 's2', content: 'Étape A', order_index: 0, created_at: null, updated_at: null }
          ]
        },
        {
          id: 's1',
          recipe_id: 'r1',
          name: 'Pâte',
          type: 'ingredients',
          order_index: 0,
          created_at: null,
          updated_at: null,
          recipe_ingredients: [
            {
              id: 'g2', recipe_id: 'r1', section_id: 's1', name: 'beurre', amount: '100', amount_num: 100,
              unit: 'g', unit_code: 'g', optional: null, order_index: 1, created_at: null, updated_at: null
            },
            {
              id: 'g1', recipe_id: 'r1', section_id: 's1', name: 'farine', amount: '1/2', amount_num: 0.5,
              unit: 'tasse', unit_code: 'cup', optional: true, order_index: 0, created_at: null, updated_at: null
            }
          ],
          instructions: null
        }
      ]
    }

    const recipe = toRecipe(row)
    expect(recipe.sections.map(s => s.name)).toEqual(['Pâte', 'Garniture'])

    const [pate, garniture] = recipe.sections
    expect(pate?.type).toBe('ingredients')
    expect(pate?.ingredients.map(i => i.name)).toEqual(['farine', 'beurre'])
    expect(pate?.ingredients[0]).toMatchObject({
      sectionId: 's1', amount: '1/2', amountNum: 0.5, unit: 'tasse', unitCode: 'cup', optional: true, orderIndex: 0
    })
    expect(pate?.ingredients[1]?.optional).toBe(false)
    expect(pate?.instructions).toEqual([])
    expect(garniture?.instructions.map(i => i.content)).toEqual(['Étape A', 'Étape B'])
  })

  it('renvoie des sections vides et un type « mixed » par défaut', () => {
    const recipe = toRecipe({ ...baseRow, recipe_sections: null })
    expect(recipe.sections).toEqual([])

    const mixed = toRecipe({
      ...baseRow,
      recipe_sections: [{
        id: 's', recipe_id: 'r1', name: 'Recette', type: 'autre', order_index: 0,
        created_at: null, updated_at: null, recipe_ingredients: null, instructions: null
      }]
    })
    expect(mixed.sections[0]?.type).toBe('mixed')
  })
})

describe('formatAmount / formatIngredient', () => {
  it('affiche les fractions simples et replie sur le texte saisi', () => {
    expect(formatAmount(0.5, '1/2')).toBe('½')
    expect(formatAmount(1.5, '1,5')).toBe('1 ½')
    expect(formatAmount(0.333, '1/3')).toBe('⅓')
    expect(formatAmount(2, '2')).toBe('2')
    expect(formatAmount(2.25, null)).toBe('2 ¼')
    expect(formatAmount(2.2, null)).toBe('2,2')
    expect(formatAmount(null, 'une pincée')).toBe('une pincée')
    expect(formatAmount(null, null)).toBe('')
  })

  it('assemble quantité, unité et nom', () => {
    expect(formatIngredient({ name: 'farine', amount: '1/2', amountNum: 0.5, unit: 'tasse' })).toBe('½ tasse farine')
    expect(formatIngredient({ name: 'sel', amount: null, amountNum: null, unit: null })).toBe('sel')
    expect(formatIngredient({ name: 'oeufs', amount: '2', amountNum: 2, unit: '' })).toBe('2 oeufs')
  })
})
