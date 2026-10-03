import { describe, expect, it } from 'vitest'
import { favoriteDeleteQuerySchema, favoriteInputSchema } from '#shared/schemas/favorites'
import { planningEntryInputSchema, planningNoteInputSchema, planningNoteQuerySchema } from '#shared/schemas/planning'

const RECIPE_ID = '33333333-3333-4333-8333-333333333333'

describe('planningEntryInputSchema', () => {
  it('accepte une recette ou un titre personnalisé (userId superflu ignoré)', () => {
    expect(planningEntryInputSchema.safeParse({ dateString: '2026-10-03', mealType: 'lunch', recipeId: RECIPE_ID, userId: 'x' }).success).toBe(true)
    expect(planningEntryInputSchema.safeParse({ dateString: '2026-10-03', mealType: 'dinner', customTitle: 'Restes' }).success).toBe(true)
  })

  it('refuse sans recette ni titre, une date mal formée ou inexistante, un type de repas inconnu', () => {
    expect(planningEntryInputSchema.safeParse({ dateString: '2026-10-03', mealType: 'lunch' }).success).toBe(false)
    expect(planningEntryInputSchema.safeParse({ dateString: '03/10/2026', mealType: 'lunch', customTitle: 'x' }).success).toBe(false)
    expect(planningEntryInputSchema.safeParse({ dateString: '2026-02-30', mealType: 'lunch', customTitle: 'x' }).success).toBe(false)
    expect(planningEntryInputSchema.safeParse({ dateString: '2026-10-03', mealType: 'breakfast', customTitle: 'x' }).success).toBe(false)
  })
})

describe('planningNoteInputSchema / planningNoteQuerySchema', () => {
  it('accepte content null (effacement) et les trois types', () => {
    for (const noteType of ['day', 'lunch', 'dinner']) {
      expect(planningNoteInputSchema.safeParse({ dateString: '2026-10-03', noteType, content: null }).success).toBe(true)
    }
    expect(planningNoteInputSchema.safeParse({ dateString: '2026-10-03', noteType: 'week', content: 'x' }).success).toBe(false)
    expect(planningNoteQuerySchema.safeParse({ dateString: '2026-10-03', noteType: 'day', userId: 'ignored' }).success).toBe(true)
    expect(planningNoteQuerySchema.safeParse({ dateString: '2026-10-3', noteType: 'day' }).success).toBe(false)
  })
})

describe('favorites', () => {
  it('favoriteInputSchema exige un recipeId uuid', () => {
    expect(favoriteInputSchema.safeParse({ recipeId: RECIPE_ID, userId: 'ignored' }).success).toBe(true)
    expect(favoriteInputSchema.safeParse({ recipeId: 12 }).success).toBe(false)
    expect(favoriteInputSchema.safeParse({}).success).toBe(false)
  })

  it('favoriteDeleteQuerySchema exige id ou recipeId', () => {
    expect(favoriteDeleteQuerySchema.safeParse({ recipeId: RECIPE_ID }).success).toBe(true)
    expect(favoriteDeleteQuerySchema.safeParse({ id: RECIPE_ID }).success).toBe(true)
    expect(favoriteDeleteQuerySchema.safeParse({}).success).toBe(false)
    expect(favoriteDeleteQuerySchema.safeParse({ recipeId: 'nope' }).success).toBe(false)
  })
})
