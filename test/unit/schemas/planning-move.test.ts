import { describe, expect, it } from 'vitest'
import { planningEntryMoveSchema } from '#shared/schemas/planning'

describe('planningEntryMoveSchema (PUT /api/planning/:id)', () => {
  it('accepte un jour et un créneau valides, ignore les champs superflus', () => {
    const result = planningEntryMoveSchema.safeParse({ dateString: '2026-10-05', mealType: 'dinner', recipeId: 'ignored' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ dateString: '2026-10-05', mealType: 'dinner' })
  })

  it('refuse une date invalide, un créneau inconnu ou un champ manquant', () => {
    expect(planningEntryMoveSchema.safeParse({ dateString: '2026-13-01', mealType: 'lunch' }).success).toBe(false)
    expect(planningEntryMoveSchema.safeParse({ dateString: '2026-10-05', mealType: 'brunch' }).success).toBe(false)
    expect(planningEntryMoveSchema.safeParse({ mealType: 'lunch' }).success).toBe(false)
    expect(planningEntryMoveSchema.safeParse({ dateString: '2026-10-05' }).success).toBe(false)
  })
})
