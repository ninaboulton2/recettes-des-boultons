import { describe, expect, it } from 'vitest'
import { addRecipeBodySchema } from '#shared/schemas/recipe'
import { shoppingItemInputSchema } from '#shared/schemas/shopping'
import { formatZodIssues } from '../../server/utils/validate'
import { mapRecipeRow } from '../../server/utils/recipes'

describe('formatZodIssues', () => {
  it('produit un message français listant les chemins invalides', () => {
    const result = addRecipeBodySchema.safeParse({
      recipe: {
        title: '',
        servings: -3,
        sections: [{ type: 'steps', ingredients: [{ amount: 1 }] }]
      }
    })
    expect(result.success).toBe(false)
    if (result.success) return
    const message = formatZodIssues(result.error.issues)
    expect(message.startsWith('Données invalides : ')).toBe(true)
    expect(message).toContain('recipe.title : requis')
    expect(message).toContain('recipe.category : requis')
    expect(message).toContain('recipe.servings : doit être positif ou nul')
    expect(message).toContain('recipe.sections[0].type : doit être ingredients, instructions ou mixed')
    expect(message).toContain('recipe.sections[0].ingredients[0].name : requis')
    expect(message).not.toMatch(/Required|Expected|Invalid/)
  })

  it('limite à 5 champs et compte le reste', () => {
    const result = shoppingItemInputSchema.safeParse({ listId: 'x', name: '', amount: {}, unit: 1, recipeId: 'y' })
    expect(result.success).toBe(false)
    if (result.success) return
    const message = formatZodIssues(result.error.issues)
    expect(message).toContain('listId : identifiant invalide')
    expect(message).toContain('name : requis')
    expect(message).toContain('unit : doit être du texte')
    expect(message.split(' ; ').length).toBeLessThanOrEqual(5)
  })
})

describe('mapRecipeRow', () => {
  it('convertit la ligne Supabase en RecipeDetail camelCase trié', () => {
    const detail = mapRecipeRow({
      id: 'r1',
      title: 'T',
      description: null,
      category: 'plats',
      prep_time: 10,
      cook_time: null,
      servings: 4,
      image: null,
      photo_path: 'recipes/r1.jpg',
      tags: null,
      notes: null,
      created_at: '2026-10-03T00:00:00Z',
      updated_at: null,
      recipe_sections: [
        {
          id: 's2', recipe_id: 'r1', name: 'Prépa', type: 'instructions', order_index: 1, created_at: null, updated_at: null,
          recipe_ingredients: [],
          instructions: [
            { id: 'i2', section_id: 's2', content: 'B', order_index: 1 },
            { id: 'i1', section_id: 's2', content: 'A', order_index: 0 }
          ]
        },
        {
          id: 's1', recipe_id: 'r1', name: 'Ingr', type: 'ingredients', order_index: 0, created_at: null, updated_at: null,
          recipe_ingredients: [
            { id: 'g2', section_id: 's1', name: 'Sucre', amount: '1/2', amount_num: '0.5', unit: 'tasse', unit_code: 'tasse', optional: null, order_index: 1 },
            { id: 'g1', section_id: 's1', name: 'Farine', amount: '200', amount_num: 200, unit: 'g', unit_code: 'g', optional: false, order_index: 0 }
          ],
          instructions: null
        }
      ]
    })

    expect(detail).not.toHaveProperty('ingredients')
    expect(detail.description).toBe('')
    expect(detail.tags).toEqual([])
    expect(detail.photoPath).toBe('recipes/r1.jpg')
    expect(detail.sections.map(s => s.name)).toEqual(['Ingr', 'Prépa'])
    expect(detail.sections[0]?.ingredients.map(i => i.name)).toEqual(['Farine', 'Sucre'])
    expect(detail.sections[0]?.ingredients[1]).toMatchObject({ amountNum: 0.5, unitCode: 'tasse', optional: false })
    expect(detail.sections[1]?.instructions.map(i => i.content)).toEqual(['A', 'B'])
  })
})
