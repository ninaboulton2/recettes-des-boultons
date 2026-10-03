import { describe, expect, it } from 'vitest'
import {
  addRecipeToListSchema,
  shoppingItemInputSchema,
  shoppingItemUpdateSchema,
  shoppingListInputSchema
} from '#shared/schemas/shopping'

const LIST_ID = '22222222-2222-4222-8222-222222222222'
const RECIPE_ID = '33333333-3333-4333-8333-333333333333'

describe('shoppingItemInputSchema', () => {
  it('accepte ce que le store envoie (amount nombre ou texte, unit, recipeId optionnel)', () => {
    expect(shoppingItemInputSchema.safeParse({ listId: LIST_ID, name: 'Farine', amount: 100, unit: 'g' }).success).toBe(true)
    expect(shoppingItemInputSchema.safeParse({ listId: LIST_ID, name: 'Farine', amount: '1/2', unit: 'kg', recipeId: RECIPE_ID }).success).toBe(true)
    expect(shoppingItemInputSchema.safeParse({ listId: LIST_ID, name: 'Sel', amount: null, unit: null, recipeId: undefined, userId: 'ignored' }).success).toBe(true)
  })

  it('refuse un listId non uuid, un nom vide, un recipeId invalide', () => {
    expect(shoppingItemInputSchema.safeParse({ listId: 'abc', name: 'Farine' }).success).toBe(false)
    expect(shoppingItemInputSchema.safeParse({ listId: LIST_ID, name: '  ' }).success).toBe(false)
    expect(shoppingItemInputSchema.safeParse({ listId: LIST_ID, name: 'Farine', recipeId: '42' }).success).toBe(false)
  })
})

describe('shoppingItemUpdateSchema', () => {
  it('exige au moins un champ', () => {
    expect(shoppingItemUpdateSchema.safeParse({}).success).toBe(false)
    expect(shoppingItemUpdateSchema.safeParse({ isChecked: true }).success).toBe(true)
    expect(shoppingItemUpdateSchema.safeParse({ amount: 250, unit: 'g' }).success).toBe(true)
    expect(shoppingItemUpdateSchema.safeParse({ isChecked: 'oui' }).success).toBe(false)
  })
})

describe('addRecipeToListSchema', () => {
  it('accepte recipeId seul, sectionIds et servingsFactor > 0', () => {
    expect(addRecipeToListSchema.safeParse({ recipeId: RECIPE_ID }).success).toBe(true)
    expect(addRecipeToListSchema.safeParse({ recipeId: RECIPE_ID, sectionIds: [LIST_ID], servingsFactor: 1.5 }).success).toBe(true)
  })

  it('refuse un facteur nul/négatif, un tableau de sections vide ou non uuid', () => {
    expect(addRecipeToListSchema.safeParse({ recipeId: RECIPE_ID, servingsFactor: 0 }).success).toBe(false)
    expect(addRecipeToListSchema.safeParse({ recipeId: RECIPE_ID, servingsFactor: -2 }).success).toBe(false)
    expect(addRecipeToListSchema.safeParse({ recipeId: RECIPE_ID, sectionIds: [] }).success).toBe(false)
    expect(addRecipeToListSchema.safeParse({ recipeId: RECIPE_ID, sectionIds: ['x'] }).success).toBe(false)
  })
})

describe('shoppingListInputSchema', () => {
  it('nettoie et borne le nom', () => {
    const ok = shoppingListInputSchema.safeParse({ name: '  Courses  ' })
    expect(ok.success).toBe(true)
    if (ok.success) expect(ok.data.name).toBe('Courses')
    expect(shoppingListInputSchema.safeParse({ name: '' }).success).toBe(false)
    expect(shoppingListInputSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false)
  })
})
