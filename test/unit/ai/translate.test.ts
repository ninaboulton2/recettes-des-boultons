import { describe, expect, it } from 'vitest'
import { APICallError, LoadAPIKeyError } from 'ai'
import { aiRecipeSchema } from '#shared/schemas/ai'
import { aiTranslateExistingSchema } from '#shared/schemas/translation'
import { recipeTexts, type RecipeTexts } from '#shared/utils/translation'
import { createMockRecipeModel, mockPrefix, MOCK_RECIPE } from '../../../server/utils/ai/mock'
import { translateRecipeText, translateRecipeTexts } from '../../../server/utils/ai/translate'
import { AI_ERROR_MESSAGES, throwAiProviderError } from '../../../server/utils/ai/errors'
import { AiConfigError } from '../../../server/utils/ai/provider'
import { buildSystemPrompt, buildTranslateSystemPrompt } from '../../../server/utils/ai/prompt'

const SAMPLE = `TEST_3D_Chocolate chip cookies\n\n2 cups flour\n1 cup butter\nBake at 350°F for 12 minutes.`

describe('translateRecipeText (fournisseur mock)', () => {
  it('renvoie une recette validée par aiRecipeSchema, titrée d\'après la première ligne', async () => {
    const model = createMockRecipeModel()
    const { recipe, usage } = await translateRecipeText(model, SAMPLE)
    expect(aiRecipeSchema.safeParse(recipe).success).toBe(true)
    expect(recipe.title).toBe('TEST_3D_Chocolate chip cookies')
    expect(recipe.sections).toEqual(MOCK_RECIPE.sections)
    expect(usage.inputTokens).toBeGreaterThan(0)
    expect(usage.outputTokens).toBeGreaterThan(0)
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  it('détecte la langue du texte et fournit la traduction préfixée dans l\'autre langue', async () => {
    const fr = await translateRecipeText(createMockRecipeModel(), 'Gâteau au yaourt\n\nMélanger la farine avec le sucre et les œufs, puis cuire au four.')
    expect(fr.recipe.sourceLanguage).toBe('fr')
    expect(fr.recipe.translation.title).toBe(`${mockPrefix('en')}Gâteau au yaourt`)
    expect(fr.recipe.translation.sections[0]!.ingredients[0]!.name).toBe(`${mockPrefix('en')}farine`)
    const en = await translateRecipeText(createMockRecipeModel(), SAMPLE)
    expect(en.recipe.sourceLanguage).toBe('en')
    expect(en.recipe.translation.title).toBe(`${mockPrefix('fr')}TEST_3D_Chocolate chip cookies`)
  })

  it('transmet le prompt système en français avec les deux langues et les codes d\'unité', async () => {
    const model = createMockRecipeModel()
    await translateRecipeText(model, SAMPLE)
    const call = model.doGenerateCalls[0]!
    const system = call.prompt.find(message => message.role === 'system')
    expect(system?.role).toBe('system')
    if (system?.role !== 'system') return
    expect(system.content).toContain('sourceLanguage')
    expect(system.content).toContain('STRUCTURE IDENTIQUE')
    expect(system.content).toContain('pincee')
    expect(system.content).toBe(buildSystemPrompt())
    // Sortie structurée demandée au fournisseur (schéma JSON transmis).
    expect(call.responseFormat?.type).toBe('json')
  })
})

describe('translateRecipeTexts (fournisseur mock)', () => {
  const texts: RecipeTexts = {
    title: 'Tarte aux pommes',
    description: 'Une tarte simple.',
    notes: null,
    tags: ['végétarien'],
    sections: [
      { name: 'Pâte', ingredients: [{ name: 'farine', amount: null, unit: null }, { name: 'sel', amount: 'au goût', unit: null }], instructions: [] },
      { name: '', ingredients: [], instructions: ['Cuire 40 min.'] }
    ]
  }

  it('traduit vers l\'autre langue en gardant exactement la structure', async () => {
    const model = createMockRecipeModel()
    const { sourceLanguage, translation, usage } = await translateRecipeTexts(model, texts)
    expect(sourceLanguage).toBe('fr')
    expect(translation.title).toBe('[EN] Tarte aux pommes')
    expect(translation.description).toBe('[EN] Une tarte simple.')
    expect(translation.notes).toBeNull()
    expect(translation.tags).toEqual(['[EN] végétarien'])
    expect(translation.content.sections[0]).toEqual({
      name: '[EN] Pâte',
      ingredients: [{ name: '[EN] farine', amount: null, unit: null }, { name: '[EN] sel', amount: '[EN] au goût', unit: null }],
      instructions: []
    })
    expect(translation.content.sections[1]!.name).toBe('')
    expect(translation.content.sections[1]!.instructions).toEqual(['[EN] Cuire 40 min.'])
    expect(usage.inputTokens).toBeGreaterThan(0)
    expect(model.doGenerateCalls[0]!.responseFormat).toMatchObject({ type: 'json', name: 'traduction' })
    const system = model.doGenerateCalls[0]!.prompt.find(message => message.role === 'system')
    expect(system?.role === 'system' ? system.content : '').toBe(buildTranslateSystemPrompt())
  })

  it('un texte anglais est traduit vers le français', async () => {
    const english: RecipeTexts = { ...texts, title: 'Apple pie', description: 'The best pie, with a cup of sugar.', tags: [],
      sections: [{ name: '', ingredients: [{ name: 'flour', amount: null, unit: null }], instructions: ['Mix the flour with the butter and bake until golden.'] }] }
    const { sourceLanguage, translation } = await translateRecipeTexts(createMockRecipeModel(), english)
    expect(sourceLanguage).toBe('en')
    expect(translation.title).toBe('[FR] Apple pie')
  })

  it('accepte les textes d\'une recette lue en base (recipeTexts)', async () => {
    const recipe = recipeTexts({
      title: 'Crêpes', description: null, notes: null, tags: [],
      sections: [{ name: '', orderIndex: 0, ingredients: [{ name: 'lait', amount: '1', unit: 'l', unitCode: 'l', orderIndex: 0 }],
        instructions: [{ content: 'Mélanger.', orderIndex: 0 }] }]
    })
    const { translation } = await translateRecipeTexts(createMockRecipeModel(), recipe)
    expect(aiTranslateExistingSchema.shape.translation.safeParse({ ...translation, ...translation.content }).success).toBe(true)
    expect(translation.content.sections[0]!.ingredients[0]).toEqual({ name: '[EN] lait', amount: null, unit: null })
  })
})

interface H3Like { statusCode: number, statusMessage?: string }

function mapped(error: unknown): H3Like {
  try {
    throwAiProviderError(error, 'test')
  } catch (thrown: unknown) {
    return thrown as H3Like
  }
  throw new Error('aucune erreur relancée')
}

const apiError = (statusCode: number) =>
  new APICallError({ message: `HTTP ${statusCode} detail technique`, url: 'https://api.example', requestBodyValues: {}, statusCode })

describe('throwAiProviderError', () => {
  it('clé absente ou refusée → 401 sans détail technique', () => {
    expect(mapped(new AiConfigError('Clé API absente'))).toMatchObject({ statusCode: 401, statusMessage: AI_ERROR_MESSAGES.apiKey })
    expect(mapped(new LoadAPIKeyError({ message: 'missing' }))).toMatchObject({ statusCode: 401 })
    expect(mapped(apiError(401))).toMatchObject({ statusCode: 401 })
    expect(mapped(apiError(403)).statusMessage).not.toContain('detail technique')
  })

  it('crédit fournisseur épuisé → 402, modèle/autre → 502, délai → 504', () => {
    expect(mapped(apiError(429))).toMatchObject({ statusCode: 402, statusMessage: AI_ERROR_MESSAGES.providerQuota })
    expect(mapped(apiError(402))).toMatchObject({ statusCode: 402 })
    expect(mapped(apiError(404))).toMatchObject({ statusCode: 502, statusMessage: AI_ERROR_MESSAGES.unavailable })
    expect(mapped(apiError(500))).toMatchObject({ statusCode: 502 })
    expect(mapped(apiError(504))).toMatchObject({ statusCode: 504, statusMessage: AI_ERROR_MESSAGES.timeout })
    const abort = new Error('aborted')
    abort.name = 'TimeoutError'
    expect(mapped(abort)).toMatchObject({ statusCode: 504 })
  })

  it('laisse passer les erreurs inconnues (gérées ensuite par handleApiError)', () => {
    expect(() => throwAiProviderError(new Error('autre'), 'test')).not.toThrow()
    expect(() => throwAiProviderError({ statusCode: 429 }, 'test')).not.toThrow()
  })
})
