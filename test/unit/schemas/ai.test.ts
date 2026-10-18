import { describe, expect, it } from 'vitest'
import {
  aiRecipeSchema,
  aiRecipeToBilingual,
  aiRecipeToRecipeInput,
  TranslationShapeError,
  translateRecipeBodySchema,
  type AiRecipe
} from '#shared/schemas/ai'
import { aiTranslateExistingSchema, translationDraftSchema } from '#shared/schemas/translation'
import { inputTexts, translationShapeProblem } from '#shared/utils/translation'
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
  ],
  sourceLanguage: 'fr',
  translation: {
    title: 'Carrot soup',
    description: null,
    notes: null,
    tags: ['Vegetarian', 'vegan', 'vegan'],
    sections: [
      {
        name: '',
        ingredients: [
          { name: 'carrots', amount: null, unit: null },
          { name: 'onion', amount: null, unit: null },
          { name: 'stock', amount: null, unit: null },
          { name: 'coriander', amount: null, unit: 'bunch of 50 g' },
          { name: 'cream', amount: null, unit: null }
        ],
        instructions: []
      },
      { name: 'Method', ingredients: [], instructions: ['Peel.', '  ', 'Cook 25 min.'] },
      { name: 'Empty', ingredients: [], instructions: [] }
    ]
  }
}

describe('translateRecipeBodySchema', () => {
  it('exige 20 à 20 000 caractères ; plus de langue cible (ignorée si envoyée par un ancien client)', () => {
    expect(translateRecipeBodySchema.safeParse({ recipeText: 'trop court' }).success).toBe(false)
    expect(translateRecipeBodySchema.safeParse({ recipeText: 'x'.repeat(20001) }).success).toBe(false)
    const ok = translateRecipeBodySchema.parse({ recipeText: `  ${'x'.repeat(30)}  `, targetLanguage: 'en' })
    expect(ok).toEqual({ recipeText: 'x'.repeat(30) })
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

describe('aiRecipeSchema : recette bilingue', () => {
  it('exige la langue détectée (fr | en) et la traduction', () => {
    expect(aiRecipeSchema.safeParse({ ...base, sourceLanguage: 'de' }).success).toBe(false)
    const { translation: _translation, ...withoutTranslation } = base
    expect(aiRecipeSchema.safeParse(withoutTranslation).success).toBe(false)
  })

  it('aiTranslateExistingSchema : langue + traduction, sans champ optionnel', () => {
    expect(aiTranslateExistingSchema.safeParse({ sourceLanguage: 'en', translation: base.translation }).success).toBe(true)
    expect(aiTranslateExistingSchema.safeParse({ sourceLanguage: 'es', translation: base.translation }).success).toBe(false)
    expect(JSON.stringify(aiTranslateExistingSchema._def)).not.toContain('"typeName":"ZodOptional"')
  })
})

describe('aiRecipeToBilingual', () => {
  const bilingual = aiRecipeToBilingual(base, code => `<${code}>`)

  it('renvoie la recette, la langue d\'origine et la traduction alignée', () => {
    expect(bilingual.lang).toBe('fr')
    expect(bilingual.recipe).toEqual(aiRecipeToRecipeInput(base, code => `<${code}>`))
    expect(bilingual.translation.title).toBe('Carrot soup')
  })

  it('écarte les mêmes sections, ingrédients et étapes vides des deux côtés', () => {
    expect(bilingual.translation.content.sections).toHaveLength(2)
    expect(bilingual.translation.content.sections[1]).toEqual({ name: 'Method', ingredients: [], instructions: ['Peel.', 'Cook 25 min.'] })
    expect(translationShapeProblem(inputTexts(bilingual.recipe), bilingual.translation)).toBeNull()
  })

  it('traduit l\'unité libre seulement (les quantités de l\'IA sont des nombres)', () => {
    const ingredients = bilingual.translation.content.sections[0]!.ingredients
    expect(ingredients[3]).toEqual({ name: 'coriander', amount: null, unit: 'bunch of 50 g' })
    expect(ingredients[0]).toEqual({ name: 'carrots', amount: null, unit: null })
  })

  it('lève TranslationShapeError si la traduction n\'a pas la structure de la recette', () => {
    const fewerSections = structuredClone(base)
    fewerSections.translation.sections.pop()
    expect(() => aiRecipeToBilingual(fewerSections)).toThrow(TranslationShapeError)
    const fewerIngredients = structuredClone(base)
    fewerIngredients.translation.sections[0]!.ingredients.pop()
    expect(() => aiRecipeToBilingual(fewerIngredients)).toThrow(TranslationShapeError)
    const fewerSteps = structuredClone(base)
    fewerSteps.translation.sections[1]!.instructions.pop()
    expect(() => aiRecipeToBilingual(fewerSteps)).toThrow(TranslationShapeError)
  })

  it('ignore des tags traduits qui ne correspondent plus un pour un', () => {
    const bad = structuredClone(base)
    bad.translation.tags = ['only one']
    expect(aiRecipeToBilingual(bad).translation.tags).toEqual([])
  })
})

describe('translationDraftSchema', () => {
  it('accepte une traduction, normalise les null et refuse un titre vide', () => {
    const ok = translationDraftSchema.parse({ title: ' T ', content: { sections: [{ name: '', ingredients: [{ name: 'a' }], instructions: ['x'] }] } })
    expect(ok).toMatchObject({ title: 'T', description: null, notes: null, tags: [] })
    expect(ok.content.sections[0]!.ingredients[0]).toEqual({ name: 'a', amount: null, unit: null })
    expect(translationDraftSchema.safeParse({ title: ' ', content: { sections: [] } }).success).toBe(false)
    expect(translationDraftSchema.safeParse({ title: 'T' }).success).toBe(false)
  })
})
