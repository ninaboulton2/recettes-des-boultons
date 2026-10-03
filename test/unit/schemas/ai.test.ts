import { describe, expect, it } from 'vitest'
import { aiRecipeSchema, aiRecipeToRecipeInput, translateRecipeBodySchema, type AiRecipe } from '#shared/schemas/ai'
import { recipeInputSchema } from '#shared/schemas/recipe'
import { UNIT_CODES } from '#shared/schemas/units'
import { RECIPE_CATEGORIES } from '#shared/types'

const base: AiRecipe = {
  title: 'Soupe de carottes',
  description: null,
  category: 'soupes',
  prepTime: 10,
  cookTime: 25,
  servings: 4,
  tags: ['Végétarien', 'vegan', 'vegan'],
  notes: null,
  sections: [
    {
      name: '',
      type: 'ingredients',
      ingredients: [
        { name: 'carottes', amount: 500, unit: 'g', unitText: null, optional: false },
        { name: 'oignon', amount: 1, unit: null, unitText: null, optional: false },
        { name: 'bouillon', amount: 1, unit: 'l', unitText: null, optional: false },
        { name: 'coriandre', amount: 1, unit: null, unitText: 'botte de 50 g', optional: true },
        { name: 'crème', amount: 2, unit: 'cas', unitText: null, optional: true }
      ],
      instructions: []
    },
    { name: 'Préparation', type: 'instructions', ingredients: [], instructions: ['Éplucher.', '  ', 'Cuire 25 min.'] },
    { name: 'Vide', type: 'mixed', ingredients: [], instructions: [] }
  ]
}

describe('translateRecipeBodySchema', () => {
  it('exige 20 à 20 000 caractères et une langue fr|en (fr par défaut)', () => {
    expect(translateRecipeBodySchema.safeParse({ recipeText: 'trop court' }).success).toBe(false)
    expect(translateRecipeBodySchema.safeParse({ recipeText: 'x'.repeat(20001) }).success).toBe(false)
    expect(translateRecipeBodySchema.safeParse({ recipeText: 'x'.repeat(30), targetLanguage: 'de' }).success).toBe(false)
    const ok = translateRecipeBodySchema.parse({ recipeText: `  ${'x'.repeat(30)}  ` })
    expect(ok.targetLanguage).toBe('fr')
    expect(ok.recipeText).toBe('x'.repeat(30))
  })
})

describe('aiRecipeSchema', () => {
  it('accepte une recette conforme', () => {
    expect(aiRecipeSchema.safeParse(base).success).toBe(true)
  })

  it('refuse une unité hors des 37 codes', () => {
    const bad = structuredClone(base)
    bad.sections[0]!.ingredients[0]!.unit = 'cup' as never
    const result = aiRecipeSchema.safeParse(bad)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.path).toEqual(['sections', 0, 'ingredients', 0, 'unit'])
  })

  it('accepte exactement les codes de UNIT_CODES', () => {
    for (const code of UNIT_CODES) {
      const ingredient = { name: 'x', amount: 1, unit: code, unitText: null, optional: false }
      expect(aiRecipeSchema.shape.sections.element.shape.ingredients.element.safeParse(ingredient).success).toBe(true)
    }
  })

  it('refuse une catégorie inconnue et exige les 9 catégories existantes', () => {
    expect(aiRecipeSchema.shape.category.options).toEqual([...RECIPE_CATEGORIES])
    expect(aiRecipeSchema.safeParse({ ...base, category: 'dessert' }).success).toBe(false)
  })

  it('refuse une quantité textuelle (le modèle doit renvoyer un nombre ou null)', () => {
    const bad = structuredClone(base)
    bad.sections[0]!.ingredients[0]!.amount = '1/2' as never
    expect(aiRecipeSchema.safeParse(bad).success).toBe(false)
  })

  it('n\'a aucun champ optionnel (compatibilité sorties structurées strictes)', () => {
    const json = JSON.stringify(aiRecipeSchema._def)
    expect(json).not.toContain('"typeName":"ZodOptional"')
  })
})

describe('aiRecipeToRecipeInput', () => {
  const converted = aiRecipeToRecipeInput(base, code => `<${code}>`)

  it('produit un RecipeInput valide pour recipeInputSchema', () => {
    expect(recipeInputSchema.safeParse(converted).success).toBe(true)
  })

  it('résout l\'unité canonique et conserve la graphie d\'origine sans code', () => {
    const ingredients = converted.sections?.[0]?.ingredients ?? []
    expect(ingredients[0]).toMatchObject({ name: 'carottes', amount: 500, unit: '<g>', unitCode: 'g', optional: false, orderIndex: 0 })
    expect(ingredients[1]).toMatchObject({ name: 'oignon', amount: 1, unit: null, unitCode: null })
    expect(ingredients[3]).toMatchObject({ name: 'coriandre', unit: 'botte de 50 g', unitCode: null, optional: true, orderIndex: 3 })
    expect(ingredients[4]).toMatchObject({ unit: '<cas>', unitCode: 'cas' })
  })

  it('retire les sections vides et les étapes vides, renumérote les index', () => {
    expect(converted.sections).toHaveLength(2)
    expect(converted.sections?.map(s => s.orderIndex)).toEqual([0, 1])
    expect(converted.sections?.[1]).toMatchObject({
      name: 'Préparation',
      type: 'instructions',
      instructions: [{ content: 'Éplucher.', orderIndex: 0 }, { content: 'Cuire 25 min.', orderIndex: 1 }]
    })
  })

  it('normalise les tags (minuscules, dédoublonnés) et les textes nuls', () => {
    expect(converted.tags).toEqual(['végétarien', 'vegan'])
    expect(converted.description).toBeNull()
    expect(converted.notes).toBeNull()
    expect(converted).toMatchObject({ title: 'Soupe de carottes', category: 'soupes', prepTime: 10, cookTime: 25, servings: 4 })
  })

  it('utilise le code comme libellé par défaut', () => {
    const plain = aiRecipeToRecipeInput(base)
    expect(plain.sections?.[0]?.ingredients?.[0]?.unit).toBe('g')
  })
})
